import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApiApp } from "../src/http/api.ts";

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "docs-md-oidc-"));
}

function createRequest(
  pathname: string,
  init?: RequestInit & { body?: BodyInit | null },
): Request {
  return new Request(`http://docs.test${pathname}`, init);
}

function installFetchMock(
  handler: (input: string, init?: RequestInit) => Promise<Response> | Response,
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    return handler(url, init);
  }) as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("OIDC setup, authorize, and callback complete an API login roundtrip", async () => {
  const restoreFetch = installFetchMock(async (url, init) => {
    if (url === "https://issuer.example/.well-known/openid-configuration") {
      return Response.json({
        authorization_endpoint: "https://issuer.example/oauth/authorize",
        token_endpoint: "https://issuer.example/oauth/token",
        userinfo_endpoint: "https://issuer.example/oauth/userinfo",
      });
    }

    if (url === "https://issuer.example/oauth/token") {
      assert.equal(init?.method, "POST");
      const params = new URLSearchParams(String(init?.body ?? ""));
      assert.equal(params.get("grant_type"), "authorization_code");
      assert.equal(params.get("client_id"), "client-123");
      assert.equal(params.get("client_secret"), "secret-456");
      assert.equal(params.get("code"), "code-789");
      assert.equal(params.get("redirect_uri"), "http://127.0.0.1/auth/oidc/callback");
      assert.ok(params.get("code_verifier"));
      return Response.json({ access_token: "access-token-123" });
    }

    if (url === "https://issuer.example/oauth/userinfo") {
      assert.equal(init?.headers instanceof Headers ? init.headers.get("Authorization") : undefined, undefined);
      const headers = init?.headers as Record<string, string> | undefined;
      assert.equal(headers?.Authorization, "Bearer access-token-123");
      return Response.json({
        sub: "user-oidc-1",
        preferred_username: "oidc-user",
        name: "OIDC User",
      });
    }

    throw new Error(`Unexpected fetch url: ${url}`);
  });

  try {
    const app = createApiApp({ workspaceRoot: createWorkspace() });

    const setupResponse = await app.fetch(
      createRequest("/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: "oidc",
          issuer: "https://issuer.example",
          clientId: "client-123",
          clientSecret: "secret-456",
          providerName: "Example SSO",
        }),
      }),
    );
    assert.equal(setupResponse.status, 200);
    const setupPayload = await setupResponse.json();
    assert.equal(setupPayload.data.authMethod, "oidc");
    assert.deepEqual(setupPayload.data.oidcProvider, {
      name: "Example SSO",
      issuer: "https://issuer.example",
    });

    const authorizeResponse = await app.fetch(createRequest("/auth/oidc/authorize"));
    assert.equal(authorizeResponse.status, 200);
    const authorizePayload = await authorizeResponse.json();
    const redirectUrl = new URL(authorizePayload.data.redirectUrl as string);
    assert.equal(redirectUrl.origin + redirectUrl.pathname, "https://issuer.example/oauth/authorize");
    assert.equal(redirectUrl.searchParams.get("client_id"), "client-123");
    const state = redirectUrl.searchParams.get("state");
    assert.ok(state);

    const callbackResponse = await app.fetch(
      createRequest(`/auth/oidc/callback?code=code-789&state=${encodeURIComponent(state ?? "")}`),
    );
    assert.equal(callbackResponse.status, 302);
    assert.equal(callbackResponse.headers.get("location"), "http://127.0.0.1/");

    const setCookie = callbackResponse.headers.get("set-cookie") ?? "";
    const sessionIdMatch = /session_id=([^;]+)/.exec(setCookie);
    assert.ok(sessionIdMatch);
    const sessionId = decodeURIComponent(sessionIdMatch[1]);

    const sessionResponse = await app.fetch(
      createRequest("/auth/session", {
        headers: { "x-session-id": sessionId },
      }),
    );
    assert.equal(sessionResponse.status, 200);
    const sessionPayload = await sessionResponse.json();
    assert.equal(sessionPayload.data.username, "oidc-user");
    assert.equal(sessionPayload.data.provider, "oidc");
  } finally {
    restoreFetch();
  }
});

test("OIDC setup returns a discovery failure when the provider metadata fetch fails", async () => {
  const restoreFetch = installFetchMock(async () => {
    throw new Error("boom");
  });

  try {
    const app = createApiApp({ workspaceRoot: createWorkspace() });
    const response = await app.fetch(
      createRequest("/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: "oidc",
          issuer: "https://issuer.example",
          clientId: "client-123",
          clientSecret: "secret-456",
          providerName: "Example SSO",
        }),
      }),
    );

    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.equal(payload.error.code, "OIDC_DISCOVERY_FAILED");
  } finally {
    restoreFetch();
  }
});
