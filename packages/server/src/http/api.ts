import path from "node:path";
import { AuthService } from "../services/auth.service.ts";
import { AssetService } from "../services/asset.service.ts";
import { AuditService } from "../services/audit.service.ts";
import { DocumentService } from "../services/document.service.ts";
import { RealtimeService } from "../services/realtime.service.ts";
import { SearchService } from "../services/search.service.ts";
import { TemplateService } from "../services/template.service.ts";
import {
  type ApiContext,
  jsonResponse,
  errorResponse,
  readJson,
  authenticateRequest,
  mapError,
} from "./api-helpers.ts";
import { handleAuthRoutes } from "./routes/auth.routes.ts";
import { handleTreeRoutes } from "./routes/tree.routes.ts";
import { handleDocsRoutes } from "./routes/docs.routes.ts";
import { handleTemplateRoutes } from "./routes/templates.routes.ts";
import { handleAssetRoutes } from "./routes/assets.routes.ts";

interface ApiServices {
  workspaceRoot: string;
  auditService?: AuditService;
  authService?: AuthService;
  assetService?: AssetService;
  documentService?: DocumentService;
  realtimeService?: RealtimeService;
  searchService?: SearchService;
  templateService?: TemplateService;
}

export function createApiApp(options: ApiServices) {
  const auditService = options.auditService ?? new AuditService(options.workspaceRoot);
  const authService = options.authService ?? new AuthService(options.workspaceRoot);
  const assetService = options.assetService ?? new AssetService(options.workspaceRoot);
  const templateService = options.templateService ?? new TemplateService(options.workspaceRoot);
  const documentService =
    options.documentService ?? new DocumentService(options.workspaceRoot, auditService, templateService);
  const realtimeService = options.realtimeService ?? new RealtimeService();
  const searchService = options.searchService ?? new SearchService(options.workspaceRoot);

  searchService.buildIndex();

  const ctx: ApiContext = {
    workspaceRoot: options.workspaceRoot,
    authService,
    auditService,
    assetService,
    documentService,
    realtimeService,
    searchService,
    templateService,
  };

  async function fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Health check (public)
      if (request.method === "GET" && pathname === "/api/health") {
        return jsonResponse(200, { data: { status: "ok" } });
      }

      // Auth routes (mostly public)
      if (pathname.startsWith("/auth/")) {
        const response = await handleAuthRoutes(request, pathname, ctx);
        if (response) return response;
      }

      // All /api/ routes require authentication
      if (pathname.startsWith("/api/")) {
        const actor = await authenticateRequest(request, ctx);

        // SSE event stream
        if (request.method === "GET" && pathname === "/api/events") {
          void actor;
          return realtimeService.createEventStream();
        }

        // Workspace info
        if (request.method === "GET" && pathname === "/api/info") {
          return jsonResponse(200, {
            data: {
              workspaceRoot: options.workspaceRoot,
              workspaceName: path.basename(options.workspaceRoot),
            },
          });
        }

        // Search
        if (request.method === "POST" && pathname === "/api/search") {
          const body = await readJson(request);
          if (typeof body.query !== "string" || body.query.trim() === "") {
            throw new Error("VALIDATION_ERROR");
          }
          const limit = typeof body.limit === "number" ? body.limit : 10;
          return jsonResponse(200, { data: searchService.search(body.query, limit) });
        }

        // Delegate to route modules
        const treeResponse = await handleTreeRoutes(request, pathname, url, actor, ctx);
        if (treeResponse) return treeResponse;

        const assetResponse = await handleAssetRoutes(request, pathname, actor, ctx);
        if (assetResponse) return assetResponse;

        const templateResponse = await handleTemplateRoutes(request, pathname, actor, ctx);
        if (templateResponse) return templateResponse;

        const docsResponse = await handleDocsRoutes(request, pathname, actor, ctx);
        if (docsResponse) return docsResponse;

        void actor;
      }

      return errorResponse(404, "NOT_FOUND", "Requested resource was not found");
    } catch (error) {
      return mapError(error);
    }
  }

  return {
    authService,
    auditService,
    documentService,
    fetch,
    realtimeService,
    searchService,
    /** Inject the watcher so save routes can suppress echo events. */
    setWatcherService(watcher: { suppressNextChange(filePath: string): void }) {
      ctx.watcherService = watcher;
    },
  };
}
