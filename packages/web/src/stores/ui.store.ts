import { create } from "zustand";
import { getSavedThemeId, saveThemeId, resolveTheme, applyTheme, type ThemeDef } from "../lib/themes";

interface UIStore {
  sidebarOpen: boolean;
  sidebarWidth: number;
  searchOpen: boolean;
  outlineOpen: boolean;
  settingsOpen: boolean;
  themeId: string;
  toast: { id: number; message: string; tone: "error" | "info" } | null;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (w: number) => void;
  toggleSearch: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  toggleOutline: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setTheme: (id: string) => void;
  showToast: (message: string, tone?: "error" | "info") => void;
  clearToast: () => void;
}

function initTheme(): string {
  const id = getSavedThemeId();
  applyTheme(resolveTheme(id));
  return id;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  sidebarWidth: 260,
  searchOpen: false,
  outlineOpen: true,
  settingsOpen: false,
  themeId: initTheme(),
  toast: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarWidth: (sidebarWidth) =>
    set({ sidebarWidth: Math.min(Math.max(Math.round(sidebarWidth), 220), 520) }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  toggleOutline: () => set((s) => ({ outlineOpen: !s.outlineOpen })),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  setTheme: (themeId) => {
    const theme = resolveTheme(themeId);
    applyTheme(theme);
    saveThemeId(themeId);
    set({ themeId });
  },
  showToast: (message, tone = "info") =>
    set({ toast: { id: Date.now(), message, tone } }),
  clearToast: () => set({ toast: null }),
}));

// Re-export for convenience
export type { ThemeDef };
