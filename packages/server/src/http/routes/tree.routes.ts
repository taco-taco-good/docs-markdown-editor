import {
  type ApiContext,
  type RequestActor,
  jsonResponse,
  readJson,
  decodeRoutePath,
} from "../api-helpers.ts";
import {
  buildTree,
  createWorkspaceDirectory,
  deleteWorkspaceEntry,
  moveWorkspaceEntry,
  type WorkspaceMovePlacement,
} from "../../lib/workspace.ts";

export async function handleTreeRoutes(
  request: Request,
  pathname: string,
  url: URL,
  actor: RequestActor,
  ctx: ApiContext,
): Promise<Response | null> {
  if (request.method === "POST" && pathname === "/api/tree/move") {
    const body = await readJson(request);
    if (typeof body.from !== "string") {
      throw new Error("VALIDATION_ERROR");
    }
    const placement = typeof body.placement === "string" ? body.placement as WorkspaceMovePlacement : "path";
    const legacyTo = typeof body.to === "string" ? body.to : "";
    const targetPath = typeof body.targetPath === "string" ? body.targetPath : legacyTo;
    if (placement === "path" && !legacyTo) {
      throw new Error("VALIDATION_ERROR");
    }
    if ((placement === "inside" || placement === "before" || placement === "after") && !targetPath) {
      throw new Error("VALIDATION_ERROR");
    }

    const moved = moveWorkspaceEntry(ctx.workspaceRoot, body.from, targetPath, placement);
    ctx.searchService.buildIndex();
    if (moved.type === "file") {
      ctx.realtimeService.publish({ type: "file:moved", from: moved.from, to: moved.to });
      const movedDocument = ctx.documentService.read(moved.to);
      ctx.realtimeService.publish({
        type: "doc:content",
        path: moved.to,
        content: movedDocument.content,
      });
    }
    if (moved.type === "directory") {
      ctx.realtimeService.publish({ type: "dir:moved", from: moved.from, to: moved.to });
    }
    ctx.realtimeService.publish({ type: "tree:changed" });
    return jsonResponse(200, { data: moved });
  }

  if (request.method === "POST" && pathname === "/api/tree/dirs") {
    const body = await readJson(request);
    if (typeof body.path !== "string" || body.path.trim() === "") {
      throw new Error("VALIDATION_ERROR");
    }
    const createdPath = createWorkspaceDirectory(ctx.workspaceRoot, body.path);
    ctx.realtimeService.publish({ type: "dir:created", path: createdPath });
    ctx.realtimeService.publish({ type: "tree:changed" });
    return jsonResponse(201, { data: { path: createdPath } });
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/tree/dirs/")) {
    const targetPath = decodeRoutePath(pathname, "/api/tree/dirs/");
    if (!targetPath) throw new Error("NOT_FOUND");
    const deleted = deleteWorkspaceEntry(ctx.workspaceRoot, targetPath);
    ctx.realtimeService.publish({ type: deleted.type === "directory" ? "dir:deleted" : "file:deleted", path: deleted.path });
    ctx.realtimeService.publish({ type: "tree:changed" });
    return new Response(null, { status: 204 });
  }

  if (request.method === "GET" && pathname === "/api/tree") {
    const depthParam = url.searchParams.get("depth");
    const depth = depthParam ? Number(depthParam) : Number.POSITIVE_INFINITY;
    if (Number.isNaN(depth) || depth < 1) {
      throw new Error("VALIDATION_ERROR");
    }
    return jsonResponse(200, { data: buildTree(ctx.workspaceRoot, "", depth) });
  }

  if (request.method === "GET" && pathname.startsWith("/api/tree/")) {
    const treePath = decodeRoutePath(pathname, "/api/tree/");
    if (!treePath) throw new Error("NOT_FOUND");
    return jsonResponse(200, { data: buildTree(ctx.workspaceRoot, treePath) });
  }

  return null;
}
