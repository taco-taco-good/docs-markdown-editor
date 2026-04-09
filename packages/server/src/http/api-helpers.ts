import type { FrontmatterValue } from "../../../shared/src/frontmatter.ts";
import { AuthService, type AuthenticatedSession } from "../services/auth.service.ts";
import { AssetService } from "../services/asset.service.ts";
import { AuditService } from "../services/audit.service.ts";
import {
  DocumentService,
  type DocumentActor,
  type ReadDocumentResult,
} from "../services/document.service.ts";
import { RealtimeService } from "../services/realtime.service.ts";
import { SearchService } from "../services/search.service.ts";
import { TemplateService } from "../services/template.service.ts";
import { VersioningService } from "../services/versioning.service.ts";

// ── Types ──

export interface RequestActor extends DocumentActor {
  username: string;
}

export interface ApiDocument {
  meta: {
    path: string;
    title: string;
    frontmatter: Record<string, FrontmatterValue>;
    size: number;
    modifiedAt: string;
    revision: string;
  };
  content: string;
  raw: string;
  supportedInWysiwyg: boolean;
}

export interface ApiContext {
  workspaceRoot: string;
  authService: AuthService;
  auditService: AuditService;
  assetService: AssetService;
  documentService: DocumentService;
  realtimeService: RealtimeService;
  searchService: SearchService;
  templateService: TemplateService;
  versioningService?: VersioningService;
  watcherService?: { suppressNextChange(filePath: string): void };
}

// ── Response helpers ──

export function jsonResponse(status: number, payload: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
  return jsonResponse(status, {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  });
}

// ── Request helpers ──

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export function decodeRoutePath(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const encoded = pathname.slice(prefix.length);
  if (!encoded) return "";
  return decodeURIComponent(encoded);
}

export function getSessionIdFromRequest(request: Request): string | null {
  const headerValue = request.headers.get("x-session-id");
  if (headerValue) return headerValue;

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const match = /(?:^|;\s*)session_id=([^;]+)/.exec(cookieHeader);
  return match ? decodeURIComponent(match[1]) : null;
}

function trustProxy(): boolean {
  return process.env.TRUST_PROXY === "true";
}

export function getClientKey(request: Request): string {
  if (trustProxy()) {
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (forwardedFor) return forwardedFor;
    if (realIp) return realIp;
  }
  return "unknown";
}

export function getEditorClientIdFromRequest(request: Request): string | null {
  const clientId = request.headers.get("x-client-id")?.trim();
  return clientId ? clientId : null;
}

export function requestIsSecure(request: Request): boolean {
  if (trustProxy()) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    if (forwardedProto === "https") return true;
  }
  return new URL(request.url).protocol === "https:";
}

// ── Cookie helpers ──

export function buildSessionCookie(sessionId: string, secure: boolean): string {
  return [
    `session_id=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return [
    "session_id=",
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

// ── Converters ──

export function toApiDocument(document: ReadDocumentResult, documentService: DocumentService): ApiDocument {
  const stats = documentService.stat(document.path);
  return {
    meta: {
      path: document.path,
      title: document.title,
      frontmatter: document.frontmatter,
      size: stats.size,
      modifiedAt: stats.modifiedAt,
      revision: document.revision,
    },
    content: document.content,
    raw: document.raw,
    supportedInWysiwyg: document.supportedInWysiwyg,
  };
}

export function toActor(session: AuthenticatedSession): RequestActor {
  return {
    actorId: session.userId,
    provider: session.provider,
    username: session.username,
  };
}

// ── Auth ──

export async function authenticateRequest(request: Request, ctx: ApiContext): Promise<RequestActor> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length);
    const authenticated = ctx.authService.authenticatePersonalAccessToken(token);
    if (!authenticated) {
      throw new Error("UNAUTHORIZED");
    }
    return {
      actorId: authenticated.userId,
      provider: "pat",
      username: authenticated.userId,
    };
  }

  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) {
    throw new Error("UNAUTHORIZED");
  }

  const session = ctx.authService.authenticateSession(sessionId);
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }

  return toActor(session);
}

// ── Error mapping ──

export function mapError(error: unknown): Response {
  if (!(error instanceof Error)) {
    return errorResponse(500, "INTERNAL_ERROR", "Unexpected server error");
  }

  if ("code" in error && error.code === "ENOENT") {
    return errorResponse(404, "NOT_FOUND", "Requested resource was not found");
  }

  switch (error.message) {
    case "ALREADY_EXISTS":
      return errorResponse(409, "ALREADY_EXISTS", "Document already exists");
    case "INVALID_JSON":
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
    case "NOT_A_DIRECTORY":
      return errorResponse(400, "NOT_A_DIRECTORY", "Requested path is not a directory");
    case "NOT_FOUND":
      return errorResponse(404, "NOT_FOUND", "Requested resource was not found");
    case "INVALID_MOVE":
      return errorResponse(400, "INVALID_MOVE", "Requested move is invalid");
    case "PATH_TRAVERSAL":
      return errorResponse(403, "PATH_TRAVERSAL", "Invalid path");
    case "UNAUTHORIZED":
      return errorResponse(401, "UNAUTHORIZED", "Authentication required");
    case "TOO_MANY_ATTEMPTS":
      return errorResponse(429, "TOO_MANY_ATTEMPTS", "Too many login attempts. Try again shortly.");
    case "VALIDATION_ERROR":
      return errorResponse(400, "VALIDATION_ERROR", "Request payload is invalid");
    case "ALREADY_INITIALIZED":
      return errorResponse(409, "ALREADY_INITIALIZED", "Application is already configured");
    case "OIDC_DISCOVERY_FAILED":
      return errorResponse(502, "OIDC_DISCOVERY_FAILED", "Failed to fetch OIDC provider configuration");
    case "OIDC_NOT_CONFIGURED":
      return errorResponse(400, "OIDC_NOT_CONFIGURED", "OIDC is not configured");
    case "OIDC_CALLBACK_FAILED":
      return errorResponse(401, "OIDC_CALLBACK_FAILED", "OIDC authentication failed");
    case "INVALID_STATE":
      return errorResponse(400, "INVALID_STATE", "Invalid or expired OIDC state");
    case "ASSET_TOO_LARGE":
      return errorResponse(413, "ASSET_TOO_LARGE", "Uploaded asset exceeds the maximum size limit");
    case "UNSUPPORTED_ASSET_TYPE":
      return errorResponse(415, "UNSUPPORTED_ASSET_TYPE", "Uploaded asset type is not allowed");
    case "Frontmatter requires raw mode for safe editing":
      return errorResponse(
        409,
        "UNSAFE_FRONTMATTER_EDIT",
        "Frontmatter cannot be safely rewritten in structured mode",
      );
    default:
      return errorResponse(500, "INTERNAL_ERROR", error.message);
  }
}

// ── Publish helper ──

export function publishDocumentSnapshot(
  ctx: ApiContext,
  path: string,
  eventType: "file:created" | "file:updated",
  originClientId: string | null = null,
): void {
  // Tell the watcher to skip the next change for this file — the save route
  // already publishes a proper event with originClientId, so the watcher's
  // duplicate broadcast (with originClientId: null) would cause a feedback loop.
  ctx.watcherService?.suppressNextChange(path);

  const document = ctx.documentService.read(path);
  ctx.realtimeService.publish({ type: eventType, path });
  ctx.realtimeService.publish({
    type: "doc:content",
    path,
    content: document.content,
    raw: document.raw,
    revision: document.revision,
    frontmatter: document.frontmatter,
    originClientId,
  });
}
