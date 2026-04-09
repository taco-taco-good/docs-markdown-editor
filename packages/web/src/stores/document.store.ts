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
import { resetTabStoreForTests, useTabStore } from "./tab.store.js";
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

export interface EditorSelectionSnapshot {
  from: number;
  to: number;
  head: number;
}

export interface DocumentSession {
  path: string;
  doc: Document;
  lastSavedRaw: string;
  isDirty: boolean;
  saveStatus: SaveStatus;
  hasPendingRemoteUpdate: boolean;
  pendingRemoteSnapshot: RemoteSnapshot | null;
  isComposing: boolean;
  selection: EditorSelectionSnapshot | null;
  scrollTop: number;
}

interface SaveCoordinator {
  timeout: ReturnType<typeof setTimeout> | null;
  editRevision: number;
  activeSaveRequest: number;
  activeSavePromise: Promise<void> | null;
  queuedSaveOptions: { keepalive?: boolean } | null;
}

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
  currentSelection: EditorSelectionSnapshot | null;
  currentScrollTop: number;
  sessionsByPath: Record<string, DocumentSession>;

  openDocument: (path: string) => Promise<void>;
  reloadCurrentDocument: () => Promise<void>;
  closeDocument: (path?: string, options?: { force?: boolean }) => Promise<void>;
  closeDocuments: (paths: string[], options?: { force?: boolean; nextPath?: string | null }) => Promise<void>;
  updateRaw: (raw: string) => void;
  saveDocument: (options?: { keepalive?: boolean }, targetPath?: string) => Promise<void>;
  flushPendingSave: (options?: { keepalive?: boolean }) => Promise<void>;
  beginComposition: () => void;
  endComposition: () => void;
  updateEditorViewport: (snapshot: { selection?: EditorSelectionSnapshot | null; scrollTop?: number }) => void;
  handleExternalUpdate: (
    path: string,
    raw: string,
    originClientId?: string | null,
    frontmatter?: Frontmatter | null,
    revision?: string,
  ) => void;
  handleExternalMove: (from: string, to: string) => void;
  hasSession: (path: string) => boolean;
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
  currentSelection: EditorSelectionSnapshot | null;
  currentScrollTop: number;
  sessionsByPath: Record<string, DocumentSession>;
}

const EDITOR_CLIENT_ID = getEditorClientId();
const coordinatorsByPath = new Map<string, SaveCoordinator>();

function createCoordinator(): SaveCoordinator {
  return {
    timeout: null,
    editRevision: 0,
    activeSaveRequest: 0,
    activeSavePromise: null,
    queuedSaveOptions: null,
  };
}

function getCoordinator(path: string): SaveCoordinator {
  const existing = coordinatorsByPath.get(path);
  if (existing) return existing;
  const next = createCoordinator();
  coordinatorsByPath.set(path, next);
  return next;
}

function clearScheduledSave(path: string): void {
  const coordinator = coordinatorsByPath.get(path);
  if (!coordinator?.timeout) return;
  clearTimeout(coordinator.timeout);
  coordinator.timeout = null;
}

function clearAllScheduledSaves(): void {
  for (const coordinator of coordinatorsByPath.values()) {
    if (coordinator.timeout) {
      clearTimeout(coordinator.timeout);
      coordinator.timeout = null;
    }
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

function resetSaveCoordinator(path: string): void {
  clearScheduledSave(path);
  coordinatorsByPath.delete(path);
}

function resetAllSaveCoordinators(): void {
  clearAllScheduledSaves();
  coordinatorsByPath.clear();
}

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
    currentSelection: null,
    currentScrollTop: 0,
    sessionsByPath: {},
  };
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

function sessionFromState(state: StoreSnapshot, path?: string): DocumentSession | null {
  const targetPath = path ?? state.currentPath;
  if (!targetPath) return null;
  if (state.currentPath === targetPath && state.currentDoc) {
    return {
      path: targetPath,
      doc: {
        ...state.currentDoc,
        raw: state.currentDoc.raw,
        content: state.currentDoc.raw,
      },
      lastSavedRaw: state.lastSavedRaw,
      isDirty: state.isDirty,
      saveStatus: state.saveStatus,
      hasPendingRemoteUpdate: state.hasPendingRemoteUpdate,
      pendingRemoteSnapshot: state.pendingRemoteSnapshot,
      isComposing: state.isComposing,
      selection: state.currentSelection,
      scrollTop: state.currentScrollTop,
    };
  }
  return state.sessionsByPath[targetPath] ?? null;
}

function withPersistedCurrentSession(state: StoreSnapshot): StoreSnapshot {
  if (!state.currentPath || !state.currentDoc) return state;
  const session = sessionFromState(state, state.currentPath);
  if (!session) return state;
  return {
    ...state,
    sessionsByPath: {
      ...state.sessionsByPath,
      [state.currentPath]: session,
    },
  };
}

function setCurrentFromSession(state: StoreSnapshot, path: string, session: DocumentSession): StoreSnapshot {
  return {
    ...state,
    currentPath: path,
    currentDoc: {
      ...session.doc,
      content: session.doc.raw,
    },
    isDirty: session.isDirty,
    saveStatus: session.saveStatus,
    lastSavedRaw: session.lastSavedRaw,
    hasPendingRemoteUpdate: session.hasPendingRemoteUpdate,
    pendingRemoteSnapshot: session.pendingRemoteSnapshot,
    isComposing: session.isComposing,
    currentSelection: session.selection,
    currentScrollTop: session.scrollTop,
    sessionsByPath: {
      ...state.sessionsByPath,
      [path]: session,
    },
  };
}

function applySessionUpdate(
  state: StoreSnapshot,
  path: string,
  updater: (session: DocumentSession) => DocumentSession,
): StoreSnapshot {
  const session = sessionFromState(state, path);
  if (!session) return state;
  const nextSession = updater(session);
  const nextState = {
    ...state,
    sessionsByPath: {
      ...state.sessionsByPath,
      [path]: nextSession,
    },
  };
  if (state.currentPath !== path) {
    return nextState;
  }
  return setCurrentFromSession(nextState, path, nextSession);
}

function persistDraftForSession(session: DocumentSession): void {
  writeDocumentDraft(session.path, {
    raw: session.doc.raw,
    lastSavedRaw: session.lastSavedRaw,
    baseRevision: session.doc.meta.revision,
  });
}

function scheduleSave(path: string, delayMs = 300): void {
  const coordinator = getCoordinator(path);
  clearScheduledSave(path);
  coordinator.timeout = setTimeout(() => {
    coordinator.timeout = null;
    const state = useDocumentStore.getState();
    const session = sessionFromState(state, path);
    if (!session) return;
    if (session.isComposing) {
      scheduleSave(path, 150);
      return;
    }
    if (session.isDirty || session.hasPendingRemoteUpdate) {
      void state.saveDocument(undefined, path);
    }
  }, delayMs);
}

function syncCurrentSessionTitle(path: string, doc: Document): void {
  const title = doc.meta.path.split("/").pop() || path;
  useTabStore.getState().updateTabTitle(path, title);
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  ...createInitialState(),

  openDocument: async (path) => {
    const currentState = get();
    const persistedState = withPersistedCurrentSession(currentState);
    if (persistedState !== currentState) {
      set(persistedState);
    }

    useTabStore.getState().openTab(path, path.split("/").pop());

    const existingSession = sessionFromState(get(), path);
    if (existingSession) {
      saveLastOpenedPath(path);
      set((state) => setCurrentFromSession(withPersistedCurrentSession(state), path, existingSession));
      return;
    }

    try {
      const doc = await api.getDocument(path);
      const draft = readDocumentDraft(path);
      const shouldRestoreDraft = draft ? shouldRestoreDocumentDraft(doc, draft) : false;
      const restoredRaw = shouldRestoreDraft && draft ? draft.raw : doc.raw;
      const session: DocumentSession = {
        path,
        doc: {
          ...doc,
          raw: restoredRaw,
          content: restoredRaw,
        },
        lastSavedRaw: doc.raw,
        isDirty: shouldRestoreDraft,
        saveStatus: shouldRestoreDraft ? "idle" : "saved",
        hasPendingRemoteUpdate: false,
        pendingRemoteSnapshot: null,
        isComposing: false,
        selection: null,
        scrollTop: 0,
      };

      saveLastOpenedPath(path);
      syncCurrentSessionTitle(path, session.doc);
      set((state) => setCurrentFromSession(withPersistedCurrentSession(state), path, session));
      if (shouldRestoreDraft) {
        persistDraftForSession(session);
        scheduleSave(path, 100);
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
    const path = state.currentPath;

    clearScheduledSave(path);

    try {
      const doc = await api.getDocument(path);
      const session: DocumentSession = {
        path,
        doc: {
          ...doc,
          content: doc.raw,
        },
        lastSavedRaw: doc.raw,
        isDirty: false,
        saveStatus: "saved",
        hasPendingRemoteUpdate: false,
        pendingRemoteSnapshot: null,
        isComposing: false,
        selection: state.currentSelection,
        scrollTop: state.currentScrollTop,
      };
      resetSaveCoordinator(path);
      syncCurrentSessionTitle(path, session.doc);
      set((current) => setCurrentFromSession(withPersistedCurrentSession(current), path, session));
      clearDocumentDraft(path);
    } catch (error) {
      console.error("Failed to reload document:", error);
      set((current) => applySessionUpdate(current, path, (session) => ({
        ...session,
        saveStatus: "conflict",
      })));
    }
  },

  closeDocument: async (path, options) => {
    const targetPath = path ?? get().currentPath;
    if (!targetPath) return;
    await get().closeDocuments([targetPath], { force: options?.force });
  },

  closeDocuments: async (paths, options) => {
    const uniquePaths = [...new Set(paths)].filter(Boolean);
    if (uniquePaths.length === 0) return;

    const state = get();
    const persisted = withPersistedCurrentSession(state);
    const activePath = persisted.currentPath;
    const targetSessions = uniquePaths
      .map((path) => sessionFromState(persisted, path))
      .filter((session): session is DocumentSession => Boolean(session));
    const targetSessionPaths = new Set(targetSessions.map((session) => session.path));
    const tabState = useTabStore.getState();
    const existingTabPaths = new Set(tabState.openTabs.map((tab) => tab.path));
    const closablePaths = uniquePaths.filter((path) => targetSessionPaths.has(path) || existingTabPaths.has(path));

    if (closablePaths.length === 0) return;
    if (!options?.force && targetSessions.some((session) => session.isDirty)) {
      return;
    }

    const closeSet = new Set(closablePaths);
    const fallbackNextPath = activePath && closeSet.has(activePath)
      ? tabState.getNextPathAfterClose(activePath)
      : activePath;
    const preferredNextPath = options?.nextPath ?? fallbackNextPath ?? null;

    for (const session of targetSessions) {
      clearScheduledSave(session.path);
      resetSaveCoordinator(session.path);
      clearDocumentDraft(session.path);
    }

    const remainingSessions = { ...persisted.sessionsByPath };
    for (const session of targetSessions) {
      delete remainingSessions[session.path];
    }

    useTabStore.getState().closeTabs(
      closablePaths,
      preferredNextPath,
    );

    const nextActivePath = useTabStore.getState().activeTabPath;
    const nextActiveSession = nextActivePath ? remainingSessions[nextActivePath] ?? null : null;

    set((current) => {
      const currentPersisted = withPersistedCurrentSession(current);
      const sessionsByPath = { ...currentPersisted.sessionsByPath };
      for (const path of closablePaths) {
        delete sessionsByPath[path];
      }

      if (nextActivePath && sessionsByPath[nextActivePath]) {
        return setCurrentFromSession(
          {
            ...currentPersisted,
            sessionsByPath,
          },
          nextActivePath,
          sessionsByPath[nextActivePath],
        );
      }

      return {
        ...currentPersisted,
        currentPath: null,
        currentDoc: null,
        isDirty: false,
        saveStatus: "idle",
        lastSavedRaw: "",
        hasPendingRemoteUpdate: false,
        pendingRemoteSnapshot: null,
        isComposing: false,
        currentSelection: null,
        currentScrollTop: 0,
        sessionsByPath,
      };
    });

    if (nextActivePath && !nextActiveSession) {
      await get().openDocument(nextActivePath);
      return;
    }

    saveLastOpenedPath(nextActivePath ?? null);
  },

  updateRaw: (raw) => {
    const state = get();
    if (!state.currentPath || !state.currentDoc) return;
    const path = state.currentPath;
    const coordinator = getCoordinator(path);
    coordinator.editRevision += 1;

    set((current) => {
      if (!current.currentPath || !current.currentDoc) return current;
      const nextState: StoreSnapshot = {
        ...current,
        currentDoc: replaceCurrentDocRaw(current.currentDoc, raw),
        isDirty: raw !== current.lastSavedRaw,
        saveStatus: raw !== current.lastSavedRaw ? "idle" : "saved",
      };
      return withPersistedCurrentSession(nextState);
    });

    const updatedSession = sessionFromState(get(), path);
    if (!updatedSession) return;
    if (updatedSession.doc.raw !== updatedSession.lastSavedRaw) {
      persistDraftForSession(updatedSession);
    } else {
      clearDocumentDraft(path);
    }

    scheduleSave(path);
  },

  flushPendingSave: async (options) => {
    const path = get().currentPath;
    if (!path) return;
    clearScheduledSave(path);
    await get().saveDocument(options, path);
  },

  saveDocument: async (options, targetPath) => {
    const path = targetPath ?? get().currentPath;
    if (!path) return;

    const coordinator = getCoordinator(path);
    if (coordinator.activeSavePromise) {
      coordinator.queuedSaveOptions = mergeSaveOptions(coordinator.queuedSaveOptions, options);
      return coordinator.activeSavePromise;
    }

    const runSave = async () => {
      const state = get();
      const session = sessionFromState(state, path);
      if (!session) return;
      const contentChanged = session.doc.raw !== session.lastSavedRaw;

      if (!contentChanged) {
        if (session.pendingRemoteSnapshot) {
          const merged = mergeConcurrentMarkdown({
            base: session.pendingRemoteSnapshot.baseRaw,
            local: session.doc.raw,
            remote: session.pendingRemoteSnapshot.raw,
          });

          if (merged.raw !== session.doc.raw) {
            coordinator.editRevision += 1;
            set((current) => applySessionUpdate(current, path, (currentSession) => ({
              ...currentSession,
              doc: replaceCurrentDocRaw(currentSession.doc, merged.raw),
              isDirty: true,
              saveStatus: merged.droppedRemoteChanges ? "conflict" : "idle",
              hasPendingRemoteUpdate: false,
              pendingRemoteSnapshot: null,
            })));
            const nextSession = sessionFromState(get(), path);
            if (nextSession) {
              persistDraftForSession(nextSession);
            }
            scheduleSave(path, 80);
            return;
          }

          set((current) => applySessionUpdate(current, path, (currentSession) => ({
            ...currentSession,
            hasPendingRemoteUpdate: false,
            pendingRemoteSnapshot: null,
            saveStatus: merged.droppedRemoteChanges
              ? "conflict"
              : deriveSaveStatus({ hasPendingRemoteUpdate: false, isDirty: currentSession.isDirty }),
          })));
          return;
        }
        if (session.hasPendingRemoteUpdate && path === get().currentPath) {
          void get().reloadCurrentDocument();
        }
        return;
      }

      const requestedRaw = session.doc.raw;
      const requestedRevision = coordinator.editRevision;
      const requestId = ++coordinator.activeSaveRequest;

      set((current) => applySessionUpdate(current, path, (currentSession) => ({
        ...currentSession,
        saveStatus: "saving",
      })));

      try {
        const doc = await api.saveDocument(
          path,
          requestedRaw,
          session.doc.meta.revision,
          options?.keepalive ? { keepalive: true } : undefined,
        );

        const latestState = get();
        const latestSession = sessionFromState(latestState, path);
        if (!latestSession) {
          return;
        }
        if (!shouldApplySaveResponse({
          currentPath: path,
          requestedPath: path,
          hasCurrentDoc: true,
        })) {
          return;
        }

        const hasNewerLocalEdits =
          coordinator.editRevision !== requestedRevision ||
          latestSession.doc.raw !== requestedRaw;

        if (requestId !== coordinator.activeSaveRequest || hasNewerLocalEdits) {
          set((current) => applySessionUpdate(current, path, (currentSession) => ({
            ...currentSession,
            doc: replaceCurrentDocRaw(currentSession.doc, currentSession.doc.raw, doc.meta.frontmatter, doc.meta.revision),
            lastSavedRaw: requestedRaw,
            saveStatus: resolveSaveSuccess({
              hasPendingRemoteUpdate: currentSession.hasPendingRemoteUpdate,
              hasNewerLocalEdits: true,
              isDirty: currentSession.isDirty,
              requestedRaw,
            }).saveStatus,
          })));

          const nextSession = sessionFromState(get(), path);
          if (nextSession?.isDirty) {
            persistDraftForSession(nextSession);
            scheduleSave(path, 150);
          }
          return;
        }

        set((current) => applySessionUpdate(current, path, (currentSession) => ({
          ...currentSession,
          doc: {
            ...doc,
            content: doc.raw,
          },
          isDirty: false,
          saveStatus: resolveSaveSuccess({
            hasPendingRemoteUpdate: currentSession.hasPendingRemoteUpdate,
            hasNewerLocalEdits: false,
            isDirty: false,
            requestedRaw,
          }).saveStatus,
          lastSavedRaw: requestedRaw,
        })));
        clearDocumentDraft(path);
        syncCurrentSessionTitle(path, doc);

        const afterSaveSession = sessionFromState(get(), path);
        if (afterSaveSession?.pendingRemoteSnapshot) {
          const merged = mergeConcurrentMarkdown({
            base: afterSaveSession.pendingRemoteSnapshot.baseRaw,
            local: requestedRaw,
            remote: afterSaveSession.pendingRemoteSnapshot.raw,
          });
          const didChange = merged.raw !== requestedRaw;

          set((current) => applySessionUpdate(current, path, (currentSession) => ({
            ...currentSession,
            doc: replaceCurrentDocRaw(currentSession.doc, didChange ? merged.raw : currentSession.doc.raw),
            isDirty: didChange,
            saveStatus: merged.droppedRemoteChanges ? "conflict" : didChange ? "idle" : "saved",
            hasPendingRemoteUpdate: false,
            pendingRemoteSnapshot: null,
          })));
          if (didChange) {
            coordinator.editRevision += 1;
            const nextSession = sessionFromState(get(), path);
            if (nextSession) {
              persistDraftForSession(nextSession);
            }
            scheduleSave(path, 80);
          }
        } else if (afterSaveSession?.hasPendingRemoteUpdate && path === get().currentPath) {
          void get().reloadCurrentDocument();
        }
      } catch (error) {
        const latestDocument = getVersionMismatchDocument(error);
        if (latestDocument) {
          const latestState = get();
          const latestSession = sessionFromState(latestState, path);
          if (!latestSession) return;

          const merged = mergeConcurrentMarkdown({
            base: latestSession.lastSavedRaw,
            local: requestedRaw,
            remote: latestDocument.raw,
          });

          set((current) => applySessionUpdate(current, path, () => ({
            path,
            doc: {
              ...latestDocument,
              content: merged.raw,
              raw: merged.raw,
            },
            isDirty: true,
            saveStatus: merged.droppedRemoteChanges ? "conflict" : "idle",
            lastSavedRaw: latestDocument.raw,
            hasPendingRemoteUpdate: false,
            pendingRemoteSnapshot: null,
            isComposing: false,
            selection: latestSession.selection,
            scrollTop: latestSession.scrollTop,
          })));
          syncCurrentSessionTitle(path, latestDocument);
          if (!merged.droppedRemoteChanges) {
            coordinator.editRevision += 1;
            const nextSession = sessionFromState(get(), path);
            if (nextSession) {
              persistDraftForSession(nextSession);
            }
            scheduleSave(path, 80);
          }
          return;
        }
        set((current) => applySessionUpdate(current, path, (currentSession) => ({
          ...currentSession,
          saveStatus: "conflict",
        })));
      }
    };

    coordinator.activeSavePromise = runSave().finally(() => {
      coordinator.activeSavePromise = null;
      const followUp = coordinator.queuedSaveOptions;
      coordinator.queuedSaveOptions = null;
      if (!followUp) return;

      const latestSession = sessionFromState(get(), path);
      if (!latestSession) return;
      if (latestSession.isComposing) {
        scheduleSave(path, 100);
        return;
      }
      if (latestSession.isDirty || latestSession.hasPendingRemoteUpdate) {
        void get().saveDocument(followUp, path);
      }
    });

    return coordinator.activeSavePromise;
  },

  beginComposition: () => {
    const path = get().currentPath;
    if (!path) return;
    set((current) => applySessionUpdate(current, path, (session) => ({
      ...session,
      isComposing: true,
    })));
  },

  endComposition: () => {
    const path = get().currentPath;
    if (!path) return;
    const before = sessionFromState(get(), path);
    set((current) => applySessionUpdate(current, path, (session) => ({
      ...session,
      isComposing: false,
    })));
    const after = sessionFromState(get(), path);
    if (!after) return;
    if (after.isDirty) {
      scheduleSave(path, 100);
      return;
    }
    if (before && shouldReloadAfterCompositionEnd({
      isDirty: after.isDirty,
      hasPendingRemoteUpdate: after.hasPendingRemoteUpdate,
    })) {
      void get().saveDocument(undefined, path);
    }
  },

  updateEditorViewport: (snapshot) => {
    const path = get().currentPath;
    if (!path) return;
    set((current) => applySessionUpdate(current, path, (session) => ({
      ...session,
      selection: snapshot.selection === undefined ? session.selection : snapshot.selection,
      scrollTop: snapshot.scrollTop === undefined ? session.scrollTop : snapshot.scrollTop,
    })));
  },

  handleExternalUpdate: (path, raw, originClientId, frontmatter, revision) => {
    const state = get();
    const session = sessionFromState(state, path);
    if (!session) return;

    const effectivelyDirty = session.isDirty || session.saveStatus === "saving";
    const resolution = resolveRemoteUpdate({
      raw,
      currentRaw: session.doc.raw,
      lastSavedRaw: session.lastSavedRaw,
      isDirty: effectivelyDirty,
      isComposing: session.isComposing,
      hasPendingRemoteUpdate: session.hasPendingRemoteUpdate,
      originClientId,
      editorClientId: EDITOR_CLIENT_ID,
    });

    if (resolution.action === "ignore") {
      return;
    }
    if (resolution.action === "queue") {
      set((current) => applySessionUpdate(current, path, (currentSession) => ({
        ...currentSession,
        hasPendingRemoteUpdate: true,
        pendingRemoteSnapshot: resolution.snapshot,
      })));
      return;
    }

    set((current) => applySessionUpdate(current, path, (currentSession) => ({
      ...currentSession,
      doc: replaceCurrentDocRaw(currentSession.doc, resolution.raw, frontmatter, revision),
      isDirty: false,
      saveStatus: resolution.saveStatus,
      lastSavedRaw: resolution.raw,
      hasPendingRemoteUpdate: false,
      pendingRemoteSnapshot: null,
    })));
    clearDocumentDraft(path);
  },

  handleExternalMove: (from, to) => {
    const state = get();
    const nextSessions: Record<string, DocumentSession> = {};
    for (const [path, session] of Object.entries(state.sessionsByPath)) {
      const remappedPath = remapMovedPath(path, from, to);
      if (!remappedPath) continue;
      nextSessions[remappedPath] = {
        ...session,
        path: remappedPath,
        doc: {
          ...session.doc,
          meta: {
            ...session.doc.meta,
            path: remappedPath,
          },
        },
      };
    }

    const nextPath = remapMovedPath(state.currentPath, from, to);
    const nextCurrentDoc = state.currentDoc && nextPath
      ? {
          ...state.currentDoc,
          meta: {
            ...state.currentDoc.meta,
            path: nextPath,
          },
        }
      : state.currentDoc;

    useTabStore.getState().updateTabPath(from, to);

    set({
      currentPath: nextPath,
      currentDoc: nextCurrentDoc,
      sessionsByPath: nextSessions,
    });
    saveLastOpenedPath(nextPath);
  },

  hasSession: (path) => {
    const state = get();
    return Boolean(sessionFromState(state, path));
  },
}));

export function getDocumentEditorClientId(): string {
  return EDITOR_CLIENT_ID;
}

export function resetDocumentStoreForTests(): void {
  resetAllSaveCoordinators();
  useDocumentStore.setState(createInitialState());
  resetTabStoreForTests();
}
