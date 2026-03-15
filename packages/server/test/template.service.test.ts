import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { TemplateService } from "../src/services/template.service.ts";

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "docs-md-template-"));
}

test("TemplateService materializes default templates in .docs/templates", () => {
  const workspace = createWorkspace();
  const service = new TemplateService(workspace);

  const templates = service.listTemplates();

  assert.ok(templates.some((template) => template.name === "default"));
  assert.ok(templates.some((template) => template.name === "meeting-note"));
  assert.ok(templates.some((template) => template.name === "tech-spec"));
  assert.equal(existsSync(path.join(workspace, ".docs", "templates", "default.md")), true);
});

test("TemplateService renders variables into template content", () => {
  const workspace = createWorkspace();
  const service = new TemplateService(workspace);

  const rendered = service.renderTemplate("meeting-note", {
    title: "Sprint Planning",
    author: "alice",
    date: "2026-03-09",
  });

  assert.match(rendered, /title: "Sprint Planning"/);
  assert.match(rendered, /author: "alice"/);
  assert.match(rendered, /date: "2026-03-09"/);
  assert.match(rendered, /## Decisions/);
});

test("TemplateService writes and deletes custom templates", () => {
  const workspace = createWorkspace();
  const service = new TemplateService(workspace);

  const created = service.writeTemplate("custom-note", "---\ntitle: \"{{title}}\"\n---\n\n# {{title}}\n");
  assert.equal(created.name, "custom-note");
  assert.equal(service.hasTemplate("custom-note"), true);

  service.deleteTemplate("custom-note");
  assert.equal(service.hasTemplate("custom-note"), false);
});
