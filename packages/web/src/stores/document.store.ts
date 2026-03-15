import { create } from "zustand";
import { api, type Document, type Frontmatter } from "../api/client";
import { supportsWysiwygMarkdown } from "../lib/markdown-support";
import { remapMovedPath } from "../lib/path-utils";

type SaveStatus = "saved" | "saving" | "conflict" | "idle";
type EditorMode = "wysiwyg" | "raw";

function applyLocalSupport(doc: Document, content: string): Document {
  return {
    ...doc,
    content,
    supportedInWysiwyg: supportsWysiwygMarkdown(content),
  };
}

interface DocumentStore {
  currentPath: string | null;
  currentDoc: Document | null;
  isDirty: boolean;
  saveStatus: SaveStatus;
  editorMode: EditorMode;
  lastSavedContent: string;
  lastSavedFrontmatter: string;

  openDocument: (path: string) => Promise<void>;
  closeDocument: () => void;
  updateContent: (content: string) => void;
  saveDocument: () => Promise<void>;
  updateFrontmatter: (updates: Partial<Frontmatter>) => void;
  toggleEditorMode: () => void;
  setEditorMode: (mode: EditorMode) => void;
  handleExternalUpdate: (content: string) => void;
  handleExternalMove: (from: string, to: string) => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let editRevision = 0;
let activeSaveRequest = 0;

function scheduleSave(delayMs = 300) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (useDocumentStore.getState().isDirty) {
      void useDocumentStore.getState().saveDocument();
    }
  }, delayMs);
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  currentPath: null,
  currentDoc: null,
  isDirty: false,
  saveStatus: "idle",
  editorMode: "wysiwyg",
  lastSavedContent: "",
  lastSavedFrontmatter: "{}",

  openDocument: async (path) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    editRevision = 0;
    activeSaveRequest = 0;

    // Save current doc if dirty
    const state = get();
    if (state.isDirty && state.currentPath) {
      await get().saveDocument();
    }

    try {
      const doc = await api.getDocument(path);
      const currentMode = get().editorMode;
      set({
        currentPath: path,
        currentDoc: doc,
        isDirty: false,
        saveStatus: "saved",
        lastSavedContent: doc.content,
        lastSavedFrontmatter: JSON.stringify(doc.meta.frontmatter),
        editorMode: doc.supportedInWysiwyg ? currentMode : "raw",
      });
    } catch (e) {
      console.error("Failed to open document:", e);
    }
  },

  closeDocument: () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    editRevision = 0;
    activeSaveRequest = 0;
    set({
      currentPath: null,
      currentDoc: null,
      isDirty: false,
      saveStatus: "idle",
      lastSavedContent: "",
      lastSavedFrontmatter: "{}",
    });
  },

  updateContent: (content) => {
    const state = get();
    if (!state.currentDoc) return;
    editRevision += 1;
    const nextDoc = applyLocalSupport(state.currentDoc, content);

    set({
      currentDoc: nextDoc,
      isDirty:
        content !== state.lastSavedContent ||
        JSON.stringify(nextDoc.meta.frontmatter) !== state.lastSavedFrontmatter,
    });

    scheduleSave();
  },

  saveDocument: async () => {
    const state = get();
    if (!state.currentPath || !state.currentDoc) return;
    const nextFrontmatter = JSON.stringify(state.currentDoc.meta.frontmatter);
    const contentChanged = state.currentDoc.content !== state.lastSavedContent;
    const frontmatterChanged = nextFrontmatter !== state.lastSavedFrontmatter;
    if (!contentChanged && !frontmatterChanged) return;

    const requestedPath = state.currentPath;
    const requestedContent = state.currentDoc.content;
    const requestedFrontmatter = JSON.stringify(state.currentDoc.meta.frontmatter);
    const requestRevision = editRevision;
    const requestId = ++activeSaveRequest;

    set({ saveStatus: "saving" });
    try {
      const doc = await api.saveDocument(
        requestedPath,
        requestedContent,
        frontmatterChanged ? state.currentDoc.meta.frontmatter : undefined,
      );

      const latestState = get();
      const hasNewerLocalEdits =
        latestState.currentPath !== requestedPath ||
        !latestState.currentDoc ||
        editRevision !== requestRevision ||
        latestState.currentDoc.content !== requestedContent ||
        JSON.stringify(latestState.currentDoc.meta.frontmatter) !== requestedFrontmatter;

      if (requestId !== activeSaveRequest || hasNewerLocalEdits) {
        set({
          lastSavedContent: doc.content,
          lastSavedFrontmatter: JSON.stringify(doc.meta.frontmatter),
          saveStatus: latestState.isDirty ? "idle" : "saved",
        });
        if (latestState.isDirty) {
          scheduleSave(150);
        }
        return;
      }

      set({
        currentDoc: doc,
        isDirty: false,
        saveStatus: "saved",
        lastSavedContent: doc.content,
        lastSavedFrontmatter: JSON.stringify(doc.meta.frontmatter),
      });
    } catch {
      set({ saveStatus: "conflict" });
    }
  },

  updateFrontmatter: (updates) => {
    const state = get();
    if (!state.currentDoc) return;
    editRevision += 1;
    set({
      currentDoc: {
        ...state.currentDoc,
        meta: {
          ...state.currentDoc.meta,
          frontmatter: { ...state.currentDoc.meta.frontmatter, ...updates },
        },
      },
      isDirty: true,
    });
    scheduleSave();
  },

  toggleEditorMode: () => {
    set((s) => ({
      editorMode: s.editorMode === "wysiwyg" ? "raw" : "wysiwyg",
    }));
  },

  setEditorMode: (mode) => {
    const state = get();
    if (mode === "wysiwyg" && state.currentDoc && !state.currentDoc.supportedInWysiwyg) {
      set({ editorMode: "raw" });
      return;
    }
    set({ editorMode: mode });
  },

  handleExternalUpdate: (content) => {
    const state = get();
    if (state.isDirty) {
      set({ saveStatus: "conflict" });
    } else {
      set({
        currentDoc: state.currentDoc
          ? applyLocalSupport(state.currentDoc, content)
          : null,
        lastSavedContent: content,
        lastSavedFrontmatter: state.currentDoc ? JSON.stringify(state.currentDoc.meta.frontmatter) : "{}",
      });
    }
  },

  handleExternalMove: (from, to) => {
    const state = get();
    const nextPath = remapMovedPath(state.currentPath, from, to);
    if (!nextPath || !state.currentDoc || nextPath === state.currentPath) return;
    set({
      currentPath: nextPath,
      currentDoc: {
        ...state.currentDoc,
        meta: {
          ...state.currentDoc.meta,
          path: nextPath,
        },
      },
    });
  },
}));
