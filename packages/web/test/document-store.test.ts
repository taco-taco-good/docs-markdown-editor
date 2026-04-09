import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError, api, type Document } from "../src/api/client.ts";
import { resetDocumentStoreForTests, useDocumentStore } from "../src/stores/document.store.ts";

function createDocument(raw: string, revision: string): Document {
  return {
    raw,
    content: raw,
    meta: {
      path: "notes/test.md",
      title: "Test",
      frontmatter: {},
      size: raw.length,
      createdAt: "2026-04-09T00:00:00.000Z",
      modifiedAt: "2026-04-09T00:00:00.000Z",
      revision,
    },
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out while waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("saveDocument serializes overlapping saves and advances revision for queued edits", async () => {
  resetDocumentStoreForTests();

  const originalSaveDocument = api.saveDocument;
  const calls: Array<{ raw: string; baseRevision?: string }> = [];
  const resolvers: Array<(doc: Document) => void> = [];

  api.saveDocument = ((docPath: string, raw: string, baseRevision?: string) => {
    void docPath;
    calls.push({ raw, baseRevision });
    return new Promise<Document>((resolve) => {
      resolvers.push(resolve);
    });
  }) as typeof api.saveDocument;

  try {
    useDocumentStore.setState({
      currentPath: "notes/test.md",
      currentDoc: createDocument("first edit", "rev-1"),
      isDirty: true,
      saveStatus: "idle",
      lastSavedRaw: "base",
      hasPendingRemoteUpdate: false,
      pendingRemoteSnapshot: null,
      isComposing: false,
    });

    const firstSave = useDocumentStore.getState().saveDocument();
    await waitFor(() => calls.length === 1);

    useDocumentStore.setState((state) => ({
      currentDoc: state.currentDoc ? { ...state.currentDoc, raw: "second edit", content: "second edit" } : null,
      isDirty: true,
      saveStatus: "idle",
    }));

    const overlappingSave = useDocumentStore.getState().saveDocument();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].baseRevision, "rev-1");

    resolvers[0](createDocument("first edit", "rev-2"));
    await firstSave;
    await overlappingSave;

    await waitFor(() => calls.length === 2);
    assert.equal(calls[1].raw, "second edit");
    assert.equal(calls[1].baseRevision, "rev-2");

    resolvers[1](createDocument("second edit", "rev-3"));
    await waitFor(() => useDocumentStore.getState().lastSavedRaw === "second edit");

    const state = useDocumentStore.getState();
    assert.equal(state.currentDoc?.meta.revision, "rev-3");
    assert.equal(state.isDirty, false);
    assert.equal(state.saveStatus, "saved");
  } finally {
    api.saveDocument = originalSaveDocument;
    resetDocumentStoreForTests();
  }
});

test("saveDocument merges a version mismatch response and retries with the latest revision", async () => {
  resetDocumentStoreForTests();

  const originalSaveDocument = api.saveDocument;
  const calls: Array<{ raw: string; baseRevision?: string }> = [];

  api.saveDocument = (async (docPath: string, raw: string, baseRevision?: string) => {
    void docPath;
    calls.push({ raw, baseRevision });

    if (calls.length === 1) {
      throw new ApiRequestError({
        code: "VERSION_MISMATCH",
        message: "Document has changed on the server",
        status: 409,
        details: {
          document: createDocument("title\nbase\nremote tail\n", "rev-2"),
        },
      });
    }

    return createDocument(raw, "rev-3");
  }) as typeof api.saveDocument;

  try {
    useDocumentStore.setState({
      currentPath: "notes/test.md",
      currentDoc: createDocument("title\nbase local\n", "rev-1"),
      isDirty: true,
      saveStatus: "idle",
      lastSavedRaw: "title\nbase\n",
      hasPendingRemoteUpdate: false,
      pendingRemoteSnapshot: null,
      isComposing: false,
    });

    await useDocumentStore.getState().saveDocument();
    await waitFor(() => calls.length === 2);
    await waitFor(() => useDocumentStore.getState().saveStatus === "saved");

    assert.deepEqual(calls, [
      { raw: "title\nbase local\n", baseRevision: "rev-1" },
      { raw: "title\nbase local\nremote tail\n", baseRevision: "rev-2" },
    ]);

    const state = useDocumentStore.getState();
    assert.equal(state.currentDoc?.raw, "title\nbase local\nremote tail\n");
    assert.equal(state.currentDoc?.meta.revision, "rev-3");
    assert.equal(state.lastSavedRaw, "title\nbase local\nremote tail\n");
    assert.equal(state.isDirty, false);
    assert.equal(state.saveStatus, "saved");
  } finally {
    api.saveDocument = originalSaveDocument;
    resetDocumentStoreForTests();
  }
});
