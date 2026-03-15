import { create } from "zustand";

interface UIStore {
  sidebarOpen: boolean;
  sidebarWidth: number;
  searchOpen: boolean;
  outlineOpen: boolean;
  settingsOpen: boolean;
  theme: "dark" | "light";
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
  setTheme: (t: "dark" | "light") => void;
  showToast: (message: string, tone?: "error" | "info") => void;
  clearToast: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  sidebarWidth: 260,
  searchOpen: false,
  outlineOpen: true,
  settingsOpen: false,
  theme: "dark",
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
  setTheme: (theme) => set({ theme }),
  showToast: (message, tone = "info") =>
    set({ toast: { id: Date.now(), message, tone } }),
  clearToast: () => set({ toast: null }),
}));
