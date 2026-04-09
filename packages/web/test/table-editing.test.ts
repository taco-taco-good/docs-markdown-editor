import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMarkdownTableText,
  moveToNextMarkdownTableCellText,
  moveToPreviousMarkdownTableCellText,
} from "../src/components/editor/codemirror/table-editing.ts";

test("formatMarkdownTableText formats a markdown table with aligned pipes", () => {
  const source = "|b|a|\n|-|-|\n|x|y|";
  const result = formatMarkdownTableText(source, 2);

  assert.deepEqual(result, {
    doc: "| b   | a   |\n| --- | --- |\n| x   | y   |",
    selection: { from: 3, to: 3 },
  });
});

test("moveToNextMarkdownTableCellText selects the next cell content", () => {
  const source = "| Name | Role |\n| --- | --- |\n| Alpha | Editor |";
  const result = moveToNextMarkdownTableCellText(source, 2);

  assert.deepEqual(result, {
    doc: "| Name  | Role   |\n| ----- | ------ |\n| Alpha | Editor |",
    selection: { from: 10, to: 14 },
  });
});

test("moveToPreviousMarkdownTableCellText selects the previous cell content", () => {
  const source = "| Name | Role |\n| --- | --- |\n| Alpha | Editor |";
  const result = moveToPreviousMarkdownTableCellText(source, source.length - 2);

  assert.deepEqual(result, {
    doc: "| Name  | Role   |\n| ----- | ------ |\n| Alpha | Editor |",
    selection: { from: 40, to: 45 },
  });
});
