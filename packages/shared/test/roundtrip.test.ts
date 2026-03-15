import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  analyzeMarkdownSupport,
  composeRawPreservingFrontmatter,
  parseMarkdownDocument,
} from "../src/markdown-document.ts";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures", "roundtrip");

for (const fixture of readdirSync(FIXTURES_DIR).sort()) {
  test(`no-op roundtrip preserves bytes for ${fixture}`, () => {
    const raw = readFileSync(path.join(FIXTURES_DIR, fixture), "utf8");
    const document = parseMarkdownDocument(raw);
    const result = composeRawPreservingFrontmatter(document, document.body);
    assert.equal(result, raw);
  });
}

test("body-only edit preserves frontmatter bytes", () => {
  const raw = readFileSync(path.join(FIXTURES_DIR, "08-frontmatter-custom.md"), "utf8");
  const document = parseMarkdownDocument(raw);
  const nextBody = document.body.replace("Body text.", "Updated body.");
  const result = composeRawPreservingFrontmatter(document, nextBody);

  assert.ok(result.startsWith(document.rawFrontmatterBlock));
  assert.equal(document.rawFrontmatterBlock, parseMarkdownDocument(result).rawFrontmatterBlock);
  assert.match(result, /Updated body\./);
});

test("unsupported markdown is flagged for raw-mode fallback", () => {
  const raw = readFileSync(path.join(FIXTURES_DIR, "12-unsupported-edge.md"), "utf8");
  const analysis = analyzeMarkdownSupport(raw);
  assert.equal(analysis.supportedInWysiwyg, false);
  assert.ok(analysis.reasons.length > 0);
});

test("gfm tables are supported in wysiwyg mode", () => {
  const raw = readFileSync(path.join(FIXTURES_DIR, "05-tables.md"), "utf8");
  const analysis = analyzeMarkdownSupport(raw);
  assert.equal(analysis.supportedInWysiwyg, true);
});

test("task lists are supported in wysiwyg mode", () => {
  const raw = readFileSync(path.join(FIXTURES_DIR, "03-task-lists.md"), "utf8");
  const analysis = analyzeMarkdownSupport(raw);
  assert.equal(analysis.supportedInWysiwyg, true);
});
