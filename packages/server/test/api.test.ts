import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApiApp } from "../src/http/api.ts";

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "docs-md-api-"));
}

function createRequest(
  pathname: string,
  init?: RequestInit & { body?: BodyInit | null },
): Request {
  return new Request(`http://docs.test${pathname}`, init);
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expected: string,
  timeoutMs = 1000,
): Promise<string> {
  const pending = (async () => {
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        throw new Error(`Stream ended before receiving ${expected}`);
      }
      buffer += Buffer.from(value).toString("utf8");
      if (buffer.includes(expected)) {
        return buffer;
      }
    }
  })();

  return await Promise.race([
    pending,
    new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out waiting for ${expected}`)), timeoutMs);
    }),
  ]);
}

test("API enforces auth and serves health without auth", async () => {
  const workspace = createWorkspace();
  const app = createApiApp({ workspaceRoot: workspace });

  const healthResponse = await app.fetch(createRequest("/api/health"));
  assert.equal(healthResponse.status, 200);

  const unauthorized = await app.fetch(createRequest("/api/tree"));
  assert.equal(unauthorized.status, 401);
});

test("API throttles repeated login failures and sets Secure cookies on HTTPS", async () => {
  const savedTrustProxy = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = "true";
  const workspace = createWorkspace();
  const app = createApiApp({ workspaceRoot: workspace });
  app.authService.createLocalUser("alice", "correct horse battery staple", "Alice");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const failure = await app.fetch(
      createRequest("/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "203.0.113.10",
        },
        body: JSON.stringify({
          username: "alice",
          password: "wrong-password",
        }),
      }),
    );
    assert.equal(failure.status, 401);
  }

  const throttled = await app.fetch(
    createRequest("/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "203.0.113.10",
      },
      body: JSON.stringify({
        username: "alice",
        password: "wrong-password",
      }),
    }),
  );
  assert.equal(throttled.status, 429);

  const secureLogin = await app.fetch(
    new Request("https://docs.test/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        password: "correct horse battery staple",
      }),
    }),
  );
  assert.equal(secureLogin.status, 200);
  assert.match(secureLogin.headers.get("set-cookie") ?? "", /Secure/);

  // Restore original env
  if (savedTrustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = savedTrustProxy;
});

test("API supports login, document CRUD, tree, search, and PAT auth", async () => {
  const workspace = createWorkspace();
  const app = createApiApp({ workspaceRoot: workspace });
  app.authService.createLocalUser("alice", "correct horse battery staple", "Alice");

  const loginResponse = await app.fetch(
    createRequest("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        password: "correct horse battery staple",
      }),
    }),
  );
  assert.equal(loginResponse.status, 200);
  const loginPayload = await loginResponse.json();
  const sessionId = loginPayload.data.sessionId as string;
  assert.ok(sessionId.length > 10);
  assert.match(loginResponse.headers.get("set-cookie") ?? "", /SameSite=Lax/);

  const sessionResponse = await app.fetch(
    createRequest("/auth/session", {
      headers: { "x-session-id": sessionId },
    }),
  );
  assert.equal(sessionResponse.status, 200);
  const sessionPayload = await sessionResponse.json();
  assert.equal(sessionPayload.data.username, "alice");

  const createDirResponse = await app.fetch(
    createRequest("/api/tree/dirs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
      },
      body: JSON.stringify({ path: "guide/reference" }),
    }),
  );
  assert.equal(createDirResponse.status, 201);
  const createDirPayload = await createDirResponse.json();
  assert.equal(createDirPayload.data.path, "guide/reference");

  const createResponse = await app.fetch(
    createRequest("/api/docs/guide%2Fapi.md", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
      },
      body: JSON.stringify({
        content: "# API Guide\n\nhello markdown\n",
        frontmatter: { title: "API Guide", tags: ["guide", "api"] },
      }),
    }),
  );
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.data.meta.path, "guide/api.md");
  assert.deepEqual(created.data.meta.frontmatter.tags, ["guide", "api"]);

  const templatesResponse = await app.fetch(
    createRequest("/api/templates", {
      headers: { "x-session-id": sessionId },
    }),
  );
  assert.equal(templatesResponse.status, 200);
  const templatesPayload = await templatesResponse.json();
  assert.ok(templatesPayload.data.some((template: { name: string }) => template.name === "default"));

  const templateCreateResponse = await app.fetch(
    createRequest("/api/templates", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
      },
      body: JSON.stringify({
        name: "custom-brief",
        content: "---\ntitle: \"{{title}}\"\n---\n\n# {{title}}\n\n## Summary\n",
      }),
    }),
  );
  assert.equal(templateCreateResponse.status, 201);

  const templateUpdateResponse = await app.fetch(
    createRequest("/api/templates/custom-brief", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
      },
      body: JSON.stringify({
        content: "---\ntitle: \"{{title}}\"\n---\n\n# {{title}}\n\n## Updated\n",
      }),
    }),
  );
  assert.equal(templateUpdateResponse.status, 200);
  const templateUpdatePayload = await templateUpdateResponse.json();
  assert.match(templateUpdatePayload.data.content, /## Updated/);

  const uploadForm = new FormData();
  uploadForm.set("file", new File([new Uint8Array([1, 2, 3])], "diagram.png", { type: "image/png" }));
  const uploadResponse = await app.fetch(
    createRequest("/api/assets/guide%2Fapi.md", {
      method: "POST",
      headers: {
        "x-session-id": sessionId,
      },
      body: uploadForm,
    }),
  );
  assert.equal(uploadResponse.status, 201);
  const uploadPayload = await uploadResponse.json();
  assert.match(uploadPayload.data.path, /^\.assets\/guide\/api\/diagram\.png$/);
  assert.match(uploadPayload.data.markdownLink, /^!\[diagram\]\(\/api\/assets\//);

  const assetResponse = await app.fetch(
    createRequest(`/api/assets/${encodeURIComponent(uploadPayload.data.path as string)}`, {
      headers: { "x-session-id": sessionId },
    }),
  );
  assert.equal(assetResponse.status, 200);
  assert.equal(assetResponse.headers.get("content-type"), "image/png");
  assert.equal((await assetResponse.arrayBuffer()).byteLength, 3);

  const oversizedForm = new FormData();
  oversizedForm.set(
    "file",
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "too-big.png", { type: "image/png" }),
  );
  const oversizedUpload = await app.fetch(
    createRequest("/api/assets/guide%2Fapi.md", {
      method: "POST",
      headers: {
        "x-session-id": sessionId,
      },
      body: oversizedForm,
    }),
  );
  assert.equal(oversizedUpload.status, 413);

  const unsupportedForm = new FormData();
  unsupportedForm.set(
    "file",
    new File([new Uint8Array([1, 2, 3])], "report.pdf", { type: "application/pdf" }),
  );
  const unsupportedUpload = await app.fetch(
    createRequest("/api/assets/guide%2Fapi.md", {
      method: "POST",
      headers: {
        "x-session-id": sessionId,
      },
      body: unsupportedForm,
    }),
  );
  assert.equal(unsupportedUpload.status, 415);

  const tokenResponse = await app.fetch(
    createRequest("/auth/tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
      },
      body: JSON.stringify({ name: "cli" }),
    }),
  );
  assert.equal(tokenResponse.status, 201);
  const tokenPayload = await tokenResponse.json();
  const token = tokenPayload.data.token as string;
  assert.match(token, /^pat_/);

  const getResponse = await app.fetch(
    createRequest("/api/docs/guide%2Fapi.md", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
  assert.equal(getResponse.status, 200);
  const fetched = await getResponse.json();
  assert.equal(fetched.data.content, "# API Guide\n\nhello markdown\n");

  const searchResponse = await app.fetch(
    createRequest("/api/search", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "hello" }),
    }),
  );
  assert.equal(searchResponse.status, 200);
  const searchPayload = await searchResponse.json();
  assert.equal(searchPayload.data[0].path, "guide/api.md");
  assert.match(searchPayload.data[0].snippet, /hello markdown/i);

  const treeResponse = await app.fetch(
    createRequest("/api/tree", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
  assert.equal(treeResponse.status, 200);
  const treePayload = await treeResponse.json();
  assert.equal(treePayload.data[0].path, "guide");
  assert.ok(
    treePayload.data[0].children.some((child: { path: string }) => child.path === "guide/api.md"),
  );

  const templatedCreateResponse = await app.fetch(
    createRequest("/api/docs/notes%2Fmeeting.md", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
        "x-template": "meeting-note",
      },
      body: JSON.stringify({
        frontmatter: { title: "Planning Sync" },
      }),
    }),
  );
  assert.equal(templatedCreateResponse.status, 201);
  const templatedPayload = await templatedCreateResponse.json();
  assert.equal(templatedPayload.data.meta.frontmatter.title, "Planning Sync");
  assert.deepEqual(templatedPayload.data.meta.frontmatter.tags, ["meeting"]);
  assert.match(templatedPayload.data.content, /## Agenda/);

  const templateDeleteResponse = await app.fetch(
    createRequest("/api/templates/custom-brief", {
      method: "DELETE",
      headers: { "x-session-id": sessionId },
    }),
  );
  assert.equal(templateDeleteResponse.status, 204);

  const logoutResponse = await app.fetch(
    createRequest("/auth/logout", {
      method: "POST",
      headers: { "x-session-id": sessionId },
    }),
  );
  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers.get("set-cookie") ?? "", /Max-Age=0/);

  const sessionAfterLogout = await app.fetch(
    createRequest("/auth/session", {
      headers: { "x-session-id": sessionId },
    }),
  );
  assert.equal(sessionAfterLogout.status, 401);
});

test("API exposes an authenticated event stream and supports moving markdown files", async () => {
  const workspace = createWorkspace();
  const app = createApiApp({ workspaceRoot: workspace });
  app.authService.createLocalUser("alice", "correct horse battery staple", "Alice");

  const loginResponse = await app.fetch(
    createRequest("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        password: "correct horse battery staple",
      }),
    }),
  );
  const loginPayload = await loginResponse.json();
  const sessionId = loginPayload.data.sessionId as string;

  const streamResponse = await app.fetch(
    createRequest("/api/events", {
      headers: { "x-session-id": sessionId },
    }),
  );
  assert.equal(streamResponse.status, 200);
  assert.equal(streamResponse.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.ok(streamResponse.body);
  const reader = streamResponse.body!.getReader();
  try {
    app.realtimeService.publish({ type: "tree:changed" });
    const eventPayload = await readUntil(reader, '"type":"tree:changed"');
    assert.match(eventPayload, /tree:changed/);

    const createResponse = await app.fetch(
      createRequest("/api/docs/guide%2Fsync.md", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-client-id": "window-a",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          content: "# Sync\n\nhello\n",
          frontmatter: { title: "Sync" },
        }),
      }),
    );
    assert.equal(createResponse.status, 201);

    const syncEventPayload = await readUntil(reader, '"type":"doc:content"');
    assert.match(syncEventPayload, /"originClientId":"window-a"/);
    assert.match(syncEventPayload, /"frontmatter":\{[^}]*"title":"Sync"/);

    const moveResponse = await app.fetch(
      createRequest("/api/tree/move", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          from: "guide/sync.md",
          to: "archive/sync.md",
        }),
      }),
    );
    assert.equal(moveResponse.status, 200);
    const movedPayload = await moveResponse.json();
    assert.equal(movedPayload.data.from, "guide/sync.md");
    assert.equal(movedPayload.data.to, "archive/sync.md");

    const oldPathResponse = await app.fetch(
      createRequest("/api/docs/guide%2Fsync.md", {
        headers: { "x-session-id": sessionId },
      }),
    );
    assert.equal(oldPathResponse.status, 404);

    const newPathResponse = await app.fetch(
      createRequest("/api/docs/archive%2Fsync.md", {
        headers: { "x-session-id": sessionId },
      }),
    );
    assert.equal(newPathResponse.status, 200);
  } finally {
    await reader.cancel();
  }
});

test("moving a directory publishes a dir:moved event and keeps descendants reachable", async () => {
  const workspace = createWorkspace();
  const app = createApiApp({ workspaceRoot: workspace });
  app.authService.createLocalUser("alice", "correct horse battery staple", "Alice");

  const loginResponse = await app.fetch(
    createRequest("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        password: "correct horse battery staple",
      }),
    }),
  );
  const loginPayload = await loginResponse.json();
  const sessionId = loginPayload.data.sessionId as string;

  const streamResponse = await app.fetch(
    createRequest("/api/events", {
      headers: { "x-session-id": sessionId },
    }),
  );
  assert.equal(streamResponse.status, 200);
  assert.ok(streamResponse.body);
  const reader = streamResponse.body!.getReader();

  try {
    const createResponse = await app.fetch(
      createRequest("/api/docs/guide%2Fnested%2Fpage.md", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          content: "# Page\n",
        }),
      }),
    );
    assert.equal(createResponse.status, 201);

    const moveResponse = await app.fetch(
      createRequest("/api/tree/move", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          from: "guide",
          to: "archive",
        }),
      }),
    );
    assert.equal(moveResponse.status, 200);
    const movedPayload = await moveResponse.json();
    assert.equal(movedPayload.data.type, "directory");

    const eventPayload = await readUntil(reader, '"type":"dir:moved"');
    assert.match(eventPayload, /"from":"guide"/);
    assert.match(eventPayload, /"to":"archive"/);

    const movedDocument = await app.fetch(
      createRequest("/api/docs/archive%2Fnested%2Fpage.md", {
        headers: { "x-session-id": sessionId },
      }),
    );
    assert.equal(movedDocument.status, 200);
  } finally {
    await reader.cancel();
  }
});

test("PATCH rejects stale base revisions and returns the latest document snapshot", async () => {
  const workspace = createWorkspace();
  const app = createApiApp({ workspaceRoot: workspace });
  app.authService.createLocalUser("alice", "correct horse battery staple", "Alice");

  const loginResponse = await app.fetch(
    createRequest("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        password: "correct horse battery staple",
      }),
    }),
  );
  assert.equal(loginResponse.status, 200);
  const sessionId = (await loginResponse.json()).data.sessionId as string;

  const createResponse = await app.fetch(
    createRequest("/api/docs/guide%2Fconcurrency.md", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
      },
      body: JSON.stringify({
        content: "base\n",
        frontmatter: { title: "Concurrency" },
      }),
    }),
  );
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  const baseRevision = created.data.meta.revision as string;

  const freshPatch = await app.fetch(
    createRequest("/api/docs/guide%2Fconcurrency.md", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
        "x-base-revision": baseRevision,
      },
      body: JSON.stringify({
        content: "remote update\n",
      }),
    }),
  );
  assert.equal(freshPatch.status, 200);

  const stalePatch = await app.fetch(
    createRequest("/api/docs/guide%2Fconcurrency.md", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
        "x-base-revision": baseRevision,
      },
      body: JSON.stringify({
        content: "stale local update\n",
      }),
    }),
  );
  assert.equal(stalePatch.status, 409);
  const stalePayload = await stalePatch.json();
  assert.equal(stalePayload.error.code, "VERSION_MISMATCH");
  assert.equal(stalePayload.error.details.document.content, "remote update\n");
  assert.notEqual(stalePayload.error.details.actualRevision, stalePayload.error.details.expectedRevision);
});

test("tree keeps custom sibling order and root moves after drag-style repositioning", async () => {
  const workspace = createWorkspace();
  const app = createApiApp({ workspaceRoot: workspace });
  app.authService.createLocalUser("alice", "correct horse battery staple", "Alice");

  const loginResponse = await app.fetch(
    createRequest("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        password: "correct horse battery staple",
      }),
    }),
  );
  const loginPayload = await loginResponse.json();
  const sessionId = loginPayload.data.sessionId as string;

  for (const docPath of ["alpha.md", "beta.md", "gamma.md", "folder/inside.md"]) {
    const createResponse = await app.fetch(
      createRequest(`/api/docs/${encodeURIComponent(docPath)}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({ content: `# ${docPath}\n` }),
      }),
    );
    assert.equal(createResponse.status, 201);
  }

  const folderBeforeResponse = await app.fetch(
    createRequest("/api/tree/move", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
      },
      body: JSON.stringify({
        from: "folder",
        placement: "before",
        targetPath: "alpha.md",
      }),
    }),
  );
  assert.equal(folderBeforeResponse.status, 200);

  const rootMoveResponse = await app.fetch(
    createRequest("/api/tree/move", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
      },
      body: JSON.stringify({
        from: "folder/inside.md",
        placement: "root",
      }),
    }),
  );
  assert.equal(rootMoveResponse.status, 200);
  const rootMovePayload = await rootMoveResponse.json();
  assert.equal(rootMovePayload.data.to, "inside.md");

  const afterResponse = await app.fetch(
    createRequest("/api/tree/move", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
      },
      body: JSON.stringify({
        from: "gamma.md",
        placement: "after",
        targetPath: "alpha.md",
      }),
    }),
  );
  assert.equal(afterResponse.status, 200);

  const treeResponse = await app.fetch(
    createRequest("/api/tree", {
      headers: { "x-session-id": sessionId },
    }),
  );
  assert.equal(treeResponse.status, 200);
  const treePayload = await treeResponse.json();
  assert.deepEqual(
    treePayload.data.map((node: { path: string }) => node.path),
    ["folder", "alpha.md", "gamma.md", "beta.md", "inside.md"],
  );
});

test("TRUST_PROXY disabled ignores X-Forwarded-For for client key extraction", async () => {
  const savedTrustProxy = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;

  const workspace = createWorkspace();
  const app = createApiApp({ workspaceRoot: workspace });
  app.authService.createLocalUser("alice", "correct horse battery staple", "Alice");

  // Make three failures with a forwarded IP — they should all be treated
  // as the same key ("unknown") since TRUST_PROXY is off
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const failure = await app.fetch(
      createRequest("/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "1.2.3.4",
        },
        body: JSON.stringify({
          username: "alice",
          password: "wrong-password",
        }),
      }),
    );
    assert.equal(failure.status, 401);
  }

  // The fourth failure; without TRUST_PROXY the forwarded IP is ignored
  // so the throttle key is always "unknown:alice" — throttling still works
  const throttled = await app.fetch(
    createRequest("/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "1.2.3.4",
      },
      body: JSON.stringify({
        username: "alice",
        password: "wrong-password",
      }),
    }),
  );
  assert.equal(throttled.status, 429);

  // Restore
  if (savedTrustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = savedTrustProxy;
});

test("path traversal attempts return 403", async () => {
  const workspace = createWorkspace();
  const app = createApiApp({ workspaceRoot: workspace });
  app.authService.createLocalUser("alice", "correct horse battery staple", "Alice");

  const loginResponse = await app.fetch(
    createRequest("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        password: "correct horse battery staple",
      }),
    }),
  );
  const loginPayload = await loginResponse.json();
  const sessionId = loginPayload.data.sessionId as string;

  const traversalPaths = [
    "/api/docs/..%2F..%2Fetc%2Fpasswd",
    "/api/docs/..%2Fsecret.md",
  ];

  for (const traversalPath of traversalPaths) {
    const response = await app.fetch(
      createRequest(traversalPath, {
        headers: { "x-session-id": sessionId },
      }),
    );
    assert.equal(response.status, 403, `Expected 403 for ${traversalPath}`);
    const body = await response.json();
    assert.equal(body.error.code, "PATH_TRAVERSAL");
  }
});

