import type { Editor as TiptapEditor } from "@tiptap/core";

interface TableToolsPosition {
  top: number;
  left: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

interface TableToolbarProps {
  editor: TiptapEditor;
  position: TableToolsPosition;
}

export function TableToolbar({ editor, position }: TableToolbarProps) {
  return (
    <>
      {/* Compact icon toolbar above table */}
      <div
        className="docs-table-toolbar"
        style={{
          position: "fixed",
          top: `${position.top - 6}px`,
          left: `${position.centerX}px`,
          transform: "translate(-50%, -100%)",
        }}
      >
        <div className="docs-table-toolbar__group">
          <button type="button" className="docs-table-toolbar__btn" title="열 왼쪽 추가" disabled={!editor.can().addColumnBefore()} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addColumnBefore().run(); }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="7" y="2.5" width="7" height="11" rx="1.5" /><path d="M3.5 6v4" /><path d="M1.5 8h4" /></svg>
          </button>
          <button type="button" className="docs-table-toolbar__btn" title="열 오른쪽 추가" disabled={!editor.can().addColumnAfter()} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addColumnAfter().run(); }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="2" y="2.5" width="7" height="11" rx="1.5" /><path d="M12.5 6v4" /><path d="M10.5 8h4" /></svg>
          </button>
          <button type="button" className="docs-table-toolbar__btn docs-table-toolbar__btn--danger" title="열 삭제" disabled={!editor.can().deleteColumn()} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteColumn().run(); }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
          </button>
        </div>
        <span className="docs-table-toolbar__sep" />
        <div className="docs-table-toolbar__group">
          <button type="button" className="docs-table-toolbar__btn" title="행 위 추가" disabled={!editor.can().addRowBefore()} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addRowBefore().run(); }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="2.5" y="7" width="11" height="7" rx="1.5" /><path d="M6 3.5h4" /><path d="M8 1.5v4" /></svg>
          </button>
          <button type="button" className="docs-table-toolbar__btn" title="행 아래 추가" disabled={!editor.can().addRowAfter()} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addRowAfter().run(); }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="2.5" y="2" width="11" height="7" rx="1.5" /><path d="M6 12.5h4" /><path d="M8 10.5v4" /></svg>
          </button>
          <button type="button" className="docs-table-toolbar__btn docs-table-toolbar__btn--danger" title="행 삭제" disabled={!editor.can().deleteRow()} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteRow().run(); }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
          </button>
        </div>
        <span className="docs-table-toolbar__sep" />
        <button type="button" className="docs-table-toolbar__btn docs-table-toolbar__btn--danger" title="표 삭제" disabled={!editor.can().deleteTable()} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteTable().run(); }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 5h10M5.5 5V4a1 1 0 011-1h3a1 1 0 011 1v1M12 5v7a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 014 12V5" /></svg>
        </button>
      </div>
      {/* + button at right edge to add column */}
      <button
        type="button"
        className="docs-table-add"
        title="열 추가"
        style={{
          position: "fixed",
          top: `${position.centerY}px`,
          left: `${position.right + 6}px`,
          transform: "translateY(-50%)",
        }}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addColumnAfter().run(); }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
      </button>
      {/* + button at bottom edge to add row */}
      <button
        type="button"
        className="docs-table-add"
        title="행 추가"
        style={{
          position: "fixed",
          top: `${position.bottom + 6}px`,
          left: `${position.centerX}px`,
          transform: "translateX(-50%)",
        }}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addRowAfter().run(); }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
      </button>
    </>
  );
}
