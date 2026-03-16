import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSaveStatus,
  mergeConcurrentContent,
  mergeConcurrentFrontmatter,
  resolveRemoteUpdate,
  resolveSaveSuccess,
  shouldApplySaveResponse,
  shouldReloadAfterCompositionEnd,
} from "../src/stores/document-sync.ts";

test("deriveSaveStatus is based on local save progress, not queued remote sync", () => {
  assert.equal(deriveSaveStatus({ hasPendingRemoteUpdate: true, isDirty: false }), "saved");
  assert.equal(deriveSaveStatus({ hasPendingRemoteUpdate: false, isDirty: true }), "idle");
  assert.equal(deriveSaveStatus({ hasPendingRemoteUpdate: false, isDirty: false }), "saved");
});

test("resolveRemoteUpdate ignores self echoes", () => {
  const result = resolveRemoteUpdate({
    content: "remote",
    frontmatter: "{\"title\":\"Remote\"}",
    currentContent: "local",
    currentFrontmatter: "{\"title\":\"Local\"}",
    lastSavedContent: "saved",
    lastSavedFrontmatter: "{\"title\":\"Saved\"}",
    isDirty: false,
    isComposing: false,
    hasPendingRemoteUpdate: false,
    originClientId: "window-a",
    editorClientId: "window-a",
  });

  assert.deepEqual(result, { action: "ignore" });
});

test("resolveRemoteUpdate queues remote content while typing or composing", () => {
  const dirtyResult = resolveRemoteUpdate({
    content: "remote",
    frontmatter: "{\"title\":\"Remote\"}",
    currentContent: "local",
    currentFrontmatter: "{\"title\":\"Local\"}",
    lastSavedContent: "base",
    lastSavedFrontmatter: "{\"title\":\"Base\"}",
    isDirty: true,
    isComposing: false,
    hasPendingRemoteUpdate: false,
    originClientId: "window-b",
    editorClientId: "window-a",
  });
  assert.deepEqual(dirtyResult, {
    action: "queue",
    snapshot: {
      content: "remote",
      frontmatter: "{\"title\":\"Remote\"}",
      baseContent: "base",
      baseFrontmatter: "{\"title\":\"Base\"}",
    },
  });

  const composingResult = resolveRemoteUpdate({
    content: "remote",
    frontmatter: "{\"title\":\"Remote\"}",
    currentContent: "local",
    currentFrontmatter: "{\"title\":\"Local\"}",
    lastSavedContent: "base",
    lastSavedFrontmatter: "{\"title\":\"Base\"}",
    isDirty: false,
    isComposing: true,
    hasPendingRemoteUpdate: false,
    originClientId: "window-b",
    editorClientId: "window-a",
  });
  assert.deepEqual(composingResult, {
    action: "queue",
    snapshot: {
      content: "remote",
      frontmatter: "{\"title\":\"Remote\"}",
      baseContent: "base",
      baseFrontmatter: "{\"title\":\"Base\"}",
    },
  });
});

test("resolveRemoteUpdate applies clean external changes without conflict", () => {
  const result = resolveRemoteUpdate({
    content: "remote",
    frontmatter: "{\"title\":\"Remote\"}",
    currentContent: "local",
    currentFrontmatter: "{\"title\":\"Local\"}",
    lastSavedContent: "saved",
    lastSavedFrontmatter: "{\"title\":\"Saved\"}",
    isDirty: false,
    isComposing: false,
    hasPendingRemoteUpdate: false,
    originClientId: "window-b",
    editorClientId: "window-a",
  });

  assert.deepEqual(result, {
    action: "apply",
    content: "remote",
    frontmatter: "{\"title\":\"Remote\"}",
    saveStatus: "saved",
  });
});

test("resolveSaveSuccess preserves last acknowledged content while keeping dirty state separate", () => {
  const newerLocalEdits = resolveSaveSuccess({
    hasPendingRemoteUpdate: false,
    hasNewerLocalEdits: true,
    isDirty: true,
    requestedContent: "saved snapshot",
  });
  assert.deepEqual(newerLocalEdits, {
    lastSavedContent: "saved snapshot",
    saveStatus: "idle",
  });

  const pendingRemote = resolveSaveSuccess({
    hasPendingRemoteUpdate: true,
    hasNewerLocalEdits: false,
    isDirty: false,
    requestedContent: "saved snapshot",
  });
  assert.deepEqual(pendingRemote, {
    lastSavedContent: "saved snapshot",
    saveStatus: "saved",
  });
});

test("shouldReloadAfterCompositionEnd only reloads when a remote update is pending and local edits are clean", () => {
  assert.equal(shouldReloadAfterCompositionEnd({ hasPendingRemoteUpdate: true, isDirty: false }), true);
  assert.equal(shouldReloadAfterCompositionEnd({ hasPendingRemoteUpdate: true, isDirty: true }), false);
  assert.equal(shouldReloadAfterCompositionEnd({ hasPendingRemoteUpdate: false, isDirty: false }), false);
});

test("shouldApplySaveResponse rejects stale saves from another document context", () => {
  assert.equal(shouldApplySaveResponse({
    currentPath: "a.md",
    requestedPath: "a.md",
    hasCurrentDoc: true,
  }), true);
  assert.equal(shouldApplySaveResponse({
    currentPath: "b.md",
    requestedPath: "a.md",
    hasCurrentDoc: true,
  }), false);
  assert.equal(shouldApplySaveResponse({
    currentPath: "a.md",
    requestedPath: "a.md",
    hasCurrentDoc: false,
  }), false);
});

test("mergeConcurrentContent merges non-overlapping line edits", () => {
  const result = mergeConcurrentContent({
    base: "A\nB\nC\n",
    local: "A\nB-local\nC\n",
    remote: "A\nB\nC\nD-remote\n",
  });

  assert.deepEqual(result, {
    content: "A\nB-local\nC\nD-remote\n",
    hadRemoteChanges: true,
    droppedRemoteChanges: false,
  });
});

test("mergeConcurrentContent keeps local text on overlapping edits", () => {
  const result = mergeConcurrentContent({
    base: "hello\n",
    local: "hello local\n",
    remote: "hello remote\n",
  });

  assert.deepEqual(result, {
    content: "hello local\n",
    hadRemoteChanges: true,
    droppedRemoteChanges: true,
  });
});

test("mergeConcurrentFrontmatter merges field-level changes and prefers local on overlap", () => {
  const merged = mergeConcurrentFrontmatter({
    base: JSON.stringify({ title: "Base", tags: ["a"] }),
    local: JSON.stringify({ title: "Local", tags: ["a"] }),
    remote: JSON.stringify({ title: "Base", tags: ["a"], status: "draft" }),
  });
  assert.deepEqual(merged, {
    frontmatter: JSON.stringify({ title: "Local", tags: ["a"], status: "draft" }),
    hadRemoteChanges: true,
    droppedRemoteChanges: false,
  });

  const overlap = mergeConcurrentFrontmatter({
    base: JSON.stringify({ title: "Base" }),
    local: JSON.stringify({ title: "Local" }),
    remote: JSON.stringify({ title: "Remote" }),
  });
  assert.deepEqual(overlap, {
    frontmatter: JSON.stringify({ title: "Local" }),
    hadRemoteChanges: true,
    droppedRemoteChanges: true,
  });
});
