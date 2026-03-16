import assert from "node:assert/strict";
import test from "node:test";

import { resolveDropIntentFromRatio } from "../src/lib/tree-dnd.ts";

const fileNode = { path: "docs/file.md", type: "file", name: "file.md" };
const dirNode = { path: "docs/folder", type: "directory", name: "folder" };

test("resolveDropIntentFromRatio uses outline-style zones for directories", () => {
  assert.deepEqual(
    resolveDropIntentFromRatio("docs/file.md", dirNode, 0.1),
    { targetPath: "docs/folder", mode: "before" },
  );
  assert.deepEqual(
    resolveDropIntentFromRatio("docs/file.md", dirNode, 0.5),
    { targetPath: "docs/folder", mode: "inside" },
  );
  assert.deepEqual(
    resolveDropIntentFromRatio("docs/file.md", dirNode, 0.9),
    { targetPath: "docs/folder", mode: "after" },
  );
});

test("resolveDropIntentFromRatio uses midpoint zones for files and blocks descendant moves", () => {
  assert.deepEqual(
    resolveDropIntentFromRatio("docs/other.md", fileNode, 0.2),
    { targetPath: "docs/file.md", mode: "before" },
  );
  assert.deepEqual(
    resolveDropIntentFromRatio("docs/other.md", fileNode, 0.8),
    { targetPath: "docs/file.md", mode: "after" },
  );
  assert.equal(
    resolveDropIntentFromRatio("docs/folder/child.md", dirNode, 0.5),
    null,
  );
});
