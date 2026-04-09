import { create } from "zustand";
import { ApiRequestError, api, type Document, type Frontmatter } from "../api/client.js";
import {
  clearDocumentDraft,
  readDocumentDraft,
  shouldRestoreDocumentDraft,
  writeDocumentDraft,
} from "../lib/document-draft.js";
import { remapMovedPath } from "../lib/path-utils.js";
import { getEditorClientId } from "../lib/editor-client.js";
import {
  deriveSaveStatus,
  mergeConcurrentMarkdown,
  resolveRemoteUpdate,
  resolveSaveSuccess,
  shouldApplySaveResponse,
  shouldReloadAfterCompositionEnd,
  type RemoteSnapshot,
  type SaveStatus,
} from "./document-sync.js";

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

interface DocumentStore {
  currentPath: string | null;
  currentDoc: Document | null;
  isDirty: boolean;
  saveStatus: SaveStatus;
  lastSavedRaw: string;
  hasPendingRemoteUpdate: boolean;
  pendingRemoteSnapshot: RemoteSnapshot | null;
  isComposing: boolean;

  openDocument: (path: string) => Promise<void>;
  reloadCurrentDocument: () => Promise<void>;
  closeDocument: () => void;
  updateRaw: (raw: string) => void;
  saveDocument: (options?: { keepalive?: boolean }) => Promise<void>;
  flushPendingSave: (options?: { keepalive?: boolean }) => Promise<void>;
  beginComposition: () => void;
  endComposition: () => void;
  handleExternalUpdate: (
    raw: string,
    originClientId?: string | null,
    frontmatter?: Frontmatter | null,
    revision?: string,
  ) => void;
  handleExternalMove: (from: string, to: string) => void;
}

interface StoreSnapshot {
  currentPath: string | null;
  currentDoc: Document | null;
  isDirty: boolean;
  saveStatus: SaveStatus;
  lastSavedRaw: string;
  hasPendingRemoteUpdate: boolean;
  pendingRemoteSnapshot: RemoteSnapshot | null;
  isComposing: boolean;
}

const EDITOR_CLIENT_ID = getEditorClientId();

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let editRevision = 0;
let activeSaveRequest = 0;
let activeSavePromise: Promise<void> | null = null;
let queuedSaveOptions: { keepalive?: boolean } | null = null;

function createInitialState(): StoreSnapshot {
  return {
    currentPath: null,
    currentDoc: null,
    isDirty: false,
    saveStatus: "idle",
    lastSavedRaw: "",
    hasPendingRemoteUpdate: false,
    pendingRemoteSnapshot: null,
    isComposing: false,
  };
}

function clearScheduledSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
}

function mergeSaveOptions(
  current: { keepalive?: boolean } | null,
  next?: { keepalive?: boolean },
): { keepalive?: boolean } | null {
  if (!current && !next) return null;
  return {
    keepalive: Boolean(current?.keepalive || next?.keepalive),
  };
}

function resetSaveCoordinator() {
  activeSaveRequest = 0;
  activeSavePromise = null;
  queuedSaveOptions = null;
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

function replaceCurrentDocRaw(doc: Document, raw: string, frontmatter?: Frontmatter | null, revision?: string): Document {
  const metaChanged = frontmatter != null || revision != null;
  return {
    ...doc,
    raw,
    content: raw,
    meta: metaChanged
      ? {
          ...doc.meta,
          ...(frontmatter != null ? { frontmatter } : {}),
          ...(revision != null ? { revision } : {}),
        }
      : doc.meta,
  };
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

function persistDraftForState(state: Pick<StoreSnapshot, "currentPath" | "currentDoc" | "lastSavedRaw">): void {
  if (!state.currentPath || !state.currentDoc) return;
  writeDocumentDraft(state.currentPath, {
    raw: state.currentDoc.raw,
    lastSavedRaw: state.lastSavedRaw,
    baseRevision: state.currentDoc.meta.revision,
  });
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  ...createInitialState(),

  openDocument: async (path) => {
    clearScheduledSave();
    editRevision = 0;
    resetSaveCoordinator();

    const state = get();
    if (state.isDirty && state.currentPath) {
      await get().saveDocument();
    }

    try {
      const doc = await api.getDocument(path);
      const draft = readDocumentDraft(path);
      const shouldRestoreDraft = draft ? shouldRestoreDocumentDraft(doc, draft) : false;
      const restoredRaw = shouldRestoreDraft && draft ? draft.raw : doc.raw;

      saveLastOpenedPath(path);
      set({
        currentPath: path,
        currentDoc: {
          ...doc,
          raw: restoredRaw,
          content: restoredRaw,
        },
        isDirty: shouldRestoreDraft,
        saveStatus: shouldRestoreDraft ? "idle" : "saved",
        lastSavedRaw: doc.raw,
        hasPendingRemoteUpdate: false,
        pendingRemoteSnapshot: null,
        isComposing: false,
      });
      if (shouldRestoreDraft) {
        scheduleSave(100);
      } else {
        clearDocumentDraft(path);
      }
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
      set({
        currentDoc: {
          ...doc,
          content: doc.raw,
        },
        isDirty: false,
        saveStatus: "saved",
        lastSavedRaw: doc.raw,
        hasPendingRemoteUpdate: false,
        pendingRemoteSnapshot: null,
        isComposing: false,
      });
      editRevision = 0;
      resetSaveCoordinator();
    } catch (error) {
      console.error("Failed to reload document:", error);
      set({ saveStatus: "conflict" });
    }
  },

  closeDocument: () => {
    clearScheduledSave();
    editRevision = 0;
    resetSaveCoordinator();
    set(createInitialState());
  },

  updateRaw: (raw) => {
    const state = get();
    if (!state.currentDoc) return;

    editRevision += 1;
    set({
      currentDoc: replaceCurrentDocRaw(state.currentDoc, raw),
      isDirty: raw !== state.lastSavedRaw,
      saveStatus: raw !== state.lastSavedRaw ? "idle" : "saved",
    });
    const nextState = get();
    if (raw !== nextState.lastSavedRaw) {
      persistDraftForState(nextState);
    } else if (nextState.currentPath) {
      clearDocumentDraft(nextState.currentPath);
    }

    scheduleSave();
  },

  flushPendingSave: async (options) => {
    clearScheduledSave();
    await get().saveDocument(options);
  },

  saveDocument: async (options) => {
    if (activeSavePromise) {
      queuedSaveOptions = mergeSaveOptions(queuedSaveOptions, options);
      return activeSavePromise;
    }

    const runSave = async () => {
    const state = get();
    if (!state.currentPath || !state.currentDoc) return;
    const contentChanged = state.currentDoc.raw !== state.lastSavedRaw;

    if (!contentChanged) {
      if (state.pendingRemoteSnapshot && state.currentDoc) {
        const merged = mergeConcurrentMarkdown({
          base: state.pendingRemoteSnapshot.baseRaw,
          local: state.currentDoc.raw,
          remote: state.pendingRemoteSnapshot.raw,
        });

        if (merged.raw !== state.currentDoc.raw) {
          editRevision += 1;
          set((current) => ({
            currentDoc: current.currentDoc ? replaceCurrentDocRaw(current.currentDoc, merged.raw) : null,
            isDirty: true,
            saveStatus: merged.droppedRemoteChanges ? "conflict" : "idle",
            hasPendingRemoteUpdate: false,
            pendingRemoteSnapshot: null,
          }));
          scheduleSave(80);
          return;
        }

        set({
          hasPendingRemoteUpdate: false,
          pendingRemoteSnapshot: null,
          saveStatus: merged.droppedRemoteChanges
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
    const requestedRaw = state.currentDoc.raw;
    const requestRevision = editRevision;
    const requestId = ++activeSaveRequest;

    set({ saveStatus: "saving" });
    try {
      const doc = await api.saveDocument(
        requestedPath,
        requestedRaw,
        state.currentDoc.meta.revision,
        options?.keepalive ? { keepalive: true } : undefined,
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
        latestCurrentDoc.raw !== requestedRaw;

      if (requestId !== activeSaveRequest || hasNewerLocalEdits) {
        set({
          currentDoc: latestCurrentDoc
            ? replaceCurrentDocRaw(latestCurrentDoc, latestCurrentDoc.raw, doc.meta.frontmatter, doc.meta.revision)
            : null,
          lastSavedRaw: requestedRaw,
          saveStatus: resolveSaveSuccess({
            hasPendingRemoteUpdate: latestState.hasPendingRemoteUpdate,
            hasNewerLocalEdits: true,
            isDirty: latestState.isDirty,
            requestedRaw,
          }).saveStatus,
        });
        if (latestState.isDirty) {
          persistDraftForState(get());
          scheduleSave(150);
        }
        return;
      }

      set({
        currentDoc: {
          ...doc,
          content: doc.raw,
        },
        isDirty: false,
        saveStatus: resolveSaveSuccess({
          hasPendingRemoteUpdate: latestState.hasPendingRemoteUpdate,
          hasNewerLocalEdits: false,
          isDirty: false,
          requestedRaw,
        }).saveStatus,
        lastSavedRaw: requestedRaw,
      });
      clearDocumentDraft(requestedPath);

      if (latestState.pendingRemoteSnapshot) {
        const merged = mergeConcurrentMarkdown({
          base: latestState.pendingRemoteSnapshot.baseRaw,
          local: requestedRaw,
          remote: latestState.pendingRemoteSnapshot.raw,
        });
        const didChange = merged.raw !== requestedRaw;

        set((current) => ({
          currentDoc: current.currentDoc
            ? replaceCurrentDocRaw(current.currentDoc, didChange ? merged.raw : current.currentDoc.raw)
            : null,
          isDirty: didChange,
          saveStatus: merged.droppedRemoteChanges ? "conflict" : didChange ? "idle" : "saved",
          hasPendingRemoteUpdate: false,
          pendingRemoteSnapshot: null,
        }));
        if (didChange) {
          editRevision += 1;
          persistDraftForState(get());
          scheduleSave(80);
        }
      } else if (latestState.hasPendingRemoteUpdate) {
        void get().reloadCurrentDocument();
      }
    } catch (error) {
      const latestDocument = getVersionMismatchDocument(error);
      if (latestDocument && get().currentPath === requestedPath) {
        const merged = mergeConcurrentMarkdown({
          base: state.lastSavedRaw,
          local: requestedRaw,
          remote: latestDocument.raw,
        });

        set(() => ({
          currentDoc: {
            ...latestDocument,
            content: merged.raw,
            raw: merged.raw,
          },
          isDirty: true,
          saveStatus: merged.droppedRemoteChanges ? "conflict" : "idle",
          lastSavedRaw: latestDocument.raw,
          hasPendingRemoteUpdate: false,
          pendingRemoteSnapshot: null,
        }));
        if (!merged.droppedRemoteChanges) {
          editRevision += 1;
          persistDraftForState(get());
          scheduleSave(80);
        }
        return;
      }
      if (get().currentPath === requestedPath) {
        set({ saveStatus: "conflict" });
      }
    }
    };

    activeSavePromise = runSave().finally(() => {
      activeSavePromise = null;
      const followUp = queuedSaveOptions;
      queuedSaveOptions = null;
      if (!followUp) return;

      const latestState = get();
      if (!latestState.currentPath || !latestState.currentDoc) return;
      if (latestState.isComposing) {
        scheduleSave(100);
        return;
      }
      if (latestState.isDirty || latestState.hasPendingRemoteUpdate) {
        void latestState.saveDocument(followUp);
      }
    });

    return activeSavePromise;
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

  handleExternalUpdate: (raw, originClientId, frontmatter, revision) => {
    const state = get();
    if (!state.currentDoc) return;

    const effectivelyDirty = state.isDirty || state.saveStatus === "saving";
    const resolution = resolveRemoteUpdate({
      raw,
      currentRaw: state.currentDoc.raw,
      lastSavedRaw: state.lastSavedRaw,
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

    set((current) => ({
      currentDoc: current.currentDoc
        ? replaceCurrentDocRaw(current.currentDoc, resolution.raw, frontmatter, revision)
        : null,
      isDirty: false,
      saveStatus: resolution.saveStatus,
      lastSavedRaw: resolution.raw,
      hasPendingRemoteUpdate: false,
      pendingRemoteSnapshot: null,
    }));
    if (state.currentPath) {
      clearDocumentDraft(state.currentPath);
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

export function getDocumentEditorClientId(): string {
  return EDITOR_CLIENT_ID;
}

export function resetDocumentStoreForTests(): void {
  clearScheduledSave();
  editRevision = 0;
  resetSaveCoordinator();
  useDocumentStore.setState(createInitialState());
}
