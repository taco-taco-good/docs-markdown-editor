import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useUIStore } from "../../stores/ui.store";
import { useDocumentStore } from "../../stores/document.store";
import { useAuthStore } from "../../stores/auth.store";

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1.5v1.3M8 13.2v1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M1.5 8h1.3M13.2 8h1.3M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
    </svg>
  );
}

export function Header() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const openSearch = useUIStore((s) => s.openSearch);
  const openSettings = useUIStore((s) => s.openSettings);
  const currentPath = useDocumentStore((s) => s.currentPath);
  const saveStatus = useDocumentStore((s) => s.saveStatus);
  const hasPendingRemoteUpdate = useDocumentStore((s) => s.hasPendingRemoteUpdate);
  const username = useAuthStore((s) => s.username);
  const logout = useAuthStore((s) => s.logout);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceRoot, setWorkspaceRoot] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.getWorkspaceInfo().then((info) => {
      if (!cancelled) {
        setWorkspaceName(info.workspaceName);
        setWorkspaceRoot(info.workspaceRoot);
      }
    }).catch(() => {
      if (!cancelled) {
        setWorkspaceName("");
        setWorkspaceRoot("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="h-11 flex items-center gap-2 px-3 border-b shrink-0"
      style={{
        background: "var(--color-surface-1)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-3)]"
        aria-label="Toggle sidebar"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {sidebarOpen ? (
            <>
              <line x1="3" y1="4" x2="13" y2="4" />
              <line x1="3" y1="8" x2="13" y2="8" />
              <line x1="3" y1="12" x2="13" y2="12" />
            </>
          ) : (
            <>
              <line x1="3" y1="4" x2="13" y2="4" />
              <line x1="3" y1="8" x2="10" y2="8" />
              <line x1="3" y1="12" x2="13" y2="12" />
            </>
          )}
        </svg>
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2 mr-2 shrink-0">
        <span
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: "var(--color-accent)", fontFamily: "var(--font-ui)" }}
        >
          Docs
        </span>
      </div>

      {workspaceName ? (
        <div
          className="hidden sm:block min-w-0 max-w-[32vw] truncate rounded-md px-2.5 py-1 text-xs"
          style={{
            background: "var(--color-surface-2)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
          title={workspaceRoot}
        >
          워크스페이스 · {workspaceName}
        </div>
      ) : null}

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Search trigger */}
      <button
        onClick={openSearch}
        className="flex items-center gap-2 h-8 px-2.5 md:px-3 rounded-md text-xs transition-colors shrink-0"
        aria-label="빠른 열기"
        style={{
          background: "var(--color-surface-2)",
          color: "var(--color-text-tertiary)",
          border: "1px solid var(--color-border)",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="6.5" cy="6.5" r="5" />
          <line x1="10" y1="10" x2="14" y2="14" />
        </svg>
        <span className="hidden sm:inline">빠른 열기</span>
        <kbd
          className="ml-1 px-1 rounded text-[10px]"
          style={{
            background: "var(--color-surface-3)",
            color: "var(--color-text-muted)",
          }}
        >
          ⌘P
        </kbd>
      </button>

      {/* Save status */}
      {currentPath && (
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] ml-2" style={{ color: "var(--color-text-muted)" }}>
          {saveStatus === "saving" && (
            <>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-accent)" }} />
              <span>저장 중…</span>
            </>
          )}
          {saveStatus !== "saving" && hasPendingRemoteUpdate && (
            <>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-warning)" }} />
              <span>실시간 동기화 중…</span>
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-success)" }} />
              <span>저장됨</span>
            </>
          )}
          {saveStatus === "conflict" && !hasPendingRemoteUpdate && (
            <>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-danger)" }} />
              <span>충돌</span>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 ml-2 sm:ml-3 pl-2 sm:pl-3 border-l" style={{ borderColor: "var(--color-border)" }}>
        {username && (
          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            {username}
          </span>
        )}
        <button
          onClick={openSettings}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-3)]"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="설정"
          title="설정"
        >
          <SettingsIcon />
        </button>
        <button
          onClick={() => void logout()}
          className="h-7 px-2.5 rounded-md text-xs transition-colors"
          style={{
            background: "var(--color-surface-2)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
