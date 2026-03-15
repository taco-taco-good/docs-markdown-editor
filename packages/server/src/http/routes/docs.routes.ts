import type { FrontmatterValue } from "../../../../shared/src/frontmatter.ts";
import {
  type ApiContext,
  type RequestActor,
  jsonResponse,
  readJson,
  decodeRoutePath,
  toApiDocument,
  publishDocumentSnapshot,
} from "../api-helpers.ts";

export async function handleDocsRoutes(
  request: Request,
  pathname: string,
  actor: RequestActor,
  ctx: ApiContext,
): Promise<Response | null> {
  const docsPath = decodeRoutePath(pathname, "/api/docs/");
  if (docsPath === null || docsPath === "") return null;

  if (request.method === "GET") {
    return jsonResponse(200, { data: toApiDocument(ctx.documentService.read(docsPath), ctx.documentService) });
  }

  if (request.method === "DELETE") {
    if (!ctx.documentService.exists(docsPath)) {
      throw new Error("NOT_FOUND");
    }
    ctx.documentService.delete(docsPath, actor);
    ctx.searchService.buildIndex();
    ctx.realtimeService.publish({ type: "file:deleted", path: docsPath });
    ctx.realtimeService.publish({ type: "tree:changed" });
    return new Response(null, { status: 204 });
  }

  if (request.method === "PUT" || request.method === "PATCH") {
    const body = await readJson(request);
    const hasContent = typeof body.content === "string";
    const hasTemplate =
      typeof request.headers.get("x-template") === "string" ||
      typeof body.template === "string";
    const hasFrontmatter =
      body.frontmatter !== null &&
      typeof body.frontmatter === "object" &&
      !Array.isArray(body.frontmatter);

    if (!hasContent && !hasFrontmatter && !hasTemplate) {
      throw new Error("VALIDATION_ERROR");
    }

    const existed = ctx.documentService.exists(docsPath);
    if (request.method === "PATCH" && !existed) {
      throw new Error("NOT_FOUND");
    }

    let document = existed
      ? ctx.documentService.read(docsPath)
      : ctx.documentService.create(docsPath, {
          template:
            request.headers.get("x-template") ??
            (typeof body.template === "string" ? body.template : undefined),
          title:
            hasFrontmatter && typeof (body.frontmatter as Record<string, unknown>).title === "string"
              ? String((body.frontmatter as Record<string, unknown>).title)
              : undefined,
          author: actor.username,
          provider: actor.provider,
        });

    if (hasContent) {
      document = ctx.documentService.write(docsPath, String(body.content), actor);
    }

    if (hasFrontmatter) {
      document = ctx.documentService.updateFrontmatter(
        docsPath,
        body.frontmatter as Record<string, FrontmatterValue>,
        actor,
      );
    }

    if (!existed || document.changed) {
      ctx.searchService.buildIndex();
      publishDocumentSnapshot(ctx, docsPath, existed ? "file:updated" : "file:created");
      ctx.realtimeService.publish({ type: "tree:changed" });
    }
    const status = existed ? 200 : 201;
    return jsonResponse(status, { data: toApiDocument(document, ctx.documentService) });
  }

  return null;
}
