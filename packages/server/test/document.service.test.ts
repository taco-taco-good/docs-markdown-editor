import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { AuditService } from "../src/services/audit.service.ts";
import { DocumentService } from "../src/services/document.service.ts";

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "docs-md-docs-"));
}

test("DocumentService preserves frontmatter bytes on body-only save", () => {
  const workspace = createWorkspace();
  const docPath = "guide/intro.md";
  const absolutePath = path.join(workspace, docPath);
  const raw = "---\ntitle: Intro\ntags: [docs]\ncustom_field: keep\n---\n\n# Intro\n\nhello\n";
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, raw, { encoding: "utf8", flag: "w" });

  const service = new DocumentService(workspace, new AuditService(workspace));
  const before = service.read(docPath);
  const updated = service.write(docPath, before.content.replace("hello", "updated"));
  const afterRaw = readFileSync(absolutePath, "utf8");

  assert.equal(updated.changed, true);
  assert.ok(afterRaw.startsWith("---\ntitle: Intro\ntags: [docs]\ncustom_field: keep\n---\n\n"));
  assert.match(afterRaw, /updated/);
});

test("DocumentService no-op save does not change raw content", () => {
  const workspace = createWorkspace();
  const docPath = "guide/noop.md";
  const absolutePath = path.join(workspace, docPath);
  const raw = "# Same\n\nunchanged\n";
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, raw, { encoding: "utf8", flag: "w" });

  const service = new DocumentService(workspace);
  const result = service.write(docPath, raw);
  assert.equal(result.changed, false);
  assert.equal(readFileSync(absolutePath, "utf8"), raw);
});

test("DocumentService explicit frontmatter update rewrites only on demand", () => {
  const workspace = createWorkspace();
  const docPath = "guide/meta.md";
  const absolutePath = path.join(workspace, docPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, "---\ntitle: Meta\ntags: [one]\n---\n\nbody\n", "utf8");

  const service = new DocumentService(workspace);
  const result = service.updateFrontmatter(docPath, { tags: ["one", "two"] });

  assert.equal(result.changed, true);
  assert.match(readFileSync(absolutePath, "utf8"), /tags: \[one, two\]/);
});
