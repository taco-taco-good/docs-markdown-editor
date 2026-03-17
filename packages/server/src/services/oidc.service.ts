import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const OIDC_STATE_TTL_MS = 10 * 60 * 1000;

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  providerName: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
}

export interface OidcUserInfo {
  sub: string;
  preferredUsername: string;
  displayName: string;
}

export class OidcService {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  // ── Config helpers ──

  private getConfig(key: string): string | null {
    const row = this.database
      .prepare("SELECT value FROM app_config WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private setConfig(key: string, value: string): void {
    this.database
      .prepare("INSERT OR REPLACE INTO app_config(key, value) VALUES(?, ?)")
      .run(key, value);
  }

  // ── Setup ──

  async setup(config: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    providerName: string;
  }): Promise<OidcConfig> {
    const discoveryUrl = config.issuer.replace(/\/+$/, "") + "/.well-known/openid-configuration";
    let discovery: Record<string, unknown>;
    try {
      const res = await globalThis.fetch(discoveryUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      discovery = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new Error("OIDC_DISCOVERY_FAILED");
    }

    const authorizationEndpoint = discovery.authorization_endpoint as string;
    const tokenEndpoint = discovery.token_endpoint as string;
    const userinfoEndpoint = discovery.userinfo_endpoint as string;

    if (!authorizationEndpoint || !tokenEndpoint) {
      throw new Error("OIDC_DISCOVERY_FAILED");
    }

    this.setConfig("auth_method", "oidc");
    this.setConfig("oidc_issuer", config.issuer);
    this.setConfig("oidc_client_id", config.clientId);
    this.setConfig("oidc_client_secret", config.clientSecret);
    this.setConfig("oidc_provider_name", config.providerName);
    this.setConfig("oidc_authorization_endpoint", authorizationEndpoint);
    this.setConfig("oidc_token_endpoint", tokenEndpoint);
    this.setConfig("oidc_userinfo_endpoint", userinfoEndpoint || "");

    return {
      issuer: config.issuer,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      providerName: config.providerName,
      authorizationEndpoint,
      tokenEndpoint,
      userinfoEndpoint: userinfoEndpoint || "",
    };
  }

  getConfig_(): OidcConfig | null {
    if (this.getConfig("auth_method") !== "oidc") return null;
    return {
      issuer: this.getConfig("oidc_issuer") ?? "",
      clientId: this.getConfig("oidc_client_id") ?? "",
      clientSecret: this.getConfig("oidc_client_secret") ?? "",
      providerName: this.getConfig("oidc_provider_name") ?? "OIDC",
      authorizationEndpoint: this.getConfig("oidc_authorization_endpoint") ?? "",
      tokenEndpoint: this.getConfig("oidc_token_endpoint") ?? "",
      userinfoEndpoint: this.getConfig("oidc_userinfo_endpoint") ?? "",
    };
  }

  getProviderInfo(): { name: string; issuer: string } | null {
    if (this.getConfig("auth_method") !== "oidc") return null;
    return {
      name: this.getConfig("oidc_provider_name") ?? "OIDC",
      issuer: this.getConfig("oidc_issuer") ?? "",
    };
  }

  // ── OIDC Flow ──

  private base64url(buffer: Buffer): string {
    return buffer.toString("base64url");
  }

  beginAuthorize(redirectUri: string): { redirectUrl: string } {
    const oidc = this.getConfig_();
    if (!oidc) throw new Error("OIDC_NOT_CONFIGURED");

    const codeVerifier = this.base64url(randomBytes(48));
    const codeChallenge = this.base64url(createHash("sha256").update(codeVerifier).digest());
    const state = randomUUID();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + OIDC_STATE_TTL_MS);
    this.database
      .prepare("INSERT INTO oidc_states(state, code_verifier, created_at, expires_at) VALUES(?, ?, ?, ?)")
      .run(state, codeVerifier, now.toISOString(), expiresAt.toISOString());

    this.database
      .prepare("DELETE FROM oidc_states WHERE expires_at < ?")
      .run(now.toISOString());

    const params = new URLSearchParams({
      response_type: "code",
      client_id: oidc.clientId,
      redirect_uri: redirectUri,
      scope: "openid profile email",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return { redirectUrl: `${oidc.authorizationEndpoint}?${params.toString()}` };
  }

  async exchangeCode(code: string, state: string, redirectUri: string): Promise<OidcUserInfo> {
    const oidc = this.getConfig_();
    if (!oidc) throw new Error("OIDC_NOT_CONFIGURED");

    const row = this.database
      .prepare("SELECT code_verifier, expires_at FROM oidc_states WHERE state = ?")
      .get(state) as { code_verifier: string; expires_at: string } | undefined;

    if (!row) throw new Error("INVALID_STATE");

    this.database.prepare("DELETE FROM oidc_states WHERE state = ?").run(state);

    if (new Date(row.expires_at) < new Date()) {
      throw new Error("INVALID_STATE");
    }

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: oidc.clientId,
      client_secret: oidc.clientSecret,
      code_verifier: row.code_verifier,
    });

    let tokenData: Record<string, unknown>;
    try {
      const tokenRes = await globalThis.fetch(oidc.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody.toString(),
      });
      if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
      tokenData = (await tokenRes.json()) as Record<string, unknown>;
    } catch {
      throw new Error("OIDC_CALLBACK_FAILED");
    }

    const accessToken = tokenData.access_token as string;
    if (!accessToken) throw new Error("OIDC_CALLBACK_FAILED");

    let sub: string;
    let preferredUsername: string;
    let displayName: string;

    if (oidc.userinfoEndpoint) {
      try {
        const uiRes = await globalThis.fetch(oidc.userinfoEndpoint, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!uiRes.ok) throw new Error(`Userinfo failed: ${uiRes.status}`);
        const userinfo = (await uiRes.json()) as Record<string, unknown>;
        sub = (userinfo.sub as string) || "";
        preferredUsername = (userinfo.preferred_username as string) || (userinfo.email as string) || sub;
        displayName = (userinfo.name as string) || preferredUsername;
      } catch {
        throw new Error("OIDC_CALLBACK_FAILED");
      }
    } else {
      const idToken = tokenData.id_token as string;
      if (!idToken) throw new Error("OIDC_CALLBACK_FAILED");
      const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()) as Record<string, unknown>;
      sub = (payload.sub as string) || "";
      preferredUsername = (payload.preferred_username as string) || (payload.email as string) || sub;
      displayName = (payload.name as string) || preferredUsername;
    }

    if (!sub) throw new Error("OIDC_CALLBACK_FAILED");

    return { sub, preferredUsername, displayName };
  }
}
