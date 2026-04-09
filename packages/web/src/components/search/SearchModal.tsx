import { useEffect, useRef, useCallback, useState } from "react";
import { useUIStore } from "../../stores/ui.store";
import { useDocumentStore } from "../../stores/document.store";
import { useTreeStore } from "../../stores/tree.store";
import { useSearch } from "../../hooks/useSearch";
import { useDialog } from "../../hooks/useDialog";

export function SearchModal() {
  const isOpen = useUIStore((s) => s.searchOpen);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const selectPath = useTreeStore((s) => s.selectPath);
  const { query, results, loading, error, search, reset } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const panelRef = useDialog<HTMLDivElement>({ open: isOpen, onClose: closeSearch, initialFocusRef: inputRef });

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      reset();
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen, reset]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Global shortcut: Cmd+P / Ctrl+P
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        useUIStore.getState().toggleSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      selectPath(path);
      openDocument(path);
      closeSearch();
    },
    [selectPath, openDocument, closeSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex].path);
          }
          break;
        case "Escape":
          e.preventDefault();
          closeSearch();
          break;
      }
    },
    [results, selectedIndex, handleSelect, closeSearch],
  );

  if (!isOpen) return null;

  return (
    <div className="ui-dialog-backdrop z-50 items-start px-2 sm:px-4 pt-4 sm:pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 animate-fade-in"
        onClick={closeSearch}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-modal-title"
        className="ui-dialog-panel relative w-full max-w-xl animate-scale-in"
        style={{ maxHeight: "min(78vh, 42rem)" }}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h2 id="search-modal-title" className="sr-only">
            문서 검색
          </h2>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
          >
            <circle cx="6.5" cy="6.5" r="5" />
            <line x1="10" y1="10" x2="14" y2="14" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            name="workspace-search"
            autoComplete="off"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="문서 검색…"
            className="flex-1 bg-transparent text-sm"
            style={{
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-ui)",
              caretColor: "var(--color-accent)",
            }}
            aria-label="문서 검색"
          />
          {loading && (
            <div
              className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
            />
          )}
          <kbd
            className="px-1.5 py-0.5 rounded text-[10px] shrink-0 hidden sm:inline-flex"
            style={{ background: "var(--color-surface-4)", color: "var(--color-text-muted)" }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto" style={{ maxHeight: "min(58vh, 28rem)" }}>
          {error && query.trim() && !loading && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            </div>
          )}

          {!error && results.length === 0 && query.trim() && !loading && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                검색 결과가 없습니다
              </p>
            </div>
          )}

          {results.length === 0 && !query.trim() && (
            <div className="px-4 py-8 text-center">
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                파일명이나 내용을 검색하세요
              </p>
            </div>
          )}

          {results.map((result, i) => (
            <button
              key={result.path}
              onClick={() => handleSelect(result.path)}
              className="w-full flex items-start gap-3 px-3 sm:px-4 py-3 text-left transition-colors"
              style={{
                background: i === selectedIndex ? "var(--color-surface-3)" : "transparent",
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {/* File icon */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                className="mt-0.5 shrink-0"
                style={{ color: "var(--color-accent)" }}
              >
                <path
                  d="M4 2H10L13 5V13C13 13.55 12.55 14 12 14H4C3.45 14 3 13.55 3 13V3C3 2.45 3.45 2 4 2Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                />
                <path d="M10 2V5H13" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>

              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {result.title}
                  </span>
                  <span
                    className="text-[11px] break-all sm:truncate shrink-0"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {result.path}
                  </span>
                </div>
                {result.snippet && (
                  <p
                    className="search-result-snippet text-xs mt-0.5"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {result.snippet}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Footer hints */}
        {results.length > 0 && (
          <div
            className="hidden sm:flex items-center gap-4 px-4 py-2 border-t text-[10px]"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-muted)",
            }}
          >
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded" style={{ background: "var(--color-surface-4)" }}>↑↓</kbd>
              이동
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded" style={{ background: "var(--color-surface-4)" }}>↵</kbd>
              열기
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
