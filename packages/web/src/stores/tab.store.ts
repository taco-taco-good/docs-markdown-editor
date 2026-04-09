import { create } from "zustand";

const TAB_STATE_KEY = "foldmark-open-tabs";

export interface EditorTab {
  path: string;
  title: string;
  pinned: boolean;
  lastVisitedAt: number;
}

interface PersistedTabState {
  openTabs: Array<Pick<EditorTab, "path" | "title" | "pinned" | "lastVisitedAt">>;
  activeTabPath: string | null;
}

interface TabStore {
  openTabs: EditorTab[];
  activeTabPath: string | null;
  hydrated: boolean;

  hydrate: () => void;
  openTab: (path: string, title?: string) => void;
  activateTab: (path: string) => void;
  closeTab: (path: string) => void;
  closeTabs: (paths: string[], preferredActivePath?: string | null) => void;
  closeOtherTabs: (path: string) => void;
  closeTabsToRight: (path: string) => void;
  closeAllTabs: (options?: { keepPinned?: boolean; preferredActivePath?: string | null }) => void;
  updateTabTitle: (path: string, title: string) => void;
  updateTabPath: (from: string, to: string) => void;
  removeTab: (path: string) => void;
  setPinned: (path: string, pinned: boolean) => void;
  moveTab: (path: string, nextIndex: number) => void;
  getNextPathAfterClose: (path: string) => string | null;
}

function persistState(state: Pick<TabStore, "openTabs" | "activeTabPath">): void {
  try {
    const payload: PersistedTabState = {
      openTabs: state.openTabs.map((tab) => ({
        path: tab.path,
        title: tab.title,
        pinned: tab.pinned,
        lastVisitedAt: tab.lastVisitedAt,
      })),
      activeTabPath: state.activeTabPath,
    };
    localStorage.setItem(TAB_STATE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage unavailable
  }
}

function readPersistedState(): PersistedTabState | null {
  try {
    const raw = localStorage.getItem(TAB_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedTabState;
    if (!Array.isArray(parsed.openTabs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function titleFromPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function touchTab(tab: EditorTab): EditorTab {
  return {
    ...tab,
    lastVisitedAt: Date.now(),
  };
}

function normalizeTabOrder(tabs: EditorTab[]): EditorTab[] {
  const pinned = tabs.filter((tab) => tab.pinned);
  const regular = tabs.filter((tab) => !tab.pinned);
  return [...pinned, ...regular];
}

function resolveActivePath(
  tabs: EditorTab[],
  currentActivePath: string | null,
  preferredActivePath?: string | null,
): string | null {
  if (preferredActivePath && tabs.some((tab) => tab.path === preferredActivePath)) {
    return preferredActivePath;
  }
  if (currentActivePath && tabs.some((tab) => tab.path === currentActivePath)) {
    return currentActivePath;
  }
  return tabs[0]?.path ?? null;
}

export const useTabStore = create<TabStore>((set, get) => ({
  openTabs: [],
  activeTabPath: null,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const persisted = readPersistedState();
    if (!persisted) {
      set({ hydrated: true });
      return;
    }

    const openTabs = persisted.openTabs
      .filter((tab) => typeof tab.path === "string" && tab.path.length > 0)
      .map((tab) => ({
        path: tab.path,
        title: titleFromPath(tab.path),
        pinned: Boolean(tab.pinned),
        lastVisitedAt: typeof tab.lastVisitedAt === "number" ? tab.lastVisitedAt : Date.now(),
      }));

    const activeTabPath = persisted.activeTabPath && openTabs.some((tab) => tab.path === persisted.activeTabPath)
      ? persisted.activeTabPath
      : openTabs[0]?.path ?? null;

    set({
      openTabs,
      activeTabPath,
      hydrated: true,
    });
  },

  openTab: (path, title) => {
    const now = Date.now();
    set((state) => {
      const existing = state.openTabs.find((tab) => tab.path === path);
      const openTabs = existing
        ? state.openTabs.map((tab) => (tab.path === path ? { ...tab, title: title ?? titleFromPath(path), lastVisitedAt: now } : tab))
        : normalizeTabOrder([
            ...state.openTabs,
            {
              path,
              title: title ?? titleFromPath(path),
              pinned: false,
              lastVisitedAt: now,
            },
          ]);

      const next = {
        openTabs,
        activeTabPath: path,
      };
      persistState(next);
      return next;
    });
  },

  activateTab: (path) => {
    set((state) => {
      if (!state.openTabs.some((tab) => tab.path === path)) return state;
      const next = {
        openTabs: state.openTabs.map((tab) => (tab.path === path ? touchTab(tab) : tab)),
        activeTabPath: path,
      };
      persistState(next);
      return next;
    });
  },

  closeTab: (path) => {
    set((state) => {
      const openTabs = state.openTabs.filter((tab) => tab.path !== path);
      const activeTabPath = state.activeTabPath === path
        ? openTabs[openTabs.length - 1]?.path ?? null
        : state.activeTabPath;
      const next = { openTabs, activeTabPath };
      persistState(next);
      return next;
    });
  },

  closeTabs: (paths, preferredActivePath) => {
    const pathSet = new Set(paths);
    set((state) => {
      const openTabs = state.openTabs.filter((tab) => !pathSet.has(tab.path));
      const activeTabPath = resolveActivePath(openTabs, state.activeTabPath, preferredActivePath);
      const next = { openTabs, activeTabPath };
      persistState(next);
      return next;
    });
  },

  closeOtherTabs: (path) => {
    set((state) => {
      const openTabs = state.openTabs.filter((tab) => tab.path === path || tab.pinned);
      const activeTabPath = openTabs.some((tab) => tab.path === path) ? path : openTabs[0]?.path ?? null;
      const next = { openTabs, activeTabPath };
      persistState(next);
      return next;
    });
  },

  closeTabsToRight: (path) => {
    set((state) => {
      const index = state.openTabs.findIndex((tab) => tab.path === path);
      if (index === -1) return state;

      const preserve = new Set(
        state.openTabs
          .slice(0, index + 1)
          .filter((tab) => tab.path === path || tab.pinned)
          .map((tab) => tab.path),
      );
      const openTabs = state.openTabs.filter((tab, tabIndex) => tabIndex <= index || preserve.has(tab.path) || tab.pinned);
      const activeTabPath = resolveActivePath(openTabs, state.activeTabPath, path);
      const next = { openTabs, activeTabPath };
      persistState(next);
      return next;
    });
  },

  closeAllTabs: (options) => {
    set((state) => {
      const openTabs = options?.keepPinned ? state.openTabs.filter((tab) => tab.pinned) : [];
      const activeTabPath = resolveActivePath(openTabs, state.activeTabPath, options?.preferredActivePath ?? null);
      const next = { openTabs, activeTabPath };
      persistState(next);
      return next;
    });
  },

  updateTabTitle: (path, title) => {
    set((state) => {
      const openTabs = state.openTabs.map((tab) => (tab.path === path ? { ...tab, title } : tab));
      const next = { openTabs, activeTabPath: state.activeTabPath };
      persistState(next);
      return next;
    });
  },

  updateTabPath: (from, to) => {
    set((state) => {
      const openTabs = state.openTabs.map((tab) => (
        tab.path === from
          ? { ...tab, path: to, title: tab.title === titleFromPath(from) ? titleFromPath(to) : tab.title }
          : tab
      ));
      const activeTabPath = state.activeTabPath === from ? to : state.activeTabPath;
      const next = { openTabs, activeTabPath };
      persistState(next);
      return next;
    });
  },

  removeTab: (path) => {
    set((state) => {
      const openTabs = state.openTabs.filter((tab) => tab.path !== path);
      const activeTabPath = state.activeTabPath === path ? openTabs[0]?.path ?? null : state.activeTabPath;
      const next = { openTabs, activeTabPath };
      persistState(next);
      return next;
    });
  },

  setPinned: (path, pinned) => {
    set((state) => {
      const openTabs = normalizeTabOrder(state.openTabs.map((tab) => (tab.path === path ? { ...tab, pinned } : tab)));
      const next = { openTabs, activeTabPath: state.activeTabPath };
      persistState(next);
      return next;
    });
  },

  moveTab: (path, nextIndex) => {
    set((state) => {
      const currentIndex = state.openTabs.findIndex((tab) => tab.path === path);
      if (currentIndex === -1) return state;

      const openTabs = [...state.openTabs];
      const [moved] = openTabs.splice(currentIndex, 1);
      const clampedIndex = Math.max(0, Math.min(nextIndex, openTabs.length));
      openTabs.splice(clampedIndex, 0, moved);

      const next = {
        openTabs: normalizeTabOrder(openTabs),
        activeTabPath: state.activeTabPath,
      };
      persistState(next);
      return next;
    });
  },

  getNextPathAfterClose: (path) => {
    const tabs = get().openTabs;
    const index = tabs.findIndex((tab) => tab.path === path);
    if (index === -1) return get().activeTabPath;
    return tabs[index + 1]?.path ?? tabs[index - 1]?.path ?? null;
  },
}));

export function resetTabStoreForTests(): void {
  try {
    localStorage.removeItem(TAB_STATE_KEY);
  } catch {
    // localStorage unavailable
  }
  useTabStore.setState({
    openTabs: [],
    activeTabPath: null,
    hydrated: false,
  });
}
