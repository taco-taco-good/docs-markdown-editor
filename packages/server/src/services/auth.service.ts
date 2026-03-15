import { createHash, randomBytes, randomUUID, timingSafeEqual, argon2Sync } from "node:crypto";
import path from "node:path";

import { openDatabase } from "../lib/sqlite.ts";

const ARGON_MEMORY = 64 * 1024;
const ARGON_PASSES = 3;
const ARGON_TAG_LENGTH = 32;
const OIDC_STATE_TTL_MS = 10 * 60 * 1000;

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  username: string;
  provider: "local" | "oidc";
}

export interface AppStatus {
  initialized: boolean;
  authMethod: "local" | "oidc" | null;
  oidcProvider: { name: string; issuer: string } | null;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  providerName: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
}

interface LoginThrottleState {
  failures: number;
  lockedUntil: number;
  lastFailureAt: number;
}

const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_BACKOFF_MS = 5 * 60 * 1000;

export class AuthService {
  private readonly workspaceRoot: string;
  private readonly database;
  private readonly loginThrottle = new Map<string, LoginThrottleState>();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.database = openDatabase(path.join(this.workspaceRoot, ".docs", "auth", "users.db"));
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS users(
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password_hash TEXT,
        display_name TEXT,
        auth_provider TEXT NOT NULL,
        provider_subject TEXT,
        created_at TEXT NOT NULL,
        disabled_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions(
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS personal_access_tokens(
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        token_prefix TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS app_config(
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS oidc_states(
        state TEXT PRIMARY KEY,
        code_verifier TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);
  }

  private hashPassword(password: string): string {
    const nonce = randomBytes(16);
    const tag = argon2Sync("argon2id", {
      message: password,
      nonce,
      parallelism: 1,
      tagLength: ARGON_TAG_LENGTH,
      memory: ARGON_MEMORY,
      passes: ARGON_PASSES,
    });
    return `argon2id$${nonce.toString("base64")}$${tag.toString("base64")}`;
  }

  private verifyPassword(passwordHash: string, password: string): boolean {
    const [, nonceBase64, tagBase64] = passwordHash.split("$");
    const nonce = Buffer.from(nonceBase64, "base64");
    const expected = Buffer.from(tagBase64, "base64");
    const actual = argon2Sync("argon2id", {
      message: password,
      nonce,
      parallelism: 1,
      tagLength: ARGON_TAG_LENGTH,
      memory: ARGON_MEMORY,
      passes: ARGON_PASSES,
    });
    return timingSafeEqual(expected, actual);
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  createLocalUser(username: string, password: string, displayName = username): { id: string; username: string } {
    const id = randomUUID();
    const now = new Date().toISOString();
    const statement = this.database.prepare(`
      INSERT INTO users(id, username, password_hash, display_name, auth_provider, provider_subject, created_at, disabled_at)
      VALUES (?, ?, ?, ?, 'local', NULL, ?, NULL)
    `);
    statement.run(id, username, this.hashPassword(password), displayName, now);
    return { id, username };
  }

  private throttleKey(username: string, clientKey: string): string {
    return `${clientKey}:${username.trim().toLowerCase()}`;
  }

  private pruneThrottle(now: number): void {
    for (const [key, state] of this.loginThrottle.entries()) {
      if (state.lockedUntil <= now && now - state.lastFailureAt > LOGIN_FAILURE_WINDOW_MS) {
        this.loginThrottle.delete(key);
      }
    }
  }

  private assertLoginAllowed(key: string, now: number): void {
    this.pruneThrottle(now);
    const state = this.loginThrottle.get(key);
    if (!state) return;
    if (state.lockedUntil > now) {
      throw new Error("TOO_MANY_ATTEMPTS");
    }
  }

  private recordLoginFailure(key: string, now: number): void {
    const current = this.loginThrottle.get(key);
    const failures = (current?.failures ?? 0) + 1;
    const backoffMs =
      failures < 3 ? 0 : Math.min(15_000 * 2 ** (failures - 3), LOGIN_MAX_BACKOFF_MS);

    this.loginThrottle.set(key, {
      failures,
      lockedUntil: now + backoffMs,
      lastFailureAt: now,
    });
  }

  private clearLoginFailure(key: string): void {
    this.loginThrottle.delete(key);
  }

  loginWithPassword(username: string, password: string, clientKey = "local"): AuthenticatedSession {
    const now = Date.now();
    const throttleKey = this.throttleKey(username, clientKey);
    this.assertLoginAllowed(throttleKey, now);

    const row = this.database
      .prepare("SELECT id, username, password_hash FROM users WHERE username = ? AND disabled_at IS NULL")
      .get(username) as { id: string; username: string; password_hash: string } | undefined;

    if (!row || !this.verifyPassword(row.password_hash, password)) {
      this.recordLoginFailure(throttleKey, now);
      throw new Error("UNAUTHORIZED");
    }
    this.clearLoginFailure(throttleKey);

    const sessionId = randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 1000 * 60 * 60 * 24);
    this.database
      .prepare("INSERT INTO sessions(id, user_id, expires_at, created_at) VALUES(?, ?, ?, ?)")
      .run(sessionId, row.id, expiresAt.toISOString(), issuedAt.toISOString());

    return {
      sessionId,
      userId: row.id,
      username: row.username,
      provider: "local",
    };
  }

  authenticateSession(sessionId: string): AuthenticatedSession | null {
    const now = new Date().toISOString();
    const row = this.database
      .prepare(`
        SELECT sessions.id, users.id AS user_id, users.username, users.auth_provider
        FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE sessions.id = ? AND sessions.expires_at > ? AND users.disabled_at IS NULL
      `)
      .get(sessionId, now) as
      | {
          id: string;
          user_id: string;
          username: string;
          auth_provider: "local" | "oidc";
        }
      | undefined;

    if (!row) return null;

    return {
      sessionId: row.id,
      userId: row.user_id,
      username: row.username,
      provider: row.auth_provider,
    };
  }

  logoutSession(sessionId: string): void {
    this.database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  issuePersonalAccessToken(userId: string, name: string): { token: string; tokenId: string; tokenPrefix: string } {
    const tokenId = randomUUID();
    const token = `pat_${randomBytes(24).toString("hex")}`;
    const tokenPrefix = token.slice(0, 12);
    this.database
      .prepare(`
        INSERT INTO personal_access_tokens(id, user_id, name, token_prefix, token_hash, created_at, last_used_at, revoked_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
      `)
      .run(tokenId, userId, name, tokenPrefix, this.hashToken(token), new Date().toISOString());

    return { token, tokenId, tokenPrefix };
  }

  listPersonalAccessTokens(userId: string): { id: string; name: string; tokenPrefix: string; createdAt: string; lastUsedAt: string | null }[] {
    const rows = this.database
      .prepare(`
        SELECT id, name, token_prefix, created_at, last_used_at
        FROM personal_access_tokens
        WHERE user_id = ? AND revoked_at IS NULL
        ORDER BY created_at DESC
      `)
      .all(userId) as { id: string; name: string; token_prefix: string; created_at: string; last_used_at: string | null }[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      tokenPrefix: row.token_prefix,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));
  }

  revokePersonalAccessToken(tokenId: string, userId: string): boolean {
    const result = this.database
      .prepare("UPDATE personal_access_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
      .run(new Date().toISOString(), tokenId, userId);
    return result.changes > 0;
  }

  authenticatePersonalAccessToken(token: string): { userId: string; tokenPrefix: string } | null {
    const tokenPrefix = token.slice(0, 12);
    const row = this.database
      .prepare(`
        SELECT user_id, token_hash, token_prefix
        FROM personal_access_tokens
        WHERE token_prefix = ? AND revoked_at IS NULL
      `)
      .get(tokenPrefix) as { user_id: string; token_hash: string; token_prefix: string } | undefined;

    if (!row) return null;
    const candidate = this.hashToken(token);
    if (!timingSafeEqual(Buffer.from(row.token_hash), Buffer.from(candidate))) {
      return null;
    }

    this.database
      .prepare("UPDATE personal_access_tokens SET last_used_at = ? WHERE token_prefix = ?")
      .run(new Date().toISOString(), tokenPrefix);

    return { userId: row.user_id, tokenPrefix: row.token_prefix };
  }

  // ── App Config ──

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

  getAppStatus(): AppStatus {
    const authMethod = this.getConfig("auth_method") as "local" | "oidc" | null;
    const initialized = authMethod !== null;
    let oidcProvider: { name: string; issuer: string } | null = null;
    if (authMethod === "oidc") {
      const name = this.getConfig("oidc_provider_name") ?? "OIDC";
      const issuer = this.getConfig("oidc_issuer") ?? "";
      oidcProvider = { name, issuer };
    }
    return { initialized, authMethod, oidcProvider };
  }

  // ── Setup ──

  setupLocal(username: string, password: string, displayName?: string): AuthenticatedSession {
    if (this.getConfig("auth_method")) {
      throw new Error("ALREADY_INITIALIZED");
    }
    this.setConfig("auth_method", "local");
    const user = this.createLocalUser(username, password, displayName);

    const sessionId = randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 1000 * 60 * 60 * 24);
    this.database
      .prepare("INSERT INTO sessions(id, user_id, expires_at, created_at) VALUES(?, ?, ?, ?)")
      .run(sessionId, user.id, expiresAt.toISOString(), issuedAt.toISOString());

    return { sessionId, userId: user.id, username: user.username, provider: "local" };
  }

  async setupOidc(config: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    providerName: string;
  }): Promise<OidcConfig> {
    if (this.getConfig("auth_method")) {
      throw new Error("ALREADY_INITIALIZED");
    }

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

  getOidcConfig(): OidcConfig | null {
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

  // ── OIDC Flow ──

  private base64url(buffer: Buffer): string {
    return buffer.toString("base64url");
  }

  beginOidcAuthorize(redirectUri: string): { redirectUrl: string } {
    const oidc = this.getOidcConfig();
    if (!oidc) throw new Error("OIDC_NOT_CONFIGURED");

    // PKCE
    const codeVerifier = this.base64url(randomBytes(48));
    const codeChallenge = this.base64url(createHash("sha256").update(codeVerifier).digest());
    const state = randomUUID();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + OIDC_STATE_TTL_MS);
    this.database
      .prepare("INSERT INTO oidc_states(state, code_verifier, created_at, expires_at) VALUES(?, ?, ?, ?)")
      .run(state, codeVerifier, now.toISOString(), expiresAt.toISOString());

    // Cleanup expired states
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

  async handleOidcCallback(code: string, state: string, redirectUri: string): Promise<AuthenticatedSession> {
    const oidc = this.getOidcConfig();
    if (!oidc) throw new Error("OIDC_NOT_CONFIGURED");

    const row = this.database
      .prepare("SELECT code_verifier, expires_at FROM oidc_states WHERE state = ?")
      .get(state) as { code_verifier: string; expires_at: string } | undefined;

    if (!row) throw new Error("INVALID_STATE");

    this.database.prepare("DELETE FROM oidc_states WHERE state = ?").run(state);

    if (new Date(row.expires_at) < new Date()) {
      throw new Error("INVALID_STATE");
    }

    // Exchange code for tokens
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

    // Fetch userinfo
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
      // Parse ID token if no userinfo endpoint
      const idToken = tokenData.id_token as string;
      if (!idToken) throw new Error("OIDC_CALLBACK_FAILED");
      const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()) as Record<string, unknown>;
      sub = (payload.sub as string) || "";
      preferredUsername = (payload.preferred_username as string) || (payload.email as string) || sub;
      displayName = (payload.name as string) || preferredUsername;
    }

    if (!sub) throw new Error("OIDC_CALLBACK_FAILED");

    // Find or create user
    let user = this.database
      .prepare("SELECT id, username FROM users WHERE auth_provider = 'oidc' AND provider_subject = ?")
      .get(sub) as { id: string; username: string } | undefined;

    if (!user) {
      const id = randomUUID();
      const now = new Date().toISOString();
      this.database
        .prepare(`INSERT INTO users(id, username, password_hash, display_name, auth_provider, provider_subject, created_at, disabled_at)
                  VALUES (?, ?, NULL, ?, 'oidc', ?, ?, NULL)`)
        .run(id, preferredUsername, displayName, sub, now);
      user = { id, username: preferredUsername };
    }

    // Create session
    const sessionId = randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 1000 * 60 * 60 * 24);
    this.database
      .prepare("INSERT INTO sessions(id, user_id, expires_at, created_at) VALUES(?, ?, ?, ?)")
      .run(sessionId, user.id, expiresAt.toISOString(), issuedAt.toISOString());

    return { sessionId, userId: user.id, username: user.username, provider: "oidc" };
  }
}
