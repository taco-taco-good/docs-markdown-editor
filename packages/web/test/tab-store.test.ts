import assert from "node:assert/strict";
import test from "node:test";

import { resetTabStoreForTests, useTabStore } from "../src/stores/tab.store.ts";

test("tab store supports pinning and drag-style reordering", () => {
  resetTabStoreForTests();

  useTabStore.getState().openTab("notes/a.md", "A");
  useTabStore.getState().openTab("notes/b.md", "B");
  useTabStore.getState().openTab("notes/c.md", "C");

  useTabStore.getState().setPinned("notes/c.md", true);
  assert.deepEqual(
    useTabStore.getState().openTabs.map((tab) => ({ path: tab.path, pinned: tab.pinned })),
    [
      { path: "notes/c.md", pinned: true },
      { path: "notes/a.md", pinned: false },
      { path: "notes/b.md", pinned: false },
    ],
  );

  useTabStore.getState().moveTab("notes/b.md", 1);
  assert.deepEqual(
    useTabStore.getState().openTabs.map((tab) => tab.path),
    ["notes/c.md", "notes/b.md", "notes/a.md"],
  );
});

test("tab store can close tabs to the right and close all while keeping pinned tabs", () => {
  resetTabStoreForTests();

  useTabStore.getState().openTab("notes/a.md", "A");
  useTabStore.getState().openTab("notes/b.md", "B");
  useTabStore.getState().openTab("notes/c.md", "C");
  useTabStore.getState().openTab("notes/d.md", "D");
  useTabStore.getState().setPinned("notes/a.md", true);

  useTabStore.getState().closeTabsToRight("notes/b.md");
  assert.deepEqual(
    useTabStore.getState().openTabs.map((tab) => tab.path),
    ["notes/a.md", "notes/b.md"],
  );

  useTabStore.getState().closeAllTabs({ keepPinned: true, preferredActivePath: "notes/a.md" });
  assert.deepEqual(
    useTabStore.getState().openTabs.map((tab) => tab.path),
    ["notes/a.md"],
  );
  assert.equal(useTabStore.getState().activeTabPath, "notes/a.md");
});
