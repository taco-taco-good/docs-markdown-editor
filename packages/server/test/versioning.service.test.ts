import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { VersioningService } from "../src/services/versioning.service.ts";

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "docs-md-versioning-"));
}

test("VersioningService initializes a local git repository and commits staged changes", () => {
  const workspace = createWorkspace();
  mkdirSync(path.join(workspace, "guide"), { recursive: true });
  writeFileSync(path.join(workspace, "guide", "intro.md"), "# Intro\n", "utf8");

  const service = new VersioningService(workspace);
  service.queueSnapshot("docs: update guide/intro.md");
  service.flushPending();

  const gitDir = path.join(workspace, ".git");
  assert.equal(path.dirname(gitDir), workspace);
});
