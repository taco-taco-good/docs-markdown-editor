import {
  type ApiContext,
  type RequestActor,
  jsonResponse,
  decodeRoutePath,
} from "../api-helpers.ts";

export async function handleAssetRoutes(
  request: Request,
  pathname: string,
  actor: RequestActor,
  ctx: ApiContext,
): Promise<Response | null> {
  if (request.method === "POST" && pathname.startsWith("/api/assets/")) {
    const docPath = decodeRoutePath(pathname, "/api/assets/");
    if (!docPath) throw new Error("NOT_FOUND");
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("VALIDATION_ERROR");
    }
    const uploaded = await ctx.assetService.uploadAsset(docPath, file);
    return jsonResponse(201, { data: uploaded });
  }

  if (request.method === "GET" && pathname.startsWith("/api/assets/")) {
    const assetPath = decodeRoutePath(pathname, "/api/assets/");
    if (!assetPath) throw new Error("NOT_FOUND");
    const asset = ctx.assetService.readAsset(assetPath);
    const ifModifiedSince = request.headers.get("if-modified-since");
    if (ifModifiedSince && new Date(ifModifiedSince).getTime() >= new Date(asset.lastModified).getTime()) {
      return new Response(null, {
        status: 304,
        headers: {
          "cache-control": "public, max-age=3600",
          "last-modified": asset.lastModified,
        },
      });
    }

    return new Response(asset.body, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": asset.contentType,
        "last-modified": asset.lastModified,
      },
    });
  }

  return null;
}
