import { useEffect } from "react";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { EditorLayout } from "./components/layout/EditorLayout";
import { ToastViewport } from "./components/layout/ToastViewport";
import { SearchModal } from "./components/search/SearchModal";
import { SettingsPage } from "./components/settings/SettingsPage";
import { LoginPage } from "./components/auth/LoginPage";
import { SetupPage } from "./components/auth/SetupPage";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAuthStore } from "./stores/auth.store";
import { useDocumentStore } from "./stores/document.store";
import { useUIStore } from "./stores/ui.store";

export function App() {
  const authenticated = useAuthStore((s) => s.authenticated);
  const checking = useAuthStore((s) => s.checking);
  const initialized = useAuthStore((s) => s.initialized);
  const checkSession = useAuthStore((s) => s.checkSession);

  // Check status + session on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Show loading while checking
  if (checking) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ background: "var(--color-surface-0)" }}
      >
        <div
          className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  // First-time setup
  if (initialized === false) {
    return <SetupPage />;
  }

  if (!authenticated) {
    return <LoginPage />;
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  useWebSocket();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        useDocumentStore.getState().saveDocument();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setSidebarOpen(false);
    }
  }, [setSidebarOpen]);

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
