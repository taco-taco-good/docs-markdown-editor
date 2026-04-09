import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { EditorState, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { api } from "../../api/client";
import { useDocumentStore } from "../../stores/document.store";
import { useUIStore } from "../../stores/ui.store";
import { OutlinePanel } from "./components/OutlinePanel";
import { findHeadingPosition, resolveEditorReferenceTarget } from "./codemirror/navigation";
import { activeOutlineId, collectOutlineItemsFromMarkdown, type OutlineItem } from "./outline";
import { createEditorExtensions } from "./codemirror/extensions";
import {
  insertHorizontalRule,
  promptForLink,
  setHeading,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleInlineCode,
  toggleItalic,
  toggleOrderedList,
  toggleStrike,
  toggleTaskList,
  insertTextAtSelection,
} from "./codemirror/commands";
import { selectMarkdownTableCell } from "./codemirror/table-editing";

interface ToolbarAction {
  id: string;
  label: string;
  title: string;
  run: (view: EditorView) => boolean;
}

interface FloatingToolbarState {
  visible: boolean;
  left: number;
  top: number;
  placement: "above" | "below";
}

interface SelectionState {
  from: number;
  to: number;
  head: number;
  empty: boolean;
}

function toEditorSelection(snapshot: { from: number; to: number; head: number }, docLength: number): EditorSelection {
  const from = Math.max(0, Math.min(snapshot.from, docLength));
  const to = Math.max(0, Math.min(snapshot.to, docLength));
  const head = Math.max(0, Math.min(snapshot.head, docLength));
  const anchor = head === from ? to : from;
  return EditorSelection.single(anchor, head);
}

function computeMinimalChange(source: string, next: string): { from: number; to: number; insert: string } {
  if (source === next) {
    return { from: 0, to: 0, insert: "" };
  }

  let start = 0;
  const limit = Math.min(source.length, next.length);
  while (start < limit && source[start] === next[start]) {
    start += 1;
  }

  let sourceEnd = source.length;
  let nextEnd = next.length;
  while (
    sourceEnd > start &&
    nextEnd > start &&
    source[sourceEnd - 1] === next[nextEnd - 1]
  ) {
    sourceEnd -= 1;
    nextEnd -= 1;
  }

  return {
    from: start,
    to: sourceEnd,
    insert: next.slice(start, nextEnd),
  };
}

function estimateRenderedLineHeight(line: string, baseLineHeight: number): number {
  const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (/^#\s+/.test(normalized)) return baseLineHeight * 2.7;
  if (/^##\s+/.test(normalized)) return baseLineHeight * 2.15;
  if (/^###\s+/.test(normalized)) return baseLineHeight * 1.75;
  if (/^####\s+/.test(normalized)) return baseLineHeight * 1.45;
  return baseLineHeight;
}

function estimateScrollTopForPosition(
  raw: string,
  pos: number,
  baseLineHeight: number,
  viewportHeight: number,
  align: "start" | "center",
): number {
  const clamped = Math.max(0, Math.min(pos, raw.length));
  const lineNumber = raw.slice(0, clamped).split("\n").length;
  const lines = raw.split("\n");
  let top = 0;

  for (let index = 0; index < lineNumber - 1 && index < lines.length; index += 1) {
    top += estimateRenderedLineHeight(lines[index] ?? "", baseLineHeight);
  }

  const currentLineHeight = estimateRenderedLineHeight(lines[lineNumber - 1] ?? "", baseLineHeight);
  if (align === "center") {
    return Math.max(0, top - (viewportHeight / 2) + (currentLineHeight / 2));
  }

  return Math.max(0, top - 96);
}

function findLineElementAtPos(view: EditorView, pos: number): HTMLElement | null {
  const clamped = Math.max(0, Math.min(pos, view.state.doc.length));
  try {
    const domAtPos = view.domAtPos(clamped);
    if (domAtPos.node instanceof HTMLElement) {
      return domAtPos.node.closest(".cm-line");
    }
    return domAtPos.node.parentElement?.closest(".cm-line") ?? null;
  } catch {
    return null;
  }
}

function getFloatingToolbarState(
  view: EditorView,
  container: HTMLElement,
  selection: SelectionState,
): FloatingToolbarState {
  const docLength = view.state.doc.length;
  const from = Math.max(0, Math.min(selection.from, docLength));
  const to = Math.max(0, Math.min(selection.to, docLength));

  if (selection.empty || from === to || selection.from > docLength || selection.to > docLength) {
    return { visible: false, left: 0, top: 0, placement: "above" };
  }
  const containerRect = container.getBoundingClientRect();
  const domSelection = window.getSelection();
  if (domSelection && domSelection.rangeCount > 0) {
    const range = domSelection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      const gap = 8;
      const estimatedToolbarHeight = 42;
      const aboveTop = rect.top - containerRect.top - gap;
      const placeBelow = aboveTop < estimatedToolbarHeight;
      return {
        visible: true,
        left: rect.left + (rect.width / 2) - containerRect.left,
        top: placeBelow ? rect.bottom - containerRect.top + gap : aboveTop,
        placement: placeBelow ? "below" : "above",
      };
    }
  }

  let start;
  let end;
  try {
    start = view.coordsAtPos(from);
    end = view.coordsAtPos(to);
  } catch {
    return { visible: false, left: 0, top: 0, placement: "above" };
  }
  if (!start || !end) {
    return { visible: false, left: 0, top: 0, placement: "above" };
  }

  return {
    visible: true,
    left: ((start.left + end.right) / 2) - containerRect.left,
    top: Math.min(start.top, end.top) - containerRect.top - 8,
    placement: "above",
  };
}

export function MarkdownSourceEditor() {
  const currentDoc = useDocumentStore((s) => s.currentDoc);
  const currentPath = useDocumentStore((s) => s.currentPath);
  const updateRaw = useDocumentStore((s) => s.updateRaw);
  const beginComposition = useDocumentStore((s) => s.beginComposition);
  const endComposition = useDocumentStore((s) => s.endComposition);
  const currentSelection = useDocumentStore((s) => s.currentSelection);
  const currentScrollTop = useDocumentStore((s) => s.currentScrollTop);
  const updateEditorViewport = useDocumentStore((s) => s.updateEditorViewport);
  const outlineOpen = useUIStore((s) => s.outlineOpen);
  const showToast = useUIStore((s) => s.showToast);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const pendingNavigationRef = useRef<{ path: string; anchor?: string } | null>(null);
  const latestRefs = useRef({
    currentPath,
    updateRaw,
    beginComposition,
    endComposition,
    updateEditorViewport,
    showToast,
  });
  const [selectionPos, setSelectionPos] = useState(0);
  const [selectionState, setSelectionState] = useState<SelectionState>({
    from: 0,
    to: 0,
    head: 0,
    empty: true,
  });
  const [toolbar, setToolbar] = useState<FloatingToolbarState>({
    visible: false,
    left: 0,
    top: 0,
    placement: "above",
  });

  const outlineItems = useMemo(
    () => collectOutlineItemsFromMarkdown(currentDoc?.raw ?? ""),
    [currentDoc?.raw],
  );
  const activeOutline = useMemo(
    () => activeOutlineId(outlineItems, selectionPos),
    [outlineItems, selectionPos],
  );

  const toolbarActions = useMemo<ToolbarAction[]>(() => [
    { id: "bold", label: "B", title: "굵게", run: toggleBold },
    { id: "italic", label: "I", title: "기울임", run: toggleItalic },
    { id: "strike", label: "S", title: "취소선", run: toggleStrike },
    { id: "code", label: "</>", title: "인라인 코드", run: toggleInlineCode },
    { id: "h1", label: "H1", title: "제목 1", run: (view) => setHeading(view, 1) },
    { id: "h2", label: "H2", title: "제목 2", run: (view) => setHeading(view, 2) },
    { id: "h3", label: "H3", title: "제목 3", run: (view) => setHeading(view, 3) },
    { id: "bullet", label: "•", title: "불릿 목록", run: toggleBulletList },
    { id: "ordered", label: "1.", title: "번호 목록", run: toggleOrderedList },
    { id: "task", label: "[]", title: "체크리스트", run: toggleTaskList },
    { id: "quote", label: "\"", title: "인용문", run: toggleBlockquote },
    { id: "codeblock", label: "{ }", title: "코드 블록", run: toggleCodeBlock },
    { id: "link", label: "Link", title: "링크", run: promptForLink },
    { id: "divider", label: "---", title: "구분선", run: insertHorizontalRule },
  ], []);

  const updateFloatingToolbar = () => {
    const view = editorViewRef.current;
    const container = scrollContainerRef.current;
    if (!view || !container) {
      setToolbar({ visible: false, left: 0, top: 0, placement: "above" });
      return;
    }
    setToolbar(getFloatingToolbarState(view, container, selectionState));
  };

  const scrollPositionIntoView = (view: EditorView, pos: number, align: "start" | "center") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const lineElement = findLineElementAtPos(view, pos);
    if (lineElement) {
      const containerRect = container.getBoundingClientRect();
      const lineRect = lineElement.getBoundingClientRect();
      const currentTop = container.scrollTop;
      const targetTop = align === "center"
        ? currentTop + (lineRect.top - containerRect.top) - (container.clientHeight / 2) + (lineRect.height / 2)
        : currentTop + (lineRect.top - containerRect.top) - 72;
      const nextTop = Math.max(0, targetTop);
      container.scrollTop = nextTop;
      latestRefs.current.updateEditorViewport({ scrollTop: nextTop });
      return;
    }

    const sampleLine = hostRef.current?.querySelector(".cm-line");
    const sampleLineHeight = sampleLine
      ? Number.parseFloat(window.getComputedStyle(sampleLine).lineHeight)
      : NaN;
    const lineHeight = Number.isFinite(sampleLineHeight) && sampleLineHeight > 0
      ? sampleLineHeight
      : 28;
    const targetTop = estimateScrollTopForPosition(
      view.state.doc.toString(),
      pos,
      lineHeight,
      container.clientHeight,
      align,
    );

    container.scrollTop = targetTop;
    latestRefs.current.updateEditorViewport({ scrollTop: targetTop });
  };

  const focusEditorPosition = (pos: number) => {
    const view = editorViewRef.current;
    if (!view) return;
    const clamped = Math.max(0, Math.min(pos, view.state.doc.length));
    view.dispatch({
      selection: EditorSelection.cursor(clamped),
    });
    requestAnimationFrame(() => scrollPositionIntoView(view, clamped, "center"));
    view.focus();
  };

  const navigateToAnchor = (anchor: string) => {
    const raw = currentDoc?.raw ?? editorViewRef.current?.state.doc.toString() ?? "";
    const pos = findHeadingPosition(raw, anchor);
    if (pos !== null) {
      focusEditorPosition(pos);
      return;
    }
    focusEditorPosition(0);
  };

  const handleLinkActivate = (url: string) => {
    const path = latestRefs.current.currentPath;
    if (!path) return;

    const target = resolveEditorReferenceTarget(path, url);
    if (!target) return;

    if (target.type === "external") {
      window.open(target.url, "_blank", "noopener,noreferrer");
      return;
    }

    if (target.path === path) {
      if (target.anchor) {
        navigateToAnchor(target.anchor);
      }
      return;
    }

    pendingNavigationRef.current = { path: target.path, anchor: target.anchor };
    void useDocumentStore.getState().openDocument(target.path);
  };

  useEffect(() => {
    latestRefs.current = {
      currentPath,
      updateRaw,
      beginComposition,
      endComposition,
      updateEditorViewport,
      showToast,
    };
  }, [beginComposition, currentPath, endComposition, showToast, updateEditorViewport, updateRaw]);

  useEffect(() => {
    if (!hostRef.current || editorViewRef.current || !currentDoc) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: currentDoc.raw,
        selection: currentSelection
          ? toEditorSelection(currentSelection, currentDoc.raw.length)
          : undefined,
        extensions: createEditorExtensions({
          currentPath: currentDoc.meta.path,
          onDocChange: (raw) => {
            startTransition(() => latestRefs.current.updateRaw(raw));
          },
          onSelectionChange: (selection) => {
            startTransition(() => {
              setSelectionPos(selection.head);
              setSelectionState(selection);
              latestRefs.current.updateEditorViewport({
                selection: {
                  from: selection.from,
                  to: selection.to,
                  head: selection.head,
                },
              });
            });
          },
          onCompositionStart: () => latestRefs.current.beginComposition(),
          onCompositionEnd: () => latestRefs.current.endComposition(),
          onDropFiles: (files) => {
            const path = latestRefs.current.currentPath;
            if (!path) return;
            void (async () => {
              try {
                const uploaded = await api.uploadAsset(path, files[0]);
                const editorView = editorViewRef.current;
                if (!editorView) return;
                insertTextAtSelection(editorView, uploaded.markdownLink);
              } catch (error) {
                console.error("Failed to upload asset:", error);
                latestRefs.current.showToast("파일 업로드에 실패했습니다. 형식과 용량을 확인해 주세요.", "error");
              }
            })();
          },
          onLinkActivate: handleLinkActivate,
          onActivateTable: (pos) => {
            focusEditorPosition(pos);
            requestAnimationFrame(() => {
              const view = editorViewRef.current;
              if (!view) return;
              selectMarkdownTableCell(view, pos);
            });
          },
        }),
      }),
      parent: hostRef.current,
    });

    editorViewRef.current = view;
    setSelectionPos(view.state.selection.main.head);
    setSelectionState({
      from: view.state.selection.main.from,
      to: view.state.selection.main.to,
      head: view.state.selection.main.head,
      empty: view.state.selection.main.empty,
    });
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = currentScrollTop;
    }

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [currentDoc?.meta.path]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view || !currentDoc || typeof currentDoc.raw !== "string") return;
    const currentRaw = view.state.doc.toString();
    if (currentRaw === currentDoc.raw) return;

    const nextSelection = Math.min(view.state.selection.main.head, currentDoc.raw.length);
    view.dispatch({
      changes: computeMinimalChange(currentRaw, currentDoc.raw),
      selection: EditorSelection.cursor(nextSelection),
    });
  }, [currentDoc?.raw]);

  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (!pending || !currentDoc || currentDoc.meta.path !== pending.path) return;
    if (pending.anchor) {
      navigateToAnchor(pending.anchor);
    } else {
      focusEditorPosition(0);
    }
    pendingNavigationRef.current = null;
  }, [currentDoc?.meta.path, currentDoc?.raw]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view || !currentSelection) return;
    const from = Math.max(0, Math.min(currentSelection.from, view.state.doc.length));
    const to = Math.max(0, Math.min(currentSelection.to, view.state.doc.length));
    const head = Math.max(0, Math.min(currentSelection.head, view.state.doc.length));
    const main = view.state.selection.main;
    if (main.from === from && main.to === to && main.head === head) return;
    view.dispatch({
      selection: toEditorSelection({ from, to, head }, view.state.doc.length),
    });
  }, [currentDoc?.meta.path, currentSelection?.from, currentSelection?.to, currentSelection?.head]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = currentScrollTop;
  }, [currentDoc?.meta.path, currentScrollTop]);

  useEffect(() => {
    updateFloatingToolbar();
  }, [selectionState, currentDoc?.raw]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleReposition = () => updateFloatingToolbar();
    const handleScrollState = () => {
      latestRefs.current.updateEditorViewport({ scrollTop: container.scrollTop });
    };
    container.addEventListener("scroll", handleReposition, { passive: true });
    container.addEventListener("scroll", handleScrollState, { passive: true });
    window.addEventListener("resize", handleReposition);
    return () => {
      container.removeEventListener("scroll", handleReposition);
      container.removeEventListener("scroll", handleScrollState);
      window.removeEventListener("resize", handleReposition);
    };
  }, [currentDoc?.meta.path, selectionState]);

  if (!currentDoc) return null;

  const onOutlineClick = (item: OutlineItem) => {
    const view = editorViewRef.current;
    if (!view || item.pos === null) return;
    const clamped = Math.max(0, Math.min(item.pos, view.state.doc.length));
    view.dispatch({
      selection: EditorSelection.cursor(clamped),
    });
    requestAnimationFrame(() => scrollPositionIntoView(view, clamped, "start"));
    view.focus();
  };

  return (
    <div className="docs-editor h-full">
      <div className="docs-editor-shell h-full flex">
        <div className="docs-editor-main flex-1 min-w-0 min-h-0">
          <div
            ref={scrollContainerRef}
            className="docs-editor-codemirror"
            onMouseDown={() => editorViewRef.current?.focus()}
          >
            {toolbar.visible ? (
              <div
                className="docs-floating-toolbar"
                data-placement={toolbar.placement}
                style={{
                  left: `${toolbar.left}px`,
                  top: `${toolbar.top}px`,
                  transform: toolbar.placement === "below"
                    ? "translate(-50%, 0)"
                    : "translate(-50%, -100%)",
                }}
              >
                <div className="docs-format-toolbar__panel docs-format-toolbar__panel--floating">
                  <div className="docs-action-group__items">
                    {toolbarActions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="docs-format-toolbar__button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          const view = editorViewRef.current;
                          if (!view) return;
                          action.run(view);
                          queueMicrotask(() => updateFloatingToolbar());
                        }}
                        title={action.title}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            <div ref={hostRef} className="docs-editor-codemirror__host" />
          </div>
        </div>
        <div
          className="docs-editor-outline-dock"
          data-open={outlineOpen ? "true" : "false"}
          aria-hidden={outlineOpen ? "false" : "true"}
        >
          <OutlinePanel
            items={outlineItems}
            activeId={activeOutline}
            isOpen={outlineOpen}
            onItemClick={onOutlineClick}
          />
        </div>
      </div>
    </div>
  );
}
