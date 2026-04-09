import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { RESERVED_DIRECTORIES, resolveWorkspacePath } from "../lib/workspace.ts";
import { DocumentService } from "./document.service.ts";
import { RealtimeService, type WorkspaceEvent } from "./realtime.service.ts";
import { SearchService } from "./search.service.ts";

interface FileSnapshot {
  modifiedMs: number;
  size: number;
}

interface WorkspaceSnapshot {
  directories: Set<string>;
  files: Map<string, FileSnapshot>;
}

export class WatcherService {
  private readonly workspaceRoot: string;
  private readonly documentService: DocumentService;
  private readonly realtimeService: RealtimeService;
  private readonly searchService: SearchService;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private snapshot: WorkspaceSnapshot;

  /**
   * Files recently written by the server (via API save).
   * The watcher should skip broadcasting doc:content for these
   * to avoid a feedback loop where the saving client receives
   * its own change back with originClientId: null.
   */
  private recentServerWrites = new Map<string, number>();
  private static readonly SUPPRESS_WINDOW_MS = 2000;

  constructor(options: {
    workspaceRoot: string;
    documentService: DocumentService;
    realtimeService: RealtimeService;
    searchService: SearchService;
    intervalMs?: number;
  }) {
    this.workspaceRoot = options.workspaceRoot;
    this.documentService = options.documentService;
    this.realtimeService = options.realtimeService;
    this.searchService = options.searchService;
    this.intervalMs = options.intervalMs ?? 500;
    this.snapshot = this.captureSnapshot();
  }

  /** Mark a file as recently written by the server (call after API save). */
  suppressNextChange(filePath: string): void {
    this.recentServerWrites.set(filePath, Date.now());
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.refresh();
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  refresh(): WorkspaceEvent[] {
    const next = this.captureSnapshot();
    const events: WorkspaceEvent[] = [];

    for (const directory of next.directories) {
      if (!this.snapshot.directories.has(directory)) {
        events.push({ type: "dir:created", path: directory });
      }
    }
    for (const directory of this.snapshot.directories) {
      if (!next.directories.has(directory)) {
        events.push({ type: "dir:deleted", path: directory });
      }
    }

    for (const [filePath, current] of next.files.entries()) {
      const previous = this.snapshot.files.get(filePath);
      if (!previous) {
        events.push({ type: "file:created", path: filePath });
        continue;
      }
      if (previous.modifiedMs !== current.modifiedMs || previous.size !== current.size) {
        events.push({ type: "file:updated", path: filePath });
      }
    }

    for (const filePath of this.snapshot.files.keys()) {
      if (!next.files.has(filePath)) {
        events.push({ type: "file:deleted", path: filePath });
      }
    }

    this.snapshot = next;
    if (events.length === 0) return events;

    this.searchService.buildIndex();

    // Purge expired suppression entries.
    const now = Date.now();
    for (const [suppressedPath, timestamp] of this.recentServerWrites) {
      if (now - timestamp > WatcherService.SUPPRESS_WINDOW_MS) {
        this.recentServerWrites.delete(suppressedPath);
      }
    }

    for (const event of events) {
      this.realtimeService.publish(event);
      if (event.type === "file:created" || event.type === "file:updated") {
        // Skip doc:content broadcast for files the server just wrote.
        // The save route already published a proper event with originClientId.
        if (this.recentServerWrites.has(event.path)) {
          this.recentServerWrites.delete(event.path);
          continue;
        }

        try {
          const document = this.documentService.read(event.path);
          this.realtimeService.publish({
            type: "doc:content",
            path: event.path,
            content: document.content,
            raw: document.raw,
            revision: document.revision,
            frontmatter: document.frontmatter,
            originClientId: null,
          });
        } catch {
          // Ignore files that disappear mid-refresh.
        }
      }
    }

    this.realtimeService.publish({ type: "tree:changed" });
    return events;
  }

  private captureSnapshot(): WorkspaceSnapshot {
    const root = path.resolve(this.workspaceRoot);
    const directories = new Set<string>();
    const files = new Map<string, FileSnapshot>();

    const visit = (absoluteDirectory: string): void => {
      for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
        if (RESERVED_DIRECTORIES.has(entry.name)) continue;
        const absolutePath = path.join(absoluteDirectory, entry.name);
        const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");

        if (entry.isDirectory()) {
          directories.add(relativePath);
          visit(absolutePath);
          continue;
        }

        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const stats = statSync(resolveWorkspacePath(this.workspaceRoot, relativePath));
        files.set(relativePath, {
          modifiedMs: stats.mtimeMs,
          size: stats.size,
        });
      }
    };

    visit(root);
    return { directories, files };
  }
}
