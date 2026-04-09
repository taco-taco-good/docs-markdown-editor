import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentStore } from "../../stores/document.store";
import { useTabStore } from "../../stores/tab.store.js";
import { useTreeStore } from "../../stores/tree.store";
import { useUIStore } from "../../stores/ui.store";

interface TabContextMenuState {
  path: string;
  left: number;
  top: number;
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 4L12 12" />
      <path d="M12 4L4 12" />
    </svg>
  );
}

function PinIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2.5H11L10 6L12.5 8.5L8.75 9.5L8 13.5L5.75 9.5L2.5 8.5L5 6L5 2.5Z" />
    </svg>
  );
}

function ContextMenuItem({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className="w-full px-3 py-2 text-left text-[12px] transition-colors"
      style={{
        color: danger ? "var(--color-danger)" : "var(--color-text-primary)",
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function EditorTabs() {
  const openTabs = useTabStore((s) => s.openTabs);
  const activeTabPath = useTabStore((s) => s.activeTabPath);
  const setPinned = useTabStore((s) => s.setPinned);
  const moveTab = useTabStore((s) => s.moveTab);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const closeDocuments = useDocumentStore((s) => s.closeDocuments);
  const currentPath = useDocumentStore((s) => s.currentPath);
  const currentDoc = useDocumentStore((s) => s.currentDoc);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const sessionsByPath = useDocumentStore((s) => s.sessionsByPath);
  const deleteDocument = useTreeStore((s) => s.deleteNode);
  const outlineOpen = useUIStore((s) => s.outlineOpen);
  const toggleOutline = useUIStore((s) => s.toggleOutline);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [menu, setMenu] = useState<TabContextMenuState | null>(null);

  const dirtyByPath = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const [path, session] of Object.entries(sessionsByPath)) {
      map.set(path, session.isDirty);
    }
    if (currentPath) {
      map.set(currentPath, isDirty);
    }
    return map;
  }, [currentPath, isDirty, sessionsByPath]);

  const titleByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const [path, session] of Object.entries(sessionsByPath)) {
      map.set(path, session.doc.meta.path.split("/").pop() || path);
    }
    if (currentPath && currentDoc) {
      map.set(currentPath, currentDoc.meta.path.split("/").pop() || currentPath);
    }
    return map;
  }, [currentDoc, currentPath, sessionsByPath]);

  const confirmDiscard = (paths: string[]): boolean => {
    const dirtyTabs = paths.filter((path) => dirtyByPath.get(path));
    if (dirtyTabs.length === 0) return true;
    const targetLabel = dirtyTabs.length === 1 ? "탭 1개" : `탭 ${dirtyTabs.length}개`;
    return window.confirm(`저장하지 않은 변경 사항이 있는 ${targetLabel}를 닫을까요?`);
  };

  const closePaths = async (paths: string[], nextPath?: string | null) => {
    const uniquePaths = [...new Set(paths)].filter(Boolean);
    if (uniquePaths.length === 0) return;
    if (!confirmDiscard(uniquePaths)) return;
    await closeDocuments(uniquePaths, { force: true, nextPath: nextPath ?? null });
    setMenu(null);
  };

  useEffect(() => {
    if (!menu) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-tab-context-menu='true']")) return;
      setMenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menu]);

  useEffect(() => {
    if (!activeTabPath) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const activeButton = scroller.querySelector<HTMLElement>(`[data-tab-activate="${activeTabPath}"]`);
    if (!activeButton) return;

    const frame = window.requestAnimationFrame(() => {
      activeButton.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTabPath, openTabs]);

  if (openTabs.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="relative h-10 shrink-0 border-b flex items-stretch min-w-0"
      style={{
        background: "var(--color-surface-1)",
        borderColor: "var(--color-border)",
      }}
    >
      <div ref={scrollerRef} className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden">
        <div className="min-w-max h-full flex items-stretch">
        {openTabs.map((tab, index) => {
          const isActive = tab.path === activeTabPath;
          const title = titleByPath.get(tab.path) ?? tab.title;
          const dirty = dirtyByPath.get(tab.path) ?? false;

          return (
            <div
              key={tab.path}
              draggable
              data-tab-path={tab.path}
              onDragStart={(event) => {
                setDraggedPath(tab.path);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", tab.path);
              }}
              onDragOver={(event) => {
                if (!draggedPath || draggedPath === tab.path) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!draggedPath || draggedPath === tab.path) return;
                moveTab(draggedPath, index);
                setDraggedPath(null);
              }}
              onDragEnd={() => setDraggedPath(null)}
              className="group flex items-center max-w-[16rem] min-w-[10rem] h-full border-r"
              style={{
                borderColor: "color-mix(in srgb, var(--color-border) 80%, transparent)",
                opacity: draggedPath === tab.path ? 0.65 : 1,
              }}
            >
              <button
                type="button"
                data-tab-activate={tab.path}
                className="flex-1 min-w-0 h-full px-3 flex items-center gap-2 text-left transition-colors"
                style={{
                  background: isActive ? "var(--color-surface-2)" : "transparent",
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                }}
                onClick={() => void openDocument(tab.path)}
                onAuxClick={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  void closePaths([tab.path], useTabStore.getState().getNextPathAfterClose(tab.path));
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const containerRect = containerRef.current?.getBoundingClientRect();
                  setMenu({
                    path: tab.path,
                    left: containerRect ? event.clientX - containerRect.left : event.clientX,
                    top: containerRect ? event.clientY - containerRect.top : event.clientY,
                  });
                }}
                title={title}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: dirty
                      ? "var(--color-accent)"
                      : isActive
                        ? "color-mix(in srgb, var(--color-text-muted) 45%, transparent)"
                        : "transparent",
                  }}
                />
                {tab.pinned ? (
                  <span
                    className="inline-flex items-center justify-center shrink-0"
                    style={{ color: "var(--color-text-muted)" }}
                    aria-hidden="true"
                  >
                    <PinIcon filled />
                  </span>
                ) : null}
                <span className="truncate text-[13px]">{title}</span>
              </button>
              <button
                type="button"
                data-tab-close={tab.path}
                className="w-8 h-full shrink-0 flex items-center justify-center transition-colors"
                style={{
                  color: "var(--color-text-muted)",
                  background: isActive ? "var(--color-surface-2)" : "transparent",
                }}
                onClick={async (event) => {
                  event.stopPropagation();
                  await closePaths([tab.path], useTabStore.getState().getNextPathAfterClose(tab.path));
                }}
                title="탭 닫기"
                aria-label={`${title} 탭 닫기`}
              >
                <CloseIcon />
              </button>
            </div>
          );
        })}
        </div>
      </div>

      <div
        className="shrink-0 h-full flex items-center gap-1 px-2"
        style={{
          borderLeft: "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
          background: "var(--color-surface-1)",
        }}
      >
        <button
          type="button"
          className="ui-icon-button w-7 h-7"
          style={{
            color: outlineOpen ? "var(--color-accent)" : "var(--color-text-muted)",
            background: outlineOpen ? "color-mix(in srgb, var(--color-accent) 10%, transparent)" : "transparent",
          }}
          onClick={toggleOutline}
          title={outlineOpen ? "개요 닫기" : "개요 열기"}
          aria-label={outlineOpen ? "개요 닫기" : "개요 열기"}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M3 4H13" />
            <path d="M5 8H13" />
            <path d="M7 12H13" />
          </svg>
        </button>

        <button
          type="button"
          className="ui-button ui-button--header h-7 px-2 text-xs"
          style={{ color: "var(--color-text-muted)" }}
          onClick={() => {
            if (!currentPath) return;
            void deleteDocument(currentPath);
          }}
          disabled={!currentPath}
        >
          삭제
        </button>
      </div>

      {menu ? (
        <div
          data-tab-context-menu="true"
          className="absolute z-30 min-w-[13rem] rounded-lg border overflow-hidden shadow-xl"
          style={{
            left: `${menu.left}px`,
            top: `${menu.top}px`,
            background: "var(--color-surface-2)",
            borderColor: "var(--color-border)",
          }}
        >
          {(() => {
            const targetTab = openTabs.find((tab) => tab.path === menu.path);
            if (!targetTab) return null;
            const closeOthersPaths = openTabs.filter((tab) => tab.path !== targetTab.path && !tab.pinned).map((tab) => tab.path);
            const targetIndex = openTabs.findIndex((tab) => tab.path === targetTab.path);
            const closeRightPaths = openTabs
              .slice(targetIndex + 1)
              .filter((tab) => !tab.pinned)
              .map((tab) => tab.path);
            const closeAllPaths = openTabs.filter((tab) => !tab.pinned).map((tab) => tab.path);

            return (
              <>
                <ContextMenuItem
                  label={targetTab.pinned ? "탭 고정 해제" : "탭 고정"}
                  onClick={() => {
                    setPinned(targetTab.path, !targetTab.pinned);
                    setMenu(null);
                  }}
                />
                <ContextMenuItem
                  label="탭 닫기"
                  onClick={() => void closePaths([targetTab.path], useTabStore.getState().getNextPathAfterClose(targetTab.path))}
                />
                <ContextMenuItem
                  label="다른 탭 닫기"
                  onClick={() => void closePaths(closeOthersPaths, targetTab.path)}
                />
                <ContextMenuItem
                  label="오른쪽 탭 닫기"
                  onClick={() => void closePaths(closeRightPaths, targetTab.path)}
                />
                <ContextMenuItem
                  label="모든 탭 닫기"
                  danger
                  onClick={() => void closePaths(closeAllPaths, targetTab.pinned ? targetTab.path : null)}
                />
              </>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}
