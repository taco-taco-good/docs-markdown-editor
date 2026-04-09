import assert from "node:assert/strict";
import test from "node:test";

import { api } from "../src/api/client.ts";
import {
  registerDocumentPersistenceLifecycle,
  type LifecycleSaveOptions,
} from "../src/lib/document-lifecycle.ts";

class MockDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

class MockWindow extends EventTarget {}

test("registerDocumentPersistenceLifecycle flushes keepalive save when document becomes hidden", async () => {
  const document = new MockDocument();
  const window = new MockWindow();
  const calls: LifecycleSaveOptions[] = [];

  const cleanup = registerDocumentPersistenceLifecycle({
    document: document as unknown as Document,
    window: window as unknown as Window,
    store: {
      flushPendingSave: (options) => {
        calls.push(options ?? {});
      },
    },
  });

  document.visibilityState = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
  await Promise.resolve();

  assert.deepEqual(calls, [{ keepalive: true }]);
  cleanup();
});

test("registerDocumentPersistenceLifecycle flushes on pagehide as a mobile fallback", async () => {
  const document = new MockDocument();
  const window = new MockWindow();
  const calls: LifecycleSaveOptions[] = [];

  const cleanup = registerDocumentPersistenceLifecycle({
    document: document as unknown as Document,
    window: window as unknown as Window,
    store: {
      flushPendingSave: (options) => {
        calls.push(options ?? {});
      },
    },
  });

  window.dispatchEvent(new Event("pagehide"));
  await Promise.resolve();

  assert.deepEqual(calls, [{ keepalive: true }]);
  cleanup();
});

test("registerDocumentPersistenceLifecycle suppresses immediate duplicate flush events", async () => {
  const document = new MockDocument();
  const window = new MockWindow();
  const calls: LifecycleSaveOptions[] = [];

  const cleanup = registerDocumentPersistenceLifecycle({
    document: document as unknown as Document,
    window: window as unknown as Window,
    store: {
      flushPendingSave: (options) => {
        calls.push(options ?? {});
      },
    },
  });

  document.visibilityState = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("pagehide"));
  await Promise.resolve();

  assert.deepEqual(calls, [{ keepalive: true }]);
  cleanup();
});

test("api.saveDocument forwards keepalive request options", async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({
      data: {
        meta: {
          path: "notes/test.md",
          title: "Test",
          frontmatter: {},
          size: 0,
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          revision: "rev-2",
        },
        raw: "",
        content: "",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await api.saveDocument("notes/test.md", "", "rev-1", { keepalive: true });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(captured?.keepalive, true);
  assert.equal(captured?.method, "PATCH");
});
