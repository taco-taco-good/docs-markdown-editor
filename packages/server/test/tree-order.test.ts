import assert from "node:assert/strict";
import test from "node:test";

import {
  orderedEntryNames,
  appendToParentOrder,
  removeFromParentOrder,
  replaceInParentOrder,
  insertAroundSibling,
  remapOrderKeys,
  removeDescendantOrder,
  type TreeOrderState,
} from "../src/lib/tree-order.ts";

test("orderedEntryNames returns known entries first then remainder sorted", () => {
  const state: TreeOrderState = {
    "": ["gamma.md", "alpha.md"],
  };

  const result = orderedEntryNames(
    ["alpha.md", "beta.md", "gamma.md", "delta.md"],
    state,
    "",
  );

  assert.deepEqual(result, ["gamma.md", "alpha.md", "beta.md", "delta.md"]);
});

test("orderedEntryNames filters out stale entries from ordering", () => {
  const state: TreeOrderState = {
    docs: ["removed.md", "kept.md"],
  };

  const result = orderedEntryNames(["kept.md", "new.md"], state, "docs");
  assert.deepEqual(result, ["kept.md", "new.md"]);
});

test("orderedEntryNames returns sorted entries when no ordering exists", () => {
  const state: TreeOrderState = {};

  const result = orderedEntryNames(["c.md", "a.md", "b.md"], state, "");
  assert.deepEqual(result, ["a.md", "b.md", "c.md"]);
});

test("appendToParentOrder adds entry to end, deduplicating", () => {
  const state: TreeOrderState = { "": ["a.md", "b.md"] };

  appendToParentOrder(state, "", "c.md");
  assert.deepEqual(state[""], ["a.md", "b.md", "c.md"]);

  // Appending existing entry moves it to end
  appendToParentOrder(state, "", "a.md");
  assert.deepEqual(state[""], ["b.md", "c.md", "a.md"]);
});

test("appendToParentOrder creates new key if absent", () => {
  const state: TreeOrderState = {};
  appendToParentOrder(state, "guide", "intro.md");
  assert.deepEqual(state["guide"], ["intro.md"]);
});

test("removeFromParentOrder removes entry and cleans up empty keys", () => {
  const state: TreeOrderState = { "": ["a.md", "b.md"] };

  removeFromParentOrder(state, "", "a.md");
  assert.deepEqual(state[""], ["b.md"]);

  removeFromParentOrder(state, "", "b.md");
  assert.equal(state[""], undefined);
});

test("replaceInParentOrder swaps entry name in-place", () => {
  const state: TreeOrderState = { "": ["a.md", "b.md", "c.md"] };

  replaceInParentOrder(state, "", "b.md", "renamed.md");
  assert.deepEqual(state[""], ["a.md", "renamed.md", "c.md"]);
});

test("replaceInParentOrder appends if previous name not found", () => {
  const state: TreeOrderState = { "": ["a.md"] };

  replaceInParentOrder(state, "", "missing.md", "new.md");
  assert.deepEqual(state[""], ["a.md", "new.md"]);
});

test("insertAroundSibling places entry before sibling", () => {
  const state: TreeOrderState = { "": ["a.md", "b.md", "c.md"] };

  insertAroundSibling(state, "", "new.md", "b.md", "before", ["a.md", "b.md", "c.md"]);
  assert.deepEqual(state[""], ["a.md", "new.md", "b.md", "c.md"]);
});

test("insertAroundSibling places entry after sibling", () => {
  const state: TreeOrderState = { "": ["a.md", "b.md", "c.md"] };

  insertAroundSibling(state, "", "new.md", "b.md", "after", ["a.md", "b.md", "c.md"]);
  assert.deepEqual(state[""], ["a.md", "b.md", "new.md", "c.md"]);
});

test("insertAroundSibling appends if sibling not found", () => {
  const state: TreeOrderState = {};

  insertAroundSibling(state, "", "new.md", "missing.md", "before", ["a.md"]);
  assert.deepEqual(state[""], ["a.md", "new.md"]);
});

test("remapOrderKeys moves nested keys to new prefix", () => {
  const state: TreeOrderState = {
    guide: ["intro.md", "setup.md"],
    "guide/advanced": ["api.md"],
    unrelated: ["other.md"],
  };

  remapOrderKeys(state, "guide", "archive");

  assert.deepEqual(state["archive"], ["intro.md", "setup.md"]);
  assert.deepEqual(state["archive/advanced"], ["api.md"]);
  assert.deepEqual(state["unrelated"], ["other.md"]);
  assert.equal(state["guide"], undefined);
  assert.equal(state["guide/advanced"], undefined);
});

test("removeDescendantOrder removes target and all nested keys", () => {
  const state: TreeOrderState = {
    "": ["guide"],
    guide: ["intro.md"],
    "guide/nested": ["deep.md"],
    other: ["file.md"],
  };

  removeDescendantOrder(state, "guide");

  assert.deepEqual(state[""], ["guide"]);
  assert.equal(state["guide"], undefined);
  assert.equal(state["guide/nested"], undefined);
  assert.deepEqual(state["other"], ["file.md"]);
});
