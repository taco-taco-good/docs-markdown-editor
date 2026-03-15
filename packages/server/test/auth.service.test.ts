import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { AuthService } from "../src/services/auth.service.ts";

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "docs-md-auth-"));
}

test("AuthService creates local users and logs in with Argon2id passwords", () => {
  const workspace = createWorkspace();
  const auth = new AuthService(workspace);
  const user = auth.createLocalUser("alice", "correct horse battery staple", "Alice");
  const session = auth.loginWithPassword("alice", "correct horse battery staple");

  assert.equal(session.userId, user.id);
  assert.equal(session.username, "alice");
  assert.ok(session.sessionId.length > 10);
});

test("AuthService issues and validates PATs", () => {
  const workspace = createWorkspace();
  const auth = new AuthService(workspace);
  const user = auth.createLocalUser("bob", "hunter2", "Bob");
  const issued = auth.issuePersonalAccessToken(user.id, "cli");
  const validated = auth.authenticatePersonalAccessToken(issued.token);

  assert.equal(validated?.userId, user.id);
  assert.equal(validated?.tokenPrefix, issued.tokenPrefix);
});

test("AuthService rejects invalid passwords", () => {
  const workspace = createWorkspace();
  const auth = new AuthService(workspace);
  auth.createLocalUser("charlie", "s3cret", "Charlie");

  assert.throws(() => auth.loginWithPassword("charlie", "wrong"), /UNAUTHORIZED/);
});
