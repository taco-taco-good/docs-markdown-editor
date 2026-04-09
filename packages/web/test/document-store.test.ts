import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError, api, type Document } from "../src/api/client.ts";
import { resetDocumentStoreForTests, useDocumentStore } from "../src/stores/document.store.ts";
import { useTabStore } from "../src/stores/tab.store.ts";

function createDocument(raw: string, revision: string, path = "notes/test.md", title = "Test"): Document {
  return {
    raw,
    content: raw,
    meta: {
      path,
      title,
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

test("openDocument keeps per-tab dirty sessions, selection, and scroll state", async () => {
  resetDocumentStoreForTests();

  const originalGetDocument = api.getDocument;
  api.getDocument = (async (docPath: string) => {
    if (docPath === "notes/a.md") {
      return createDocument("# A\nalpha\n", "rev-a", "notes/a.md", "A");
    }
    if (docPath === "notes/b.md") {
      return createDocument("# B\nbeta\n", "rev-b", "notes/b.md", "B");
    }
    throw new Error(`unexpected path: ${docPath}`);
  }) as typeof api.getDocument;

  try {
    await useDocumentStore.getState().openDocument("notes/a.md");
    useDocumentStore.getState().updateRaw("# A\nalpha edited\n");
    useDocumentStore.getState().updateEditorViewport({
      selection: { from: 4, to: 9, head: 9 },
      scrollTop: 140,
    });

    await useDocumentStore.getState().openDocument("notes/b.md");
    useDocumentStore.getState().updateRaw("# B\nbeta edited\n");
    useDocumentStore.getState().updateEditorViewport({
      selection: { from: 5, to: 5, head: 5 },
      scrollTop: 280,
    });

    await useDocumentStore.getState().openDocument("notes/a.md");
    let state = useDocumentStore.getState();
    assert.equal(state.currentPath, "notes/a.md");
    assert.equal(state.currentDoc?.raw, "# A\nalpha edited\n");
    assert.equal(state.isDirty, true);
    assert.deepEqual(state.currentSelection, { from: 4, to: 9, head: 9 });
    assert.equal(state.currentScrollTop, 140);

    await useDocumentStore.getState().openDocument("notes/b.md");
    state = useDocumentStore.getState();
    assert.equal(state.currentPath, "notes/b.md");
    assert.equal(state.currentDoc?.raw, "# B\nbeta edited\n");
    assert.equal(state.isDirty, true);
    assert.deepEqual(state.currentSelection, { from: 5, to: 5, head: 5 });
    assert.equal(state.currentScrollTop, 280);

    const tabs = useTabStore.getState().openTabs.map((tab) => tab.path);
    assert.deepEqual(tabs, ["notes/a.md", "notes/b.md"]);
  } finally {
    api.getDocument = originalGetDocument;
    resetDocumentStoreForTests();
  }
});

test("closeDocuments removes closed tabs and activates the requested next tab", async () => {
  resetDocumentStoreForTests();

  const originalGetDocument = api.getDocument;
  api.getDocument = (async (docPath: string) => {
    if (docPath === "notes/a.md") return createDocument("# A\n", "rev-a", "notes/a.md", "A");
    if (docPath === "notes/b.md") return createDocument("# B\n", "rev-b", "notes/b.md", "B");
    if (docPath === "notes/c.md") return createDocument("# C\n", "rev-c", "notes/c.md", "C");
    throw new Error(`unexpected path: ${docPath}`);
  }) as typeof api.getDocument;

  try {
    await useDocumentStore.getState().openDocument("notes/a.md");
    await useDocumentStore.getState().openDocument("notes/b.md");
    await useDocumentStore.getState().openDocument("notes/c.md");

    await useDocumentStore.getState().closeDocuments(["notes/b.md", "notes/c.md"], {
      force: true,
      nextPath: "notes/a.md",
    });

    const state = useDocumentStore.getState();
    assert.equal(state.currentPath, "notes/a.md");
    assert.equal(state.currentDoc?.meta.path, "notes/a.md");
    assert.deepEqual(useTabStore.getState().openTabs.map((tab) => tab.path), ["notes/a.md"]);
  } finally {
    api.getDocument = originalGetDocument;
    resetDocumentStoreForTests();
  }
});

test("closeDocuments removes a restored tab even when its session has not been loaded yet", async () => {
  resetDocumentStoreForTests();

  const originalGetDocument = api.getDocument;
  api.getDocument = (async (docPath: string) => {
    if (docPath === "notes/a.md") return createDocument("# A\n", "rev-a", "notes/a.md", "A");
    throw new Error(`unexpected path: ${docPath}`);
  }) as typeof api.getDocument;

  try {
    await useDocumentStore.getState().openDocument("notes/a.md");
    useTabStore.getState().openTab("notes/b.md", "B");

    assert.deepEqual(
      useTabStore.getState().openTabs.map((tab) => tab.path),
      ["notes/a.md", "notes/b.md"],
    );
    assert.equal(useDocumentStore.getState().sessionsByPath["notes/b.md"], undefined);

    await useDocumentStore.getState().closeDocuments(["notes/b.md"], {
      force: true,
      nextPath: "notes/a.md",
    });

    assert.deepEqual(
      useTabStore.getState().openTabs.map((tab) => tab.path),
      ["notes/a.md"],
    );
    assert.equal(useTabStore.getState().activeTabPath, "notes/a.md");
    assert.equal(useDocumentStore.getState().currentPath, "notes/a.md");
  } finally {
    api.getDocument = originalGetDocument;
    resetDocumentStoreForTests();
  }
});

test("handleExternalMove remaps tab paths and document sessions", async () => {
  resetDocumentStoreForTests();

  const originalGetDocument = api.getDocument;
  api.getDocument = (async (docPath: string) => {
    if (docPath === "notes/original.md") {
      return createDocument("# Original\n", "rev-1", "notes/original.md", "Original");
    }
    throw new Error(`unexpected path: ${docPath}`);
  }) as typeof api.getDocument;

  try {
    await useDocumentStore.getState().openDocument("notes/original.md");
    useDocumentStore.getState().handleExternalMove("notes/original.md", "notes/renamed.md");

    const state = useDocumentStore.getState();
    assert.equal(state.currentPath, "notes/renamed.md");
    assert.equal(state.currentDoc?.meta.path, "notes/renamed.md");
    assert.ok(state.sessionsByPath["notes/renamed.md"]);
    assert.equal(useTabStore.getState().openTabs[0]?.path, "notes/renamed.md");
  } finally {
    api.getDocument = originalGetDocument;
    resetDocumentStoreForTests();
  }
});

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
