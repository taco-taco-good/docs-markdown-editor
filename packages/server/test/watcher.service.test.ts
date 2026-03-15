import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { DocumentService } from "../src/services/document.service.ts";
import { RealtimeService } from "../src/services/realtime.service.ts";
import { SearchService } from "../src/services/search.service.ts";
import { WatcherService } from "../src/services/watcher.service.ts";

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "docs-md-watch-"));
}

test("WatcherService detects external markdown updates", () => {
  const workspace = createWorkspace();
  mkdirSync(path.join(workspace, "guide"), { recursive: true });
  const docPath = path.join(workspace, "guide", "intro.md");
  writeFileSync(docPath, "# Intro\n\nfirst\n", "utf8");

  const watcher = new WatcherService({
    workspaceRoot: workspace,
    documentService: new DocumentService(workspace),
    realtimeService: new RealtimeService(),
    searchService: new SearchService(workspace),
  });

  writeFileSync(docPath, "# Intro\n\nupdated\n", "utf8");
  const events = watcher.refresh();

  assert.deepEqual(events, [{ type: "file:updated", path: "guide/intro.md" }]);
});

test("WatcherService detects new directories and markdown files", () => {
  const workspace = createWorkspace();
  const watcher = new WatcherService({
    workspaceRoot: workspace,
    documentService: new DocumentService(workspace),
    realtimeService: new RealtimeService(),
    searchService: new SearchService(workspace),
  });

  mkdirSync(path.join(workspace, "notes"), { recursive: true });
  writeFileSync(path.join(workspace, "notes", "today.md"), "# Today\n", "utf8");
  const events = watcher.refresh();

  assert.deepEqual(events, [
    { type: "dir:created", path: "notes" },
    { type: "file:created", path: "notes/today.md" },
  ]);
});
