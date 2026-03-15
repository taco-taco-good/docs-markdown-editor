import { create } from "zustand";
import { api, type TreeDropTarget, type TreeMoveResult, type TreeNode } from "../api/client";
import { useDocumentStore } from "./document.store";
import { remapMovedPath } from "../lib/path-utils";

interface TreeStore {
  nodes: TreeNode[];
  expandedPaths: Set<string>;
  selectedPath: string | null;
  loading: boolean;

  loadTree: () => Promise<void>;
  toggleExpand: (path: string) => void;
  selectPath: (path: string) => void;
  createFile: (
    dirPath: string,
    name: string,
    opts?: { template?: string; title?: string },
  ) => Promise<string>;
  createFolder: (dirPath: string, name: string) => Promise<string>;
  moveNode: (from: string, to: string) => Promise<void>;
  repositionNode: (from: string, target: TreeDropTarget) => Promise<void>;
  renameNode: (from: string, nextName: string, kind: "file" | "directory") => Promise<string>;
  deleteNode: (path: string) => Promise<void>;
  handleWSEvent: (event: { type: string; path?: string; from?: string; to?: string }) => void;
}

function parentDirectory(path: string): string {
  const segments = path.split("/");
  segments.pop();
  return segments.join("/");
}

function normalizeRenameTarget(from: string, nextName: string, kind: "file" | "directory"): string {
  const trimmed = nextName.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    throw new Error("이름을 입력하세요.");
  }

  const parent = parentDirectory(from);
  const currentBase = from.split("/").pop() ?? from;
  const currentExt = currentBase.includes(".") ? currentBase.slice(currentBase.lastIndexOf(".")) : "";
  const currentIsFile = kind === "file";
  const nextBase =
    currentIsFile && !trimmed.includes(".")
      ? `${trimmed}${currentExt}`
      : trimmed;

  return parent ? `${parent}/${nextBase}` : nextBase;
}

export const useTreeStore = create<TreeStore>((set, get) => ({
  nodes: [],
  expandedPaths: new Set<string>(),
  selectedPath: null,
  loading: false,

  loadTree: async () => {
    set({ loading: true });
    try {
      const nodes = await api.getTree();
      set({ nodes, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  toggleExpand: (path) => {
    const expanded = new Set(get().expandedPaths);
    if (expanded.has(path)) {
      expanded.delete(path);
    } else {
      expanded.add(path);
    }
    set({ expandedPaths: expanded });
  },

  selectPath: (path) => set({ selectedPath: path }),

  createFile: async (dirPath, name, opts) => {
    const fullPath = dirPath ? `${dirPath}/${name}` : name;
    await api.createDocument(fullPath, {
      template: opts?.template,
      frontmatter: opts?.title ? { title: opts.title } : undefined,
    });
    await get().loadTree();
    const expanded = new Set(get().expandedPaths);
    if (dirPath) {
      expanded.add(dirPath);
    }
    set({ expandedPaths: expanded, selectedPath: fullPath });
    return fullPath;
  },

  createFolder: async (dirPath, name) => {
    const normalizedName = name.trim().replace(/^\/+|\/+$/g, "");
    const fullPath = dirPath ? `${dirPath}/${normalizedName}` : normalizedName;
    await api.createDirectory(fullPath);
    await get().loadTree();
    const expanded = new Set(get().expandedPaths);
    if (dirPath) {
      expanded.add(dirPath);
    }
    expanded.add(fullPath);
    set({ expandedPaths: expanded, selectedPath: fullPath });
    return fullPath;
  },

  repositionNode: async (from, target) => {
    const moved = await api.repositionNode(from, target);
    applyMovedState(moved, get, set);
  },

  moveNode: async (from, to) => {
    if (!from || !to || from === to) return;
    const moved = await api.moveNode(from, to);
    applyMovedState(moved, get, set);
  },

  renameNode: async (from, nextName, kind) => {
    const to = normalizeRenameTarget(from, nextName, kind);
    await get().moveNode(from, to);
    return to;
  },

  deleteNode: async (path) => {
    const isDirectory = !path.toLowerCase().endsWith(".md");
    if (isDirectory) {
      await api.deleteDirectory(path);
    } else {
      await api.deleteDocument(path);
    }
    const currentPath = useDocumentStore.getState().currentPath;
    if (currentPath === path || currentPath?.startsWith(`${path}/`)) {
      useDocumentStore.getState().closeDocument();
    }
    await get().loadTree();
  },

  handleWSEvent: (event) => {
    const moveFrom = "from" in event && typeof event.from === "string" ? event.from : null;
    const moveTo = "to" in event && typeof event.to === "string" ? event.to : null;
    if (moveFrom && moveTo) {
      const expanded = new Set<string>();
      for (const path of get().expandedPaths) {
        const remapped = remapMovedPath(path, moveFrom, moveTo);
        if (remapped) expanded.add(remapped);
      }
      set({
        expandedPaths: expanded,
        selectedPath: remapMovedPath(get().selectedPath, moveFrom, moveTo),
      });
    }

    if (
      event.type === "tree:changed" ||
      event.type === "file:created" ||
      event.type === "file:updated" ||
      event.type === "file:deleted" ||
      event.type === "dir:created" ||
      event.type === "dir:deleted" ||
      event.type === "file:moved" ||
      event.type === "dir:moved"
    ) {
      get().loadTree();
    }
  },
}));

function applyMovedState(
  moved: TreeMoveResult,
  get: () => TreeStore,
  set: (partial: Partial<TreeStore>) => void,
): void {
  useDocumentStore.getState().handleExternalMove(moved.from, moved.to);
  void get().loadTree();

  const expanded = new Set<string>();
  for (const path of get().expandedPaths) {
    const remapped = remapMovedPath(path, moved.from, moved.to);
    if (remapped) expanded.add(remapped);
  }

  set({
    expandedPaths: expanded,
    selectedPath: remapMovedPath(get().selectedPath, moved.from, moved.to),
  });
}
