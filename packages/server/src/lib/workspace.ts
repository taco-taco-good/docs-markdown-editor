import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";

import {
  readTreeOrderState,
  writeTreeOrderState,
  appendToParentOrder,
  removeFromParentOrder,
  replaceInParentOrder,
  insertAroundSibling,
  remapOrderKeys,
  removeDescendantOrder,
} from "./tree-order.ts";

// Re-export for backward compatibility
export { buildTree, listMarkdownFiles } from "./tree-builder.ts";
export type { WorkspaceDocumentMeta, WorkspaceTreeNode } from "./tree-builder.ts";

export const RESERVED_DIRECTORIES = new Set([".docs", ".assets", ".git", "node_modules"]);

export type WorkspaceMovePlacement = "path" | "inside" | "before" | "after" | "root";

export function ensureParentDirectory(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const resolved = path.resolve(workspaceRoot, relativePath);
  const root = path.resolve(workspaceRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("PATH_TRAVERSAL");
  }
  return resolved;
}

export function isReservedWorkspaceName(name: string): boolean {
  return RESERVED_DIRECTORIES.has(name);
}

// ── Internal helpers ──

function parentPath(relativePath: string): string {
  const segments = relativePath.split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
}

function basename(relativePath: string): string {
  const segments = relativePath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? relativePath;
}

function listVisibleEntryNames(workspaceRoot: string, directoryPath: string): string[] {
  const directoryAbsolute = directoryPath
    ? resolveWorkspacePath(workspaceRoot, directoryPath)
    : path.resolve(workspaceRoot);
  return readdirSync(directoryAbsolute, { withFileTypes: true })
    .filter((entry) => {
      if (RESERVED_DIRECTORIES.has(entry.name)) return false;
      return entry.isDirectory() || (entry.isFile() && entry.name.endsWith(".md"));
    })
    .map((entry) => entry.name);
}

function updateOrderForCreatedEntry(workspaceRoot: string, relativePath: string): void {
  const state = readTreeOrderState(workspaceRoot);
  appendToParentOrder(state, parentPath(relativePath), basename(relativePath));
  writeTreeOrderState(workspaceRoot, state);
}

// ── Public operations ──

export function createWorkspaceDirectory(workspaceRoot: string, relativePath: string): string {
  if (!relativePath.trim()) {
    throw new Error("VALIDATION_ERROR");
  }

  const normalized = relativePath.split("/").filter(Boolean).join("/");
  if (!normalized || normalized.endsWith(".md")) {
    throw new Error("VALIDATION_ERROR");
  }
  if (normalized.split("/").some(isReservedWorkspaceName)) {
    throw new Error("PATH_TRAVERSAL");
  }

  const absolutePath = resolveWorkspacePath(workspaceRoot, normalized);
  if (existsSync(absolutePath)) {
    throw new Error("ALREADY_EXISTS");
  }

  mkdirSync(absolutePath, { recursive: true });
  updateOrderForCreatedEntry(workspaceRoot, normalized);
  return normalized;
}

export function moveWorkspaceEntry(
  workspaceRoot: string,
  fromPath: string,
  toPath: string,
  placement: WorkspaceMovePlacement = "path",
): { type: "file" | "directory"; from: string; to: string } {
  if (!fromPath) {
    throw new Error("INVALID_MOVE");
  }

  const fromParts = fromPath.split("/").filter(Boolean);
  const toParts = toPath.split("/").filter(Boolean);
  if (fromParts.some(isReservedWorkspaceName) || toParts.some(isReservedWorkspaceName)) {
    throw new Error("PATH_TRAVERSAL");
  }

  const fromAbsolute = resolveWorkspacePath(workspaceRoot, fromPath);

  if (!existsSync(fromAbsolute)) {
    throw new Error("NOT_FOUND");
  }

  const fromStats = statSync(fromAbsolute);
  const entryType = fromStats.isDirectory() ? "directory" : "file";

  const sourceName = basename(fromPath);
  let destinationPath = toPath;

  if (placement === "root") {
    destinationPath = sourceName;
  } else if (placement === "inside") {
    if (!toPath) {
      throw new Error("INVALID_MOVE");
    }
    const targetAbsolute = resolveWorkspacePath(workspaceRoot, toPath);
    if (!existsSync(targetAbsolute) || !statSync(targetAbsolute).isDirectory()) {
      throw new Error("INVALID_MOVE");
    }
    destinationPath = `${toPath}/${sourceName}`;
  } else if (placement === "before" || placement === "after") {
    if (!toPath) {
      throw new Error("INVALID_MOVE");
    }
    const targetAbsolute = resolveWorkspacePath(workspaceRoot, toPath);
    if (!existsSync(targetAbsolute)) {
      throw new Error("NOT_FOUND");
    }
    destinationPath = parentPath(toPath) ? `${parentPath(toPath)}/${sourceName}` : sourceName;
  } else if (!toPath) {
    throw new Error("INVALID_MOVE");
  }

  if (entryType === "file" && !destinationPath.endsWith(".md")) {
    throw new Error("VALIDATION_ERROR");
  }

  const toAbsolute = resolveWorkspacePath(workspaceRoot, destinationPath);

  const shouldRename = destinationPath !== fromPath;

  if (
    entryType === "directory" &&
    shouldRename &&
    (toAbsolute === fromAbsolute || toAbsolute.startsWith(`${fromAbsolute}${path.sep}`))
  ) {
    throw new Error("INVALID_MOVE");
  }

  if (shouldRename && existsSync(toAbsolute)) {
    throw new Error("ALREADY_EXISTS");
  }

  if (shouldRename) {
    ensureParentDirectory(toAbsolute);
    renameSync(fromAbsolute, toAbsolute);
  }

  const fromParent = parentPath(fromPath);
  const toParent = parentPath(destinationPath);
  const destinationName = basename(destinationPath);
  const state = readTreeOrderState(workspaceRoot);

  if (placement === "before" || placement === "after") {
    removeFromParentOrder(state, fromParent, sourceName);
    if (fromParent === toParent && sourceName !== destinationName) {
      replaceInParentOrder(state, toParent, sourceName, destinationName);
    }
    insertAroundSibling(
      state,
      toParent,
      destinationName,
      basename(toPath),
      placement,
      listVisibleEntryNames(workspaceRoot, toParent),
    );
  } else if (fromParent === toParent && sourceName !== destinationName) {
    replaceInParentOrder(state, toParent, sourceName, destinationName);
  } else {
    removeFromParentOrder(state, fromParent, sourceName);
    appendToParentOrder(state, toParent, destinationName);
  }

  if (entryType === "directory") {
    if (shouldRename) {
      remapOrderKeys(state, fromPath, destinationPath);
    }
  }

  writeTreeOrderState(workspaceRoot, state);
  return { type: entryType, from: fromPath, to: destinationPath };
}

export function deleteWorkspaceEntry(
  workspaceRoot: string,
  targetPath: string,
): { type: "file" | "directory"; path: string } {
  if (!targetPath) {
    throw new Error("VALIDATION_ERROR");
  }

  const parts = targetPath.split("/").filter(Boolean);
  if (parts.some(isReservedWorkspaceName)) {
    throw new Error("PATH_TRAVERSAL");
  }

  const absolute = resolveWorkspacePath(workspaceRoot, targetPath);
  if (!existsSync(absolute)) {
    throw new Error("NOT_FOUND");
  }

  const stats = statSync(absolute);
  const type = stats.isDirectory() ? "directory" : "file";
  rmSync(absolute, { recursive: true, force: false });
  const state = readTreeOrderState(workspaceRoot);
  removeFromParentOrder(state, parentPath(targetPath), basename(targetPath));
  if (type === "directory") {
    removeDescendantOrder(state, targetPath);
  }
  writeTreeOrderState(workspaceRoot, state);
  return { type, path: targetPath };
}

export function registerWorkspaceEntry(workspaceRoot: string, relativePath: string): void {
  updateOrderForCreatedEntry(workspaceRoot, relativePath);
}
