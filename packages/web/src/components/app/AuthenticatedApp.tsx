import { useEffect } from "react";
import { Header } from "../layout/Header";
import { Sidebar } from "../layout/Sidebar";
import { EditorLayout } from "../layout/EditorLayout";
import { ToastViewport } from "../layout/ToastViewport";
import { SearchModal } from "../search/SearchModal";
import { SettingsPage } from "../settings/SettingsPage";
import { useWebSocket } from "../../hooks/useWebSocket";
import { registerDocumentPersistenceLifecycle } from "../../lib/document-lifecycle";
import { useDocumentStore, getLastOpenedPath } from "../../stores/document.store";
import { useTabStore } from "../../stores/tab.store.js";
import { useTreeStore } from "../../stores/tree.store";
import { useUIStore } from "../../stores/ui.store";

export function AuthenticatedApp() {
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const currentPath = useDocumentStore((s) => s.currentPath);
  const selectTreePath = useTreeStore((s) => s.selectPath);
  useWebSocket();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        useDocumentStore.getState().saveDocument();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        const store = useDocumentStore.getState();
        if (store.isDirty && !window.confirm("저장하지 않은 변경 사항이 있습니다. 탭을 닫을까요?")) {
          return;
        }
        void store.closeDocument(undefined, { force: true });
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "[") {
        e.preventDefault();
        const tabState = useTabStore.getState();
        const currentIndex = tabState.openTabs.findIndex((tab) => tab.path === tabState.activeTabPath);
        const target = currentIndex > 0 ? tabState.openTabs[currentIndex - 1] : null;
        if (target) {
          void useDocumentStore.getState().openDocument(target.path);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "]") {
        e.preventDefault();
        const tabState = useTabStore.getState();
        const currentIndex = tabState.openTabs.findIndex((tab) => tab.path === tabState.activeTabPath);
        const target = currentIndex >= 0 ? tabState.openTabs[currentIndex + 1] ?? null : null;
        if (target) {
          void useDocumentStore.getState().openDocument(target.path);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => registerDocumentPersistenceLifecycle({
    document: window.document,
    window,
    store: useDocumentStore.getState(),
  }), []);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setSidebarOpen(false);
    }
  }, [setSidebarOpen]);

  useEffect(() => {
    selectTreePath(currentPath ?? "");
  }, [currentPath, selectTreePath]);

  useEffect(() => {
    const tabStore = useTabStore.getState();
    tabStore.hydrate();
    const activeTabPath = tabStore.activeTabPath;
    if (activeTabPath && !useDocumentStore.getState().currentPath) {
      useDocumentStore.getState().openDocument(activeTabPath);
      return;
    }

    const lastPath = getLastOpenedPath();
    if (lastPath && !useDocumentStore.getState().currentPath) {
      useDocumentStore.getState().openDocument(lastPath);
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex-1 flex min-h-0 relative">
        <Sidebar />
        <EditorLayout />
      </div>
      <MobileSidebarButton />
      <ToastViewport />
      <SearchModal />
      {settingsOpen ? <SettingsPage /> : null}
    </div>
  );
}

function MobileSidebarButton() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  if (sidebarOpen) return null;

  return (
    <button
      type="button"
      className="sm:hidden fixed right-4 bottom-4 z-40 h-12 px-4 rounded-full border shadow-lg flex items-center gap-2"
      style={{
        background: "color-mix(in srgb, var(--color-surface-2) 92%, rgba(0,0,0,0.35))",
        borderColor: "color-mix(in srgb, var(--color-accent) 40%, var(--color-border))",
        color: "var(--color-text-primary)",
        backdropFilter: "blur(12px)",
      }}
      onClick={toggleSidebar}
      aria-label="문서 목록 열기"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2.5 3.5H6.5L8 5H13.5V12.5H2.5V3.5Z" />
      </svg>
      <span className="text-sm font-medium">문서</span>
    </button>
  );
}
