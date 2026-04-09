import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSaveStatus,
  mergeConcurrentMarkdown,
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
    raw: "remote",
    currentRaw: "local",
    lastSavedRaw: "saved",
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
    raw: "remote",
    currentRaw: "local",
    lastSavedRaw: "base",
    isDirty: true,
    isComposing: false,
    hasPendingRemoteUpdate: false,
    originClientId: "window-b",
    editorClientId: "window-a",
  });
  assert.deepEqual(dirtyResult, {
    action: "queue",
    snapshot: {
      raw: "remote",
      baseRaw: "base",
    },
  });

  const composingResult = resolveRemoteUpdate({
    raw: "remote",
    currentRaw: "local",
    lastSavedRaw: "base",
    isDirty: false,
    isComposing: true,
    hasPendingRemoteUpdate: false,
    originClientId: "window-b",
    editorClientId: "window-a",
  });
  assert.deepEqual(composingResult, {
    action: "queue",
    snapshot: {
      raw: "remote",
      baseRaw: "base",
    },
  });
});

test("resolveRemoteUpdate applies clean external changes without conflict", () => {
  const result = resolveRemoteUpdate({
    raw: "remote",
    currentRaw: "local",
    lastSavedRaw: "saved",
    isDirty: false,
    isComposing: false,
    hasPendingRemoteUpdate: false,
    originClientId: "window-b",
    editorClientId: "window-a",
  });

  assert.deepEqual(result, {
    action: "apply",
    raw: "remote",
    saveStatus: "saved",
  });
});

test("resolveSaveSuccess preserves last acknowledged content while keeping dirty state separate", () => {
  const newerLocalEdits = resolveSaveSuccess({
    hasPendingRemoteUpdate: false,
    hasNewerLocalEdits: true,
    isDirty: true,
    requestedRaw: "saved snapshot",
  });
  assert.deepEqual(newerLocalEdits, {
    lastSavedRaw: "saved snapshot",
    saveStatus: "idle",
  });

  const pendingRemote = resolveSaveSuccess({
    hasPendingRemoteUpdate: true,
    hasNewerLocalEdits: false,
    isDirty: false,
    requestedRaw: "saved snapshot",
  });
  assert.deepEqual(pendingRemote, {
    lastSavedRaw: "saved snapshot",
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

test("mergeConcurrentMarkdown merges non-overlapping line edits", () => {
  const result = mergeConcurrentMarkdown({
    base: "A\nB\nC\n",
    local: "A\nB-local\nC\n",
    remote: "A\nB\nC\nD-remote\n",
  });

  assert.deepEqual(result, {
    raw: "A\nB-local\nC\nD-remote\n",
    hadRemoteChanges: true,
    droppedRemoteChanges: false,
  });
});

test("mergeConcurrentMarkdown keeps local text on overlapping edits", () => {
  const result = mergeConcurrentMarkdown({
    base: "hello\n",
    local: "hello local\n",
    remote: "hello remote\n",
  });

  assert.deepEqual(result, {
    raw: "hello local\n",
    hadRemoteChanges: true,
    droppedRemoteChanges: true,
  });
});
