import { useEffect, useMemo, useState } from "react";
import { useDocumentStore } from "../../stores/document.store";
import { useTreeStore } from "../../stores/tree.store";
import { useUIStore } from "../../stores/ui.store";

function fileNameFromPath(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] ?? path;
}

export function EditorToolbar() {
  const currentPath = useDocumentStore((s) => s.currentPath);
  const hasCurrentDoc = useDocumentStore((s) => s.currentDoc !== null);
  const currentDocPath = useDocumentStore((s) => s.currentDoc?.meta.path ?? "");
  const renameNode = useTreeStore((s) => s.renameNode);
  const deleteNode = useTreeStore((s) => s.deleteNode);
  const showToast = useUIStore((s) => s.showToast);
  const outlineOpen = useUIStore((s) => s.outlineOpen);
  const toggleOutline = useUIStore((s) => s.toggleOutline);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const fileName = useMemo(() => (currentDocPath ? fileNameFromPath(currentDocPath) : ""), [currentDocPath]);

  useEffect(() => {
    setDraftName(fileName);
    setEditingName(false);
  }, [fileName]);

  if (!hasCurrentDoc) return null;

  const commitRename = async () => {
    if (!currentPath) return;
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === fileName) {
      setDraftName(fileName);
      setEditingName(false);
      return;
    }
    try {
      await renameNode(currentPath, trimmed, "file");
      setEditingName(false);
    } catch {
      setDraftName(fileName);
      setEditingName(false);
      showToast("파일 이름을 변경하지 못했습니다.", "error");
    }
  };

  return (
    <div
      className="h-10 flex items-center gap-2 px-3 sm:px-4 border-b shrink-0"
      style={{
        background: "var(--color-surface-0)",
        borderColor: "var(--color-border)",
      }}
    >
      {editingName ? (
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commitRename();
            }
            if (event.key === "Escape") {
              setDraftName(fileName);
              setEditingName(false);
            }
          }}
          autoFocus
          className="h-7 min-w-0 max-w-[58vw] sm:max-w-[24rem] rounded-md px-2 text-sm outline-none"
          style={{
            background: "var(--color-surface-2)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-active)",
          }}
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => setEditingName(true)}
          className="min-w-0 max-w-[58vw] sm:max-w-[24rem] truncate rounded-md px-2 py-1 text-xs sm:text-sm font-medium text-left"
          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-body)" }}
          title="더블클릭해 파일 이름 변경"
        >
          {fileName}
        </button>
      )}

      <div className="flex-1 min-w-0" />

      {/* Outline toggle */}
      <button
        type="button"
        className="flex w-7 h-7 items-center justify-center rounded-md transition-colors"
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
        className="rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--color-surface-3)]"
        style={{ color: "var(--color-text-muted)" }}
        onClick={() => {
          if (!currentPath) return;
          void deleteNode(currentPath);
        }}
      >
        삭제
      </button>
    </div>
  );
}
