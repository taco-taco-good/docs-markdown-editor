import {
  type ApiContext,
  type RequestActor,
  jsonResponse,
  readJson,
  decodeRoutePath,
} from "../api-helpers.ts";

export async function handleTemplateRoutes(
  request: Request,
  pathname: string,
  actor: RequestActor,
  ctx: ApiContext,
): Promise<Response | null> {
  if (request.method === "GET" && pathname === "/api/templates") {
    return jsonResponse(200, { data: ctx.templateService.listTemplates() });
  }

  if (request.method === "POST" && pathname === "/api/templates") {
    const body = await readJson(request);
    if (
      typeof body.name !== "string" ||
      body.name.trim() === "" ||
      typeof body.content !== "string"
    ) {
      throw new Error("VALIDATION_ERROR");
    }
    if (ctx.templateService.hasTemplate(body.name.trim())) {
      throw new Error("ALREADY_EXISTS");
    }
    return jsonResponse(201, {
      data: ctx.templateService.writeTemplate(body.name.trim(), body.content),
    });
  }

  if (request.method === "GET" && pathname.startsWith("/api/templates/")) {
    const templateName = decodeRoutePath(pathname, "/api/templates/");
    if (!templateName) throw new Error("NOT_FOUND");
    return jsonResponse(200, { data: ctx.templateService.readTemplate(templateName) });
  }

  if (request.method === "PATCH" && pathname.startsWith("/api/templates/")) {
    const templateName = decodeRoutePath(pathname, "/api/templates/");
    if (!templateName) throw new Error("NOT_FOUND");
    const body = await readJson(request);
    if (typeof body.content !== "string") {
      throw new Error("VALIDATION_ERROR");
    }
    if (!ctx.templateService.hasTemplate(templateName)) {
      throw new Error("NOT_FOUND");
    }
    return jsonResponse(200, {
      data: ctx.templateService.writeTemplate(templateName, body.content),
    });
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/templates/")) {
    const templateName = decodeRoutePath(pathname, "/api/templates/");
    if (!templateName) throw new Error("NOT_FOUND");
    ctx.templateService.deleteTemplate(templateName);
    return new Response(null, { status: 204 });
  }

  return null;
}
