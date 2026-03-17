import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { openDatabase } from "../src/lib/sqlite.ts";
import { TokenService } from "../src/services/token.service.ts";

function createTestDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "docs-token-test-"));
  const db = openDatabase(path.join(dir, "test.db"));
  db.exec(`
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
  `);
  return db;
}

test("TokenService issues a token with pat_ prefix", () => {
  const db = createTestDb();
  const service = new TokenService(db);
  const result = service.issue("user-1", "cli-tool");

  assert.match(result.token, /^pat_/);
  assert.ok(result.tokenId.length > 10);
  assert.equal(result.tokenPrefix, result.token.slice(0, 12));
});

test("TokenService authenticates a valid token", () => {
  const db = createTestDb();
  const service = new TokenService(db);
  const { token } = service.issue("user-1", "cli-tool");

  const auth = service.authenticate(token);
  assert.ok(auth);
  assert.equal(auth!.userId, "user-1");
});

test("TokenService rejects an invalid token", () => {
  const db = createTestDb();
  const service = new TokenService(db);
  service.issue("user-1", "cli-tool");

  const auth = service.authenticate("pat_invalid_token_value_here");
  assert.equal(auth, null);
});

test("TokenService lists tokens for a user", () => {
  const db = createTestDb();
  const service = new TokenService(db);
  service.issue("user-1", "first");
  service.issue("user-1", "second");
  service.issue("user-2", "other");

  const list = service.list("user-1");
  assert.equal(list.length, 2);
  assert.ok(list.some((t) => t.name === "first"));
  assert.ok(list.some((t) => t.name === "second"));

  const otherList = service.list("user-2");
  assert.equal(otherList.length, 1);
});

test("TokenService revokes a token and prevents subsequent authentication", () => {
  const db = createTestDb();
  const service = new TokenService(db);
  const { token, tokenId } = service.issue("user-1", "to-revoke");

  const revoked = service.revoke(tokenId, "user-1");
  assert.equal(revoked, true);

  const auth = service.authenticate(token);
  assert.equal(auth, null);

  const list = service.list("user-1");
  assert.equal(list.length, 0);
});

test("TokenService.revoke returns false for non-existent token", () => {
  const db = createTestDb();
  const service = new TokenService(db);

  const revoked = service.revoke("non-existent-id", "user-1");
  assert.equal(revoked, false);
});

test("TokenService.revoke prevents cross-user revocation", () => {
  const db = createTestDb();
  const service = new TokenService(db);
  const { token, tokenId } = service.issue("user-1", "mine");

  const revoked = service.revoke(tokenId, "user-2");
  assert.equal(revoked, false);

  // Token should still work
  const auth = service.authenticate(token);
  assert.ok(auth);
  assert.equal(auth!.userId, "user-1");
});
