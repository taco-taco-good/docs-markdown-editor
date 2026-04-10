import assert from "node:assert/strict";
import test from "node:test";

import { expandAncestorPaths } from "../src/lib/tree-selection.ts";

test("expandAncestorPaths opens all parent folders for a nested document path", () => {
  const expanded = expandAncestorPaths(new Set<string>(), "logs/2026-03/2026-03-09-mon.md");
  assert.deepEqual(
    [...expanded],
    ["logs", "logs/2026-03"],
  );
});

test("expandAncestorPaths preserves existing expansions", () => {
  const expanded = expandAncestorPaths(new Set<string>(["notes"]), "logs/2026-03/2026-03-09-mon.md");
  assert.deepEqual(
    [...expanded],
    ["notes", "logs", "logs/2026-03"],
  );
});

test("expandAncestorPaths ignores top-level file paths", () => {
  const expanded = expandAncestorPaths(new Set<string>(["notes"]), "README.md");
  assert.deepEqual([...expanded], ["notes"]);
});
