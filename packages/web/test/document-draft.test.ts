import assert from "node:assert/strict";
import test from "node:test";

import type { Document } from "../src/api/client.ts";
import {
  clearDocumentDraft,
  readDocumentDraft,
  shouldRestoreDocumentDraft,
  writeDocumentDraft,
} from "../src/lib/document-draft.ts";

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function createDocument(raw: string, revision = "rev-1"): Document {
  return {
    meta: {
      path: "notes/mobile.md",
      title: "Mobile",
      frontmatter: {},
      size: raw.length,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      revision,
    },
    raw,
    content: raw,
  };
}

test("writeDocumentDraft and readDocumentDraft persist a recoverable local draft", () => {
  const storage = new MemoryStorage();

  writeDocumentDraft("notes/mobile.md", {
    raw: "",
    lastSavedRaw: "# Title\n\nbody\n",
    baseRevision: "rev-1",
  }, storage);

  const draft = readDocumentDraft("notes/mobile.md", storage);
  assert.ok(draft);
  assert.equal(draft?.raw, "");
  assert.equal(draft?.lastSavedRaw, "# Title\n\nbody\n");
  assert.equal(draft?.baseRevision, "rev-1");
  assert.equal(typeof draft?.updatedAt, "number");
});

test("shouldRestoreDocumentDraft restores when the draft was based on the currently loaded server content", () => {
  const doc = createDocument("# Title\n\nbody\n", "rev-1");
  const shouldRestore = shouldRestoreDocumentDraft(doc, {
    raw: "",
    lastSavedRaw: "# Title\n\nbody\n",
    baseRevision: "rev-1",
    updatedAt: Date.now(),
  });

  assert.equal(shouldRestore, true);
});

test("shouldRestoreDocumentDraft ignores stale drafts from a different server revision", () => {
  const doc = createDocument("# Title\n\nserver changed\n", "rev-2");
  const shouldRestore = shouldRestoreDocumentDraft(doc, {
    raw: "",
    lastSavedRaw: "# Title\n\nbody\n",
    baseRevision: "rev-1",
    updatedAt: Date.now(),
  });

  assert.equal(shouldRestore, false);
});

test("clearDocumentDraft removes the local recovery snapshot after save", () => {
  const storage = new MemoryStorage();
  writeDocumentDraft("notes/mobile.md", {
    raw: "temporary",
    lastSavedRaw: "base",
    baseRevision: "rev-1",
  }, storage);

  clearDocumentDraft("notes/mobile.md", storage);

  assert.equal(readDocumentDraft("notes/mobile.md", storage), null);
});
