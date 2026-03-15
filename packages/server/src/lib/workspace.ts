import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { extractTitle, parseMarkdownDocument } from "../../../shared/src/markdown-document.ts";

export const RESERVED_DIRECTORIES = new Set([".docs", ".assets", ".git", "node_modules"]);

export interface WorkspaceDocumentMeta {
  path: string;
  title: string;
  size: number;
  modifiedAt: string;
}

export interface WorkspaceTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: WorkspaceTreeNode[];
  meta?: WorkspaceDocumentMeta;
}

type TreeOrderState = Record<string, string[]>;
export type WorkspaceMovePlacement = "path" | "inside" | "before" | "after" | "root";

export function ensureParentDirectory(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function orderStatePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".docs", "tree-order.json");
}

function parentPath(relativePath: string): string {
  const segments = relativePath.split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
}

function basename(relativePath: string): string {
  const segments = relativePath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? relativePath;
}

function readTreeOrderState(workspaceRoot: string): TreeOrderState {
  const filePath = orderStatePath(workspaceRoot);
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const state: TreeOrderState = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      state[key] = value.filter((item): item is string => typeof item === "string");
    }
    return state;
  } catch {
    return {};
  }
}

function writeTreeOrderState(workspaceRoot: string, state: TreeOrderState): void {
  const filePath = orderStatePath(workspaceRoot);
  mkdirSync(path.dirname(filePath), { recursive: true });

  const normalized = Object.fromEntries(
    Object.entries(state)
      .map(([key, value]) => [key, Array.from(new Set(value.filter(Boolean)))])
      .filter(([, value]) => value.length > 0),
  );

  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

function orderedEntryNames(entries: string[], order: TreeOrderState, directoryPath: string): string[] {
  const desired = order[directoryPath] ?? [];
  const known = desired.filter((name) => entries.includes(name));
  const remainder = entries.filter((name) => !known.includes(name)).sort((left, right) => left.localeCompare(right));
  return [...known, ...remainder];
}

function appendToParentOrder(state: TreeOrderState, directoryPath: string, entryName: string): void {
  if (!entryName) return;
  const current = state[directoryPath] ?? [];
  state[directoryPath] = [...current.filter((item) => item !== entryName), entryName];
}

function removeFromParentOrder(state: TreeOrderState, directoryPath: string, entryName: string): void {
  if (!state[directoryPath]) return;
  state[directoryPath] = state[directoryPath].filter((item) => item !== entryName);
  if (state[directoryPath].length === 0) {
    delete state[directoryPath];
  }
}

function replaceInParentOrder(
  state: TreeOrderState,
  directoryPath: string,
  previousName: string,
  nextName: string,
): void {
  const current = state[directoryPath];
  if (!current?.length) {
    state[directoryPath] = [nextName];
    return;
  }

  let replaced = false;
  state[directoryPath] = current.map((item) => {
    if (item === previousName) {
      replaced = true;
      return nextName;
    }
    return item;
  });
  if (!replaced) {
    state[directoryPath] = [...state[directoryPath], nextName];
  }
}

function insertAroundSibling(
  state: TreeOrderState,
  directoryPath: string,
  entryName: string,
  siblingName: string,
  placement: "before" | "after",
  fallbackNames: string[],
): void {
  const current = orderedEntryNames(fallbackNames.filter((item) => item !== entryName), state, directoryPath);
  const siblingIndex = current.indexOf(siblingName);
  if (siblingIndex === -1) {
    current.push(entryName);
    state[directoryPath] = current;
    return;
  }

  const insertAt = placement === "before" ? siblingIndex : siblingIndex + 1;
  current.splice(insertAt, 0, entryName);
  state[directoryPath] = current;
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

function remapOrderKeys(state: TreeOrderState, fromPath: string, toPath: string): void {
  const nextEntries: Array<[string, string[]]> = [];
  for (const [key, value] of Object.entries(state)) {
    if (key === fromPath || key.startsWith(`${fromPath}/`)) {
      const nextKey = `${toPath}${key.slice(fromPath.length)}`;
      nextEntries.push([nextKey, value]);
      delete state[key];
    }
  }

  for (const [key, value] of nextEntries) {
    state[key] = value;
  }
}

function removeDescendantOrder(state: TreeOrderState, targetPath: string): void {
  for (const key of Object.keys(state)) {
    if (key === targetPath || key.startsWith(`${targetPath}/`)) {
      delete state[key];
    }
  }
}

function updateOrderForCreatedEntry(workspaceRoot: string, relativePath: string): void {
  const state = readTreeOrderState(workspaceRoot);
  appendToParentOrder(state, parentPath(relativePath), basename(relativePath));
  writeTreeOrderState(workspaceRoot, state);
}

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

export function isReservedWorkspaceName(name: string): boolean {
  return RESERVED_DIRECTORIES.has(name);
}

function toWorkspacePath(absolutePath: string, workspaceRoot: string): string {
  return path.relative(path.resolve(workspaceRoot), absolutePath).split(path.sep).join("/");
}

export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const resolved = path.resolve(workspaceRoot, relativePath);
  const root = path.resolve(workspaceRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("PATH_TRAVERSAL");
  }
  return resolved;
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

export function listMarkdownFiles(workspaceRoot: string): string[] {
  const root = path.resolve(workspaceRoot);
  const files: string[] = [];

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (RESERVED_DIRECTORIES.has(entry)) continue;
      const absolutePath = path.join(directory, entry);
      const stats = statSync(absolutePath);
      if (stats.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (absolutePath.endsWith(".md")) {
        files.push(toWorkspacePath(absolutePath, root));
      }
    }
  };

  visit(root);
  return files.sort();
}

function readDocumentMeta(workspaceRoot: string, relativePath: string): WorkspaceDocumentMeta {
  const absolutePath = resolveWorkspacePath(workspaceRoot, relativePath);
  const raw = readFileSync(absolutePath, "utf8");
  const stats = statSync(absolutePath);
  const document = parseMarkdownDocument(raw);

  return {
    path: relativePath,
    title: extractTitle(relativePath, document),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

export function buildTree(
  workspaceRoot: string,
  relativePath = "",
  depth = Number.POSITIVE_INFINITY,
): WorkspaceTreeNode[] {
  const order = readTreeOrderState(workspaceRoot);
  return buildTreeInternal(workspaceRoot, order, relativePath, depth);
}

function buildTreeInternal(
  workspaceRoot: string,
  order: TreeOrderState,
  relativePath = "",
  depth = Number.POSITIVE_INFINITY,
): WorkspaceTreeNode[] {
  const startPath = relativePath ? resolveWorkspacePath(workspaceRoot, relativePath) : path.resolve(workspaceRoot);
  const stats = statSync(startPath);
  if (!stats.isDirectory()) {
    throw new Error("NOT_A_DIRECTORY");
  }

  const entries = readdirSync(startPath, { withFileTypes: true }).filter((entry) => !RESERVED_DIRECTORIES.has(entry.name));
  const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
  const names = orderedEntryNames(entries.map((entry) => entry.name), order, relativePath);

  const nodes: WorkspaceTreeNode[] = [];
  for (const entryName of names) {
    const entry = entryByName.get(entryName);
    if (!entry) continue;
    const absolutePath = path.join(startPath, entry.name);
    const nodePath = toWorkspacePath(absolutePath, workspaceRoot);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: nodePath,
        type: "directory",
        children: depth > 1 ? buildTreeInternal(workspaceRoot, order, nodePath, depth - 1) : [],
      });
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    nodes.push({
      name: entry.name,
      path: nodePath,
      type: "file",
      meta: readDocumentMeta(workspaceRoot, nodePath),
    });
  }

  return nodes;
}
