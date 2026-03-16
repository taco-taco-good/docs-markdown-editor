import { useState } from "react";
import { useDocumentStore } from "../../stores/document.store";
import { useUIStore } from "../../stores/ui.store";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { RawEditor } from "../editor/RawEditor";
import { EditorToolbar } from "../editor/EditorToolbar";

export function EditorLayout() {
  const currentDoc = useDocumentStore((s) => s.currentDoc);
  const outlineOpen = useUIStore((s) => s.outlineOpen);
  const [outlinePortalHost, setOutlinePortalHost] = useState<HTMLDivElement | null>(null);
  if (!currentDoc) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <EditorToolbar />
      <div className="flex-1 flex min-h-0">
        <div
          className="flex-1 overflow-y-auto"
          data-editor-scroll-container="true"
          style={{ background: "var(--color-surface-0)" }}
        >
          {currentDoc.supportedInWysiwyg ? (
            <MarkdownEditor outlinePortalHost={outlinePortalHost} />
          ) : (
            <RawEditor />
          )}
        </div>
        <div
          ref={setOutlinePortalHost}
          className="docs-editor-outline-dock"
          data-open={currentDoc.supportedInWysiwyg && outlineOpen ? "true" : "false"}
          aria-hidden={currentDoc.supportedInWysiwyg && outlineOpen ? "false" : "true"}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex-1 flex items-center justify-center"
      style={{ background: "var(--color-surface-0)" }}
    >
      <div className="text-center animate-fade-in">
        {/* Decorative quill icon */}
        <div className="mb-6 flex justify-center">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ color: "var(--color-surface-4)" }}>
            <path
              d="M36 6C36 6 30 12 24 20C18 28 14 36 12 42L14 42C16 38 20 32 26 26C32 20 38 14 40 10C42 6 36 6 36 6Z"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M12 42L14 42L16 36"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p
          className="text-sm mb-1"
          style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-body)", fontStyle: "italic" }}
        >
          사이드바에서 문서를 선택하세요
        </p>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: "var(--color-surface-3)" }}>⌘P</kbd>
          {" "}로 빠른 검색
        </p>
      </div>
    </div>
  );
}
