import assert from "node:assert/strict";
import test from "node:test";

import {
  activeOutlineId,
  collectOutlineItemsFromMarkdown,
} from "../src/components/editor/outline.ts";

test("collectOutlineItemsFromMarkdown extracts only h2-h4 headings with stable positions", () => {
  const markdown = [
    "# Title",
    "",
    "Intro",
    "",
    "## Section",
    "Body",
    "### Subsection",
    "More",
    "#### Detail",
    "End",
  ].join("\n");

  const items = collectOutlineItemsFromMarkdown(markdown);
  assert.deepEqual(items, [
    { id: "outline-4-16", label: "Section", level: 2, pos: 19 },
    { id: "outline-6-32", label: "Subsection", level: 3, pos: 36 },
    { id: "outline-8-52", label: "Detail", level: 4, pos: 57 },
  ]);
});

test("collectOutlineItemsFromMarkdown ignores h1 and headings deeper than h4", () => {
  const markdown = "# Title\n##### Too deep\n## Keep me\n";
  const items = collectOutlineItemsFromMarkdown(markdown);
  assert.deepEqual(items, [
    { id: "outline-2-23", label: "Keep me", level: 2, pos: 26 },
  ]);
});

test("activeOutlineId returns the most recent outline entry before the selection", () => {
  const items = collectOutlineItemsFromMarkdown("## A\ntext\n### B\ntext\n#### C\n");
  assert.equal(activeOutlineId(items, 0), null);
  assert.equal(activeOutlineId(items, 5), items[0]?.id ?? null);
  assert.equal(activeOutlineId(items, 14), items[1]?.id ?? null);
  assert.equal(activeOutlineId(items, 26), items[2]?.id ?? null);
});
