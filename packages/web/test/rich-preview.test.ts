import assert from "node:assert/strict";
import test from "node:test";

import {
  findHeadingPosition,
  resolveAtReferenceTarget,
  resolveEditorReferenceTarget,
  resolveMarkdownLinkTarget,
  slugifyHeading,
} from "../src/components/editor/codemirror/navigation.ts";
import { parseMarkdownTable } from "../src/components/editor/codemirror/table-render.ts";

test("resolveMarkdownLinkTarget resolves external urls separately", () => {
  assert.deepEqual(
    resolveMarkdownLinkTarget("guide/welcome.md", "https://example.com/docs"),
    { type: "external", url: "https://example.com/docs" },
  );
});

test("resolveMarkdownLinkTarget resolves relative markdown links against the current document", () => {
  assert.deepEqual(
    resolveMarkdownLinkTarget("guide/welcome.md", "../notes/todo.md#Next"),
    { type: "internal", path: "notes/todo.md", anchor: "Next" },
  );
});

test("resolveMarkdownLinkTarget resolves in-document anchors", () => {
  assert.deepEqual(
    resolveMarkdownLinkTarget("guide/welcome.md", "#Section Two"),
    { type: "internal", path: "guide/welcome.md", anchor: "Section Two" },
  );
});

test("resolveAtReferenceTarget resolves workspace-relative references to markdown documents", () => {
  assert.deepEqual(
    resolveAtReferenceTarget("guide/welcome.md", "@../notes/todo#Next"),
    { type: "internal", path: "notes/todo.md", anchor: "Next" },
  );
});

test("resolveEditorReferenceTarget delegates @ references to internal markdown targets", () => {
  assert.deepEqual(
    resolveEditorReferenceTarget("guide/welcome.md", "@daily/2026-04-09"),
    { type: "internal", path: "guide/daily/2026-04-09.md" },
  );
});

test("slugifyHeading keeps korean text while normalizing punctuation and spaces", () => {
  assert.equal(slugifyHeading("  새 제목! Alpha Beta  "), "새-제목-alpha-beta");
});

test("findHeadingPosition locates headings by slugified anchor", () => {
  const markdown = "# Title\n\n## 새 제목!\n내용\n\n### Alpha Beta\n";
  assert.equal(findHeadingPosition(markdown, "새-제목"), 12);
  assert.equal(findHeadingPosition(markdown, "alpha-beta"), 26);
});

test("parseMarkdownTable extracts headers, alignment, and rows", () => {
  const parsed = parseMarkdownTable([
    "| Name | Role | Status |",
    "| :--- | ---: | :---: |",
    "| Alpha | Editor | Active |",
    "| Beta | Preview | Pending |",
  ].join("\n"));

  assert.deepEqual(parsed, {
    header: ["Name", "Role", "Status"],
    alignments: ["left", "right", "center"],
    rows: [
      ["Alpha", "Editor", "Active"],
      ["Beta", "Preview", "Pending"],
    ],
  });
});

test("parseMarkdownTable keeps escaped pipes inside a cell with remark-gfm parsing", () => {
  const parsed = parseMarkdownTable([
    "| Name | Notes |",
    "| --- | --- |",
    "| Alpha | a \\| b |",
  ].join("\n"));

  assert.deepEqual(parsed, {
    header: ["Name", "Notes"],
    alignments: ["", ""],
    rows: [["Alpha", "a \\| b"]],
  });
});
