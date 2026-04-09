import { argon2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";

import { openDatabase } from "../lib/sqlite.ts";
import { LoginThrottle } from "./login-throttle.ts";
import { TokenService } from "./token.service.ts";
import { OidcService, type OidcConfig } from "./oidc.service.ts";

export type { OidcConfig } from "./oidc.service.ts";

const ARGON_MEMORY = 64 * 1024;
const ARGON_PASSES = 3;
const ARGON_TAG_LENGTH = 32;

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

export class AuthService {
  private readonly database;
  private readonly throttle = new LoginThrottle();
  private readonly tokenService: TokenService;
  private readonly oidcService: OidcService;

  constructor(workspaceRoot: string) {
    this.database = openDatabase(path.join(workspaceRoot, ".docs", "auth", "users.db"));
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

    this.tokenService = new TokenService(this.database);
    this.oidcService = new OidcService(this.database);
  }

  // ── Password helpers ──

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

  // ── Session helpers ──

  private createSession(userId: string): { sessionId: string; expiresAt: Date } {
    const sessionId = randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 1000 * 60 * 60 * 24);
    this.database
      .prepare("INSERT INTO sessions(id, user_id, expires_at, created_at) VALUES(?, ?, ?, ?)")
      .run(sessionId, userId, expiresAt.toISOString(), issuedAt.toISOString());
    return { sessionId, expiresAt };
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

  // ── User management ──

  createLocalUser(username: string, password: string, displayName = username): { id: string; username: string } {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO users(id, username, password_hash, display_name, auth_provider, provider_subject, created_at, disabled_at)
        VALUES (?, ?, ?, ?, 'local', NULL, ?, NULL)
      `)
      .run(id, username, this.hashPassword(password), displayName, now);
    return { id, username };
  }

  // ── Cleanup ──

  cleanupExpiredSessions(): void {
    const now = new Date().toISOString();
    this.database.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
    this.database.prepare("DELETE FROM oidc_states WHERE expires_at < ?").run(now);
  }

  // ── Login ──

  loginWithPassword(username: string, password: string, clientKey = "local"): AuthenticatedSession {
    this.cleanupExpiredSessions();
    const now = Date.now();
    const throttleKey = this.throttle.key(username, clientKey);
    this.throttle.assertAllowed(throttleKey, now);

    const row = this.database
      .prepare("SELECT id, username, password_hash FROM users WHERE username = ? AND disabled_at IS NULL")
      .get(username) as { id: string; username: string; password_hash: string } | undefined;

    if (!row || !this.verifyPassword(row.password_hash, password)) {
      const backoffMs = this.throttle.recordFailure(throttleKey, now);
      throw new Error(backoffMs > 0 ? "TOO_MANY_ATTEMPTS" : "UNAUTHORIZED");
    }
    this.throttle.clearFailure(throttleKey);

    const { sessionId } = this.createSession(row.id);
    return { sessionId, userId: row.id, username: row.username, provider: "local" };
  }

  // ── Session auth ──

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
      | { id: string; user_id: string; username: string; auth_provider: "local" | "oidc" }
      | undefined;

    if (!row) return null;
    return { sessionId: row.id, userId: row.user_id, username: row.username, provider: row.auth_provider };
  }

  logoutSession(sessionId: string): void {
    this.database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  // ── PAT (delegates to TokenService) ──

  issuePersonalAccessToken(userId: string, name: string) {
    return this.tokenService.issue(userId, name);
  }

  listPersonalAccessTokens(userId: string) {
    return this.tokenService.list(userId);
  }

  revokePersonalAccessToken(tokenId: string, userId: string) {
    return this.tokenService.revoke(tokenId, userId);
  }

  authenticatePersonalAccessToken(token: string) {
    return this.tokenService.authenticate(token);
  }

  // ── App status ──

  getAppStatus(): AppStatus {
    const authMethod = this.getConfig("auth_method") as "local" | "oidc" | null;
    const initialized = authMethod !== null;
    const oidcProvider = this.oidcService.getProviderInfo();
    return { initialized, authMethod, oidcProvider };
  }

  // ── Setup ──

  setupLocal(username: string, password: string, displayName?: string): AuthenticatedSession {
    if (this.getConfig("auth_method")) {
      throw new Error("ALREADY_INITIALIZED");
    }
    this.setConfig("auth_method", "local");
    const user = this.createLocalUser(username, password, displayName);
    const { sessionId } = this.createSession(user.id);
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
    return this.oidcService.setup(config);
  }

  getOidcConfig(): OidcConfig | null {
    return this.oidcService.getConfig_();
  }

  // ── OIDC flow (delegates to OidcService) ──

  beginOidcAuthorize(redirectUri: string): { redirectUrl: string } {
    return this.oidcService.beginAuthorize(redirectUri);
  }

  async handleOidcCallback(code: string, state: string, redirectUri: string): Promise<AuthenticatedSession> {
    const userInfo = await this.oidcService.exchangeCode(code, state, redirectUri);

    // Find or create user
    let user = this.database
      .prepare("SELECT id, username FROM users WHERE auth_provider = 'oidc' AND provider_subject = ?")
      .get(userInfo.sub) as { id: string; username: string } | undefined;

    if (!user) {
      const id = randomUUID();
      const now = new Date().toISOString();
      this.database
        .prepare(`INSERT INTO users(id, username, password_hash, display_name, auth_provider, provider_subject, created_at, disabled_at)
                  VALUES (?, ?, NULL, ?, 'oidc', ?, ?, NULL)`)
        .run(id, userInfo.preferredUsername, userInfo.displayName, userInfo.sub, now);
      user = { id, username: userInfo.preferredUsername };
    }

    const { sessionId } = this.createSession(user.id);
    return { sessionId, userId: user.id, username: user.username, provider: "oidc" };
  }
}
