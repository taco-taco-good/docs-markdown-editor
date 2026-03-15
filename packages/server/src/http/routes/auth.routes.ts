import {
  type ApiContext,
  jsonResponse,
  errorResponse,
  readJson,
  decodeRoutePath,
  getSessionIdFromRequest,
  getClientKey,
  requestIsSecure,
  buildSessionCookie,
  clearSessionCookie,
  authenticateRequest,
} from "../api-helpers.ts";

function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/auth/oidc/callback`;
}

export async function handleAuthRoutes(
  request: Request,
  pathname: string,
  ctx: ApiContext,
): Promise<Response | null> {
  // ── Public: App status ──
  if (request.method === "GET" && pathname === "/auth/status") {
    return jsonResponse(200, { data: ctx.authService.getAppStatus() });
  }

  // ── Public: Initial setup ──
  if (request.method === "POST" && pathname === "/auth/setup") {
    const body = await readJson(request);
    const method = body.method;

    if (method === "local") {
      if (typeof body.username !== "string" || typeof body.password !== "string") {
        throw new Error("VALIDATION_ERROR");
      }
      const session = ctx.authService.setupLocal(
        body.username,
        body.password,
        typeof body.displayName === "string" ? body.displayName : undefined,
      );
      const secure = requestIsSecure(request);
      return jsonResponse(
        200,
        { data: { ...ctx.authService.getAppStatus(), username: session.username } },
        { "set-cookie": buildSessionCookie(session.sessionId, secure) },
      );
    }

    if (method === "oidc") {
      if (
        typeof body.issuer !== "string" || body.issuer.trim() === "" ||
        typeof body.clientId !== "string" || body.clientId.trim() === "" ||
        typeof body.clientSecret !== "string" ||
        typeof body.providerName !== "string" || body.providerName.trim() === ""
      ) {
        throw new Error("VALIDATION_ERROR");
      }
      await ctx.authService.setupOidc({
        issuer: body.issuer.trim(),
        clientId: body.clientId.trim(),
        clientSecret: body.clientSecret,
        providerName: body.providerName.trim(),
      });
      return jsonResponse(200, { data: ctx.authService.getAppStatus() });
    }

    throw new Error("VALIDATION_ERROR");
  }

  // ── Public: Login ──
  if (request.method === "POST" && pathname === "/auth/login") {
    const body = await readJson(request);
    if (typeof body.username !== "string" || typeof body.password !== "string") {
      throw new Error("VALIDATION_ERROR");
    }
    const session = ctx.authService.loginWithPassword(
      body.username,
      body.password,
      getClientKey(request),
    );
    const secure = requestIsSecure(request);
    return jsonResponse(
      200,
      { data: session },
      { "set-cookie": buildSessionCookie(session.sessionId, secure) },
    );
  }

  // ── Public: Session check ──
  if (request.method === "GET" && pathname === "/auth/session") {
    const sessionId = getSessionIdFromRequest(request);
    if (!sessionId) throw new Error("UNAUTHORIZED");
    const session = ctx.authService.authenticateSession(sessionId);
    if (!session) throw new Error("UNAUTHORIZED");
    return jsonResponse(200, {
      data: {
        sessionId: session.sessionId,
        username: session.username,
        provider: session.provider,
      },
    });
  }

  // ── Public: Logout ──
  if (request.method === "POST" && pathname === "/auth/logout") {
    const sessionId = getSessionIdFromRequest(request);
    if (sessionId) {
      ctx.authService.logoutSession(sessionId);
    }
    const secure = requestIsSecure(request);
    return jsonResponse(
      200,
      { data: { success: true } },
      { "set-cookie": clearSessionCookie(secure) },
    );
  }

  // ── OIDC: Begin authorize ──
  if (request.method === "GET" && pathname === "/auth/oidc/authorize") {
    const redirectUri = getRedirectUri(request);
    const result = ctx.authService.beginOidcAuthorize(redirectUri);
    return jsonResponse(200, { data: result });
  }

  // ── OIDC: Callback ──
  if (request.method === "GET" && pathname === "/auth/oidc/callback") {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      return Response.redirect(`${url.origin}/?auth_error=${encodeURIComponent(errorParam)}`, 302);
    }

    if (!code || !state) {
      return Response.redirect(`${url.origin}/?auth_error=missing_params`, 302);
    }

    try {
      const redirectUri = getRedirectUri(request);
      const session = await ctx.authService.handleOidcCallback(code, state, redirectUri);
      const secure = requestIsSecure(request);
      return new Response(null, {
        status: 302,
        headers: {
          location: `${url.origin}/`,
          "set-cookie": buildSessionCookie(session.sessionId, secure),
        },
      });
    } catch {
      return Response.redirect(`${url.origin}/?auth_error=callback_failed`, 302);
    }
  }

  // ── Authenticated: List tokens ──
  if (request.method === "GET" && pathname === "/auth/tokens") {
    const actor = await authenticateRequest(request, ctx);
    const tokens = ctx.authService.listPersonalAccessTokens(actor.actorId);
    return jsonResponse(200, { data: tokens });
  }

  // ── Authenticated: Create token ──
  if (request.method === "POST" && pathname === "/auth/tokens") {
    const actor = await authenticateRequest(request, ctx);
    if (actor.provider === "pat") {
      return errorResponse(403, "FORBIDDEN", "PAT minting requires an authenticated session");
    }
    const body = await readJson(request);
    if (typeof body.name !== "string" || body.name.trim() === "") {
      throw new Error("VALIDATION_ERROR");
    }
    const token = ctx.authService.issuePersonalAccessToken(actor.actorId, body.name.trim());
    return jsonResponse(201, { data: token });
  }

  // ── Authenticated: Revoke token ──
  if (request.method === "DELETE" && pathname.startsWith("/auth/tokens/")) {
    const actor = await authenticateRequest(request, ctx);
    const tokenId = decodeRoutePath(pathname, "/auth/tokens/");
    if (!tokenId) throw new Error("NOT_FOUND");
    const revoked = ctx.authService.revokePersonalAccessToken(tokenId, actor.actorId);
    if (!revoked) throw new Error("NOT_FOUND");
    return new Response(null, { status: 204 });
  }

  return null;
}
