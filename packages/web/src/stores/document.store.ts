import { create } from "zustand";
import { ApiRequestError, api, type Document, type Frontmatter } from "../api/client";
import { supportsWysiwygMarkdown } from "../lib/markdown-support";
import { remapMovedPath } from "../lib/path-utils";
import { getEditorClientId } from "../lib/editor-client.js";
import {
  deriveSaveStatus,
  mergeConcurrentContent,
  mergeConcurrentFrontmatter,
  type RemoteSnapshot,
  resolveRemoteUpdate,
  resolveSaveSuccess,
  shouldApplySaveResponse,
  shouldReloadAfterCompositionEnd,
  type SaveStatus,
} from "./document-sync";
type EditorMode = "wysiwyg" | "raw";

const LAST_PATH_KEY = "docs-md-last-path";

export function getLastOpenedPath(): string | null {
  try {
    return localStorage.getItem(LAST_PATH_KEY);
  } catch {
    return null;
  }
}

function saveLastOpenedPath(path: string | null): void {
  try {
    if (path) {
      localStorage.setItem(LAST_PATH_KEY, path);
    } else {
      localStorage.removeItem(LAST_PATH_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

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
  editorSyncVersion: number;
  hasPendingRemoteUpdate: boolean;
  pendingRemoteSnapshot: RemoteSnapshot | null;
  isComposing: boolean;

  openDocument: (path: string) => Promise<void>;
  reloadCurrentDocument: () => Promise<void>;
  closeDocument: () => void;
  updateContent: (content: string) => void;
  saveDocument: () => Promise<void>;
  updateFrontmatter: (updates: Partial<Frontmatter>) => void;
  toggleEditorMode: () => void;
  setEditorMode: (mode: EditorMode) => void;
  beginComposition: () => void;
  endComposition: () => void;
  handleExternalUpdate: (
    content: string,
    originClientId?: string | null,
    frontmatter?: Frontmatter | null,
  ) => void;
  handleExternalMove: (from: string, to: string) => void;
}

interface StoreSnapshot {
  currentPath: string | null;
  currentDoc: Document | null;
  isDirty: boolean;
  saveStatus: SaveStatus;
  editorMode: EditorMode;
  lastSavedContent: string;
  lastSavedFrontmatter: string;
  editorSyncVersion: number;
  hasPendingRemoteUpdate: boolean;
  pendingRemoteSnapshot: RemoteSnapshot | null;
  isComposing: boolean;
}

const EDITOR_CLIENT_ID = getEditorClientId();

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let editRevision = 0;
let activeSaveRequest = 0;

function createInitialState(): StoreSnapshot {
  return {
    currentPath: null,
    currentDoc: null,
    isDirty: false,
    saveStatus: "idle",
    editorMode: "wysiwyg",
    lastSavedContent: "",
    lastSavedFrontmatter: "{}",
    editorSyncVersion: 0,
    hasPendingRemoteUpdate: false,
    pendingRemoteSnapshot: null,
    isComposing: false,
  };
}

function parseFrontmatterSnapshot(frontmatter: string): Frontmatter {
  try {
    return JSON.parse(frontmatter) as Frontmatter;
  } catch {
    return {};
  }
}

function getVersionMismatchDocument(error: unknown): Document | null {
  if (!(error instanceof ApiRequestError) || error.code !== "VERSION_MISMATCH") {
    return null;
  }

  const details = error.details;
  if (!details || typeof details !== "object" || !("document" in details)) {
    return null;
  }

  return (details as { document?: Document }).document ?? null;
}

function clearScheduledSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
}

function scheduleSave(delayMs = 300) {
  clearScheduledSave();
  saveTimeout = setTimeout(() => {
    const state = useDocumentStore.getState();
    if (state.isComposing) {
      scheduleSave(150);
      return;
    }
    if (state.isDirty) {
      void state.saveDocument();
    }
  }, delayMs);
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  ...createInitialState(),

  openDocument: async (path) => {
    clearScheduledSave();
    editRevision = 0;
    activeSaveRequest = 0;

    const state = get();
    if (state.isDirty && state.currentPath) {
      await get().saveDocument();
    }

    try {
      const doc = await api.getDocument(path);
      const currentMode = get().editorMode;
      saveLastOpenedPath(path);
      set((current) => ({
        currentPath: path,
        currentDoc: doc,
        isDirty: false,
        saveStatus: "saved",
        lastSavedContent: doc.content,
        lastSavedFrontmatter: JSON.stringify(doc.meta.frontmatter),
        editorMode: doc.supportedInWysiwyg ? currentMode : "raw",
        editorSyncVersion: current.editorSyncVersion + 1,
        hasPendingRemoteUpdate: false,
        pendingRemoteSnapshot: null,
        isComposing: false,
      }));
    } catch (error) {
      console.error("Failed to open document:", error);
    }
  },

  reloadCurrentDocument: async () => {
    const state = get();
    if (!state.currentPath) return;

    clearScheduledSave();

    try {
      const doc = await api.getDocument(state.currentPath);
      set((current) => ({
        currentDoc: doc,
        isDirty: false,
        saveStatus: "saved",
        lastSavedContent: doc.content,
        lastSavedFrontmatter: JSON.stringify(doc.meta.frontmatter),
        editorMode: doc.supportedInWysiwyg ? current.editorMode : "raw",
        editorSyncVersion: current.editorSyncVersion + 1,
        hasPendingRemoteUpdate: false,
        pendingRemoteSnapshot: null,
        isComposing: false,
      }));
      editRevision = 0;
      activeSaveRequest = 0;
    } catch (error) {
      console.error("Failed to reload document:", error);
      set({ saveStatus: "conflict" });
    }
  },

  closeDocument: () => {
    clearScheduledSave();
    editRevision = 0;
    activeSaveRequest = 0;
    set(createInitialState());
  },

  updateContent: (content) => {
    const state = get();
    if (!state.currentDoc) return;

    editRevision += 1;
    const nextDoc = applyLocalSupport(state.currentDoc, content);
    const isDirty =
      content !== state.lastSavedContent ||
      JSON.stringify(nextDoc.meta.frontmatter) !== state.lastSavedFrontmatter;

    set({
      currentDoc: nextDoc,
      isDirty,
      saveStatus: isDirty ? "idle" : "saved",
    });

    scheduleSave();
  },

  saveDocument: async () => {
    const state = get();
    if (!state.currentPath || !state.currentDoc) return;
    const nextFrontmatter = JSON.stringify(state.currentDoc.meta.frontmatter);
    const contentChanged = state.currentDoc.content !== state.lastSavedContent;
    const frontmatterChanged = nextFrontmatter !== state.lastSavedFrontmatter;
    if (!contentChanged && !frontmatterChanged) {
      if (state.pendingRemoteSnapshot && state.currentDoc) {
        const mergedContent = mergeConcurrentContent({
          base: state.pendingRemoteSnapshot.baseContent,
          local: state.currentDoc.content,
          remote: state.pendingRemoteSnapshot.content,
        });
        const mergedFrontmatter = mergeConcurrentFrontmatter({
          base: state.pendingRemoteSnapshot.baseFrontmatter,
          local: JSON.stringify(state.currentDoc.meta.frontmatter),
          remote: state.pendingRemoteSnapshot.frontmatter,
        });
        const nextContent = mergedContent.content;
        const nextFrontmatter = parseFrontmatterSnapshot(mergedFrontmatter.frontmatter);
        const droppedRemoteChanges =
          mergedContent.droppedRemoteChanges || mergedFrontmatter.droppedRemoteChanges;
        const contentDidChange = nextContent !== state.currentDoc.content;
        const didChange =
          contentDidChange ||
          mergedFrontmatter.frontmatter !== JSON.stringify(state.currentDoc.meta.frontmatter);
        if (didChange) {
          editRevision += 1;
          set((current) => ({
            currentDoc: current.currentDoc
              ? applyLocalSupport({
                  ...current.currentDoc,
                  meta: {
                    ...current.currentDoc.meta,
                    frontmatter: nextFrontmatter,
                  },
                }, nextContent)
              : null,
            isDirty: true,
            saveStatus: droppedRemoteChanges ? "conflict" : "idle",
            // Never bump editorSyncVersion during merge — the editor owns its
            // content while the user is active.  Replacing the full ProseMirror
            // doc mid-edit causes cursor jumps and content overwrites.
            // The merged content will reach the server on the next save cycle.
            hasPendingRemoteUpdate: false,
            pendingRemoteSnapshot: null,
          }));
          scheduleSave(80);
          return;
        }
        set({
          hasPendingRemoteUpdate: false,
          pendingRemoteSnapshot: null,
          saveStatus: droppedRemoteChanges
            ? "conflict"
            : deriveSaveStatus({ hasPendingRemoteUpdate: false, isDirty: state.isDirty }),
        });
        return;
      }
      if (state.hasPendingRemoteUpdate) {
        void get().reloadCurrentDocument();
      }
      return;
    }

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
        state.currentDoc.meta.revision,
      );

      const latestState = get();
      const latestCurrentDoc = latestState.currentDoc;
      if (!latestCurrentDoc) {
        return;
      }
      if (!shouldApplySaveResponse({
        currentPath: latestState.currentPath,
        requestedPath,
        hasCurrentDoc: true,
      })) {
        return;
      }
      const hasNewerLocalEdits =
        editRevision !== requestRevision ||
        latestCurrentDoc.content !== requestedContent ||
        JSON.stringify(latestCurrentDoc.meta.frontmatter) !== requestedFrontmatter;

      if (requestId !== activeSaveRequest || hasNewerLocalEdits) {
        set({
          lastSavedContent: requestedContent,
          lastSavedFrontmatter: JSON.stringify(doc.meta.frontmatter),
          saveStatus: resolveSaveSuccess({
            hasPendingRemoteUpdate: latestState.hasPendingRemoteUpdate,
            hasNewerLocalEdits: true,
            isDirty: latestState.isDirty,
            requestedContent,
          }).saveStatus,
        });
        if (latestState.isDirty) {
          scheduleSave(150);
        }
        return;
      }

      const mergedDoc = latestCurrentDoc
        ? {
            ...doc,
            content: latestCurrentDoc.content,
            supportedInWysiwyg: supportsWysiwygMarkdown(latestCurrentDoc.content),
          }
        : doc;

      set({
        currentDoc: mergedDoc,
        isDirty: false,
        saveStatus: resolveSaveSuccess({
          hasPendingRemoteUpdate: latestState.hasPendingRemoteUpdate,
          hasNewerLocalEdits: false,
          isDirty: false,
          requestedContent,
        }).saveStatus,
        lastSavedContent: requestedContent,
        lastSavedFrontmatter: JSON.stringify(doc.meta.frontmatter),
      });
      if (latestState.pendingRemoteSnapshot) {
        const mergedContent = mergeConcurrentContent({
          base: latestState.pendingRemoteSnapshot.baseContent,
          local: requestedContent,
          remote: latestState.pendingRemoteSnapshot.content,
        });
        const mergedFrontmatter = mergeConcurrentFrontmatter({
          base: latestState.pendingRemoteSnapshot.baseFrontmatter,
          local: requestedFrontmatter,
          remote: latestState.pendingRemoteSnapshot.frontmatter,
        });
        const nextFrontmatter = parseFrontmatterSnapshot(mergedFrontmatter.frontmatter);
        const nextContent = mergedContent.content;
        const droppedRemoteChanges =
          mergedContent.droppedRemoteChanges || mergedFrontmatter.droppedRemoteChanges;
        const didChange =
          nextContent !== requestedContent ||
          mergedFrontmatter.frontmatter !== requestedFrontmatter;

        set((current) => ({
          currentDoc: current.currentDoc
            ? applyLocalSupport({
                ...current.currentDoc,
                meta: {
                  ...current.currentDoc.meta,
                  frontmatter: didChange ? nextFrontmatter : current.currentDoc.meta.frontmatter,
                },
              }, didChange ? nextContent : current.currentDoc.content)
            : null,
          isDirty: didChange,
          saveStatus: droppedRemoteChanges ? "conflict" : didChange ? "idle" : "saved",
          // Do NOT bump editorSyncVersion here — let the editor keep its
          // current ProseMirror state.  The store content is updated and the
          // next onUpdate/save cycle will reconcile naturally.
          hasPendingRemoteUpdate: false,
          pendingRemoteSnapshot: null,
        }));
        if (didChange) {
          editRevision += 1;
          scheduleSave(80);
        }
      } else if (latestState.hasPendingRemoteUpdate) {
        void get().reloadCurrentDocument();
      }
    } catch (error) {
      const latestDocument = getVersionMismatchDocument(error);
      if (latestDocument && get().currentPath === requestedPath) {
        const latestFrontmatter = JSON.stringify(latestDocument.meta.frontmatter);
        const mergedContent = mergeConcurrentContent({
          base: state.lastSavedContent,
          local: requestedContent,
          remote: latestDocument.content,
        });
        const mergedFrontmatter = mergeConcurrentFrontmatter({
          base: state.lastSavedFrontmatter,
          local: requestedFrontmatter,
          remote: latestFrontmatter,
        });
        const droppedRemoteChanges =
          mergedContent.droppedRemoteChanges || mergedFrontmatter.droppedRemoteChanges;
        const nextContent = mergedContent.content;
        const nextFrontmatter = parseFrontmatterSnapshot(mergedFrontmatter.frontmatter);

        set(() => ({
          currentDoc: applyLocalSupport({
            ...latestDocument,
            meta: {
              ...latestDocument.meta,
              frontmatter: nextFrontmatter,
            },
          }, nextContent),
          isDirty: true,
          saveStatus: droppedRemoteChanges ? "conflict" : "idle",
          lastSavedContent: latestDocument.content,
          lastSavedFrontmatter: latestFrontmatter,
          // Do NOT bump editorSyncVersion during conflict resolution.
          hasPendingRemoteUpdate: false,
          pendingRemoteSnapshot: null,
        }));
        if (!droppedRemoteChanges) {
          editRevision += 1;
          scheduleSave(80);
        }
        return;
      }
      if (get().currentPath === requestedPath) {
        set({ saveStatus: "conflict" });
      }
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
      saveStatus: "idle",
    });
    scheduleSave();
  },

  toggleEditorMode: () => {
    set((state) => ({
      editorMode: state.editorMode === "wysiwyg" ? "raw" : "wysiwyg",
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

  beginComposition: () => {
    set({ isComposing: true });
  },

  endComposition: () => {
    const state = get();
    set({ isComposing: false });
    if (state.isDirty) {
      scheduleSave(100);
      return;
    }
    if (shouldReloadAfterCompositionEnd(state)) {
      void get().saveDocument();
    }
  },

  handleExternalUpdate: (content, originClientId, frontmatter) => {
    const state = get();
    if (!state.currentDoc) return;
    const currentFrontmatter = JSON.stringify(state.currentDoc.meta.frontmatter);

    // Also treat "saving" as busy — a save is in-flight and the response
    // may update lastSavedContent, so applying now would race.
    const effectivelyDirty = state.isDirty || state.saveStatus === "saving";

    const resolution = resolveRemoteUpdate({
      content,
      frontmatter: frontmatter ? JSON.stringify(frontmatter) : currentFrontmatter,
      currentContent: state.currentDoc.content,
      currentFrontmatter,
      lastSavedContent: state.lastSavedContent,
      lastSavedFrontmatter: state.lastSavedFrontmatter,
      isDirty: effectivelyDirty,
      isComposing: state.isComposing,
      hasPendingRemoteUpdate: state.hasPendingRemoteUpdate,
      originClientId,
      editorClientId: EDITOR_CLIENT_ID,
    });

    if (resolution.action === "ignore") {
      return;
    }
    if (resolution.action === "queue") {
      set({
        hasPendingRemoteUpdate: true,
        pendingRemoteSnapshot: resolution.snapshot,
      });
      return;
    }

    set((current) => {
      const contentDidChange = resolution.content !== current.currentDoc?.content;
      return {
        currentDoc: current.currentDoc
          ? applyLocalSupport({
              ...current.currentDoc,
              meta: {
                ...current.currentDoc.meta,
                frontmatter: parseFrontmatterSnapshot(resolution.frontmatter),
              },
            }, resolution.content)
          : null,
        isDirty: false,
        saveStatus: resolution.saveStatus,
        lastSavedContent: resolution.content,
        lastSavedFrontmatter: resolution.frontmatter,
        editorSyncVersion: contentDidChange ? current.editorSyncVersion + 1 : current.editorSyncVersion,
        hasPendingRemoteUpdate: false,
        pendingRemoteSnapshot: null,
      };
    });
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

export function getDocumentEditorClientId(): string {
  return EDITOR_CLIENT_ID;
}

export function resetDocumentStoreForTests(): void {
  clearScheduledSave();
  editRevision = 0;
  activeSaveRequest = 0;
  useDocumentStore.setState(createInitialState());
}
