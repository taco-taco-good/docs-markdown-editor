import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { extractTitle, parseMarkdownDocument } from "../../../shared/src/markdown-document.ts";

import { RESERVED_DIRECTORIES, resolveWorkspacePath } from "./workspace.ts";
import { type TreeOrderState, orderedEntryNames, readTreeOrderState } from "./tree-order.ts";

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

function toWorkspacePath(absolutePath: string, workspaceRoot: string): string {
  return path.relative(path.resolve(workspaceRoot), absolutePath).split(path.sep).join("/");
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
