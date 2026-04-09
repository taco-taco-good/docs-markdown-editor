import { useDocumentStore } from "../../stores/document.store";
import { useTreeStore } from "../../stores/tree.store";
import { useUIStore } from "../../stores/ui.store";

export function EditorToolbar() {
  const currentPath = useDocumentStore((s) => s.currentPath);
  const hasCurrentDoc = useDocumentStore((s) => s.currentDoc !== null);
  const outlineOpen = useUIStore((s) => s.outlineOpen);
  const toggleOutline = useUIStore((s) => s.toggleOutline);
  const deleteDocument = useTreeStore((s) => s.deleteNode);

  if (!hasCurrentDoc) return null;

  return (
    <div
      className="h-10 flex items-center gap-2 px-3 sm:px-4 border-b shrink-0"
      style={{
        background: "var(--color-surface-0)",
        borderColor: "var(--color-border)",
      }}
    >
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
          void deleteDocument(currentPath);
        }}
      >
        삭제
      </button>
    </div>
  );
}
