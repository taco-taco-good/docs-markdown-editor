import { useCallback, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useUIStore } from "../../stores/ui.store";
import { FileTree } from "../tree/FileTree";
import { CreateDocumentModal } from "./CreateDocumentModal";
import { CreateFolderModal } from "./CreateFolderModal";

export function Sidebar() {
  const open = useUIStore((s) => s.sidebarOpen);
  const width = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const [createOpen, setCreateOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createParentPath, setCreateParentPath] = useState("");

  const startResize = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = width;

      const handleMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        setSidebarWidth(startWidth + delta);
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [setSidebarWidth, width],
  );

  if (!open) return null;

  return (
    <>
      <div
        className="absolute inset-0 z-30 bg-[rgba(9,11,17,0.64)] backdrop-blur-[2px] md:hidden"
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className="relative h-full flex flex-col shrink-0 overflow-hidden animate-slide-in-left md:animate-none md:static absolute left-0 top-0 bottom-0 z-40 shadow-2xl md:shadow-none"
        style={{
          width: `min(88vw, ${width}px)`,
          background: "var(--color-surface-1)",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        <div
          className="h-10 flex items-center justify-between gap-2 px-3 border-b shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span
            className="text-[11px] font-medium uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            문서
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-3)]"
              onClick={() => {
                setCreateParentPath("");
                setCreateOpen(true);
              }}
              title="루트에 새 문서"
              style={{ color: "var(--color-text-muted)" }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M8 3.5V12.5" />
                <path d="M3.5 8H12.5" />
              </svg>
            </button>
            <button
              type="button"
              className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-3)]"
              onClick={() => {
                setCreateParentPath("");
                setCreateFolderOpen(true);
              }}
              title="루트에 새 폴더"
              style={{ color: "var(--color-text-muted)" }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 5.5H13.5V12H2.5V5.5Z" />
                <path d="M2.5 5.5V4.5C2.5 4 2.9 3.5 3.5 3.5H6L7.2 4.7H12.5C13.1 4.7 13.5 5.1 13.5 5.7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          <FileTree
            onCreateDocument={(parentPath) => {
              setCreateParentPath(parentPath);
              setCreateOpen(true);
            }}
            onCreateFolder={(parentPath) => {
              setCreateParentPath(parentPath);
              setCreateFolderOpen(true);
            }}
          />
        </div>
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="사이드바 너비 조절"
          onMouseDown={startResize}
        />
      </aside>
      <CreateDocumentModal open={createOpen} onClose={() => setCreateOpen(false)} parentDirectoryOverride={createParentPath} />
      <CreateFolderModal open={createFolderOpen} onClose={() => setCreateFolderOpen(false)} parentDirectoryOverride={createParentPath} />
    </>
  );
}
