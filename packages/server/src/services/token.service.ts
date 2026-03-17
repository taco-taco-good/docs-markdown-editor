import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export class TokenService {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  issue(userId: string, name: string): { token: string; tokenId: string; tokenPrefix: string } {
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

  list(userId: string): { id: string; name: string; tokenPrefix: string; createdAt: string; lastUsedAt: string | null }[] {
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

  revoke(tokenId: string, userId: string): boolean {
    const result = this.database
      .prepare("UPDATE personal_access_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
      .run(new Date().toISOString(), tokenId, userId);
    return result.changes > 0;
  }

  authenticate(token: string): { userId: string; tokenPrefix: string } | null {
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
}
