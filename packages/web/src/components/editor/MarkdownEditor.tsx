import { startTransition, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { api } from "../../api/client";
import { useDocumentStore } from "../../stores/document.store";
import { useUIStore } from "../../stores/ui.store";
import { parseMarkdownToDoc, serializeDocToMarkdown, looksLikeMarkdown } from "../../lib/tiptap-markdown";
import { createEditorExtensions } from "./extensions";
import { replaceEditorContentPreservingSelection, promptForLink } from "./editor-utils";
import {
  slashCommands,
  getSlashQuery,
  filterSlashCommands,
  type SlashCommand,
} from "./slash-commands";
import {
  collectOutlineItems,
  collectOutlineItemsFromMarkdown,
  activeOutlineId,
  type OutlineItem,
} from "./outline";
import { SlashMenu } from "./components/SlashMenu";
import { SelectionToolbar } from "./components/SelectionToolbar";
import { TableToolbar } from "./components/TableToolbar";
import { OutlinePanel } from "./components/OutlinePanel";
import type { Editor as TiptapEditor } from "@tiptap/core";

// ── Sync helpers ──

function syncSlashState(
  editor: TiptapEditor,
  slashStateRef: React.MutableRefObject<ReturnType<typeof getSlashQuery>>,
  setSlashState: React.Dispatch<React.SetStateAction<ReturnType<typeof getSlashQuery>>>,
  setSlashMenuPosition: React.Dispatch<React.SetStateAction<{ top: number; left: number } | null>>,
  selectedSlashIndexRef: React.MutableRefObject<number>,
  setSelectedSlashIndex: React.Dispatch<React.SetStateAction<number>>,
) {
  const next = getSlashQuery(editor);
  slashStateRef.current = next;
  setSlashState(next);
  if (next) {
    const coords = editor.view.coordsAtPos(next.from);
    setSlashMenuPosition({ top: coords.bottom + 8, left: coords.left });
  } else {
    setSlashMenuPosition(null);
  }
  selectedSlashIndexRef.current = 0;
  setSelectedSlashIndex(0);
}

function syncSelectionToolbar(
  editor: TiptapEditor,
  setPosition: React.Dispatch<React.SetStateAction<{ top: number; left: number } | null>>,
) {
  if (window.matchMedia("(max-width: 767px)").matches) {
    setPosition(null);
    return;
  }

  const { state, view } = editor;
  const { selection } = state;
  if (selection.empty) {
    setPosition(null);
    return;
  }

  try {
    const from = view.coordsAtPos(selection.from);
    const to = view.coordsAtPos(selection.to, -1);
    const top = Math.min(from.top, to.top) - 12;
    const left = (Math.min(from.left, to.left) + Math.max(from.right, to.right)) / 2;
    setPosition({ top, left });
  } catch {
    setPosition(null);
  }
}

function syncTableTools(
  editor: TiptapEditor,
  setPosition: React.Dispatch<React.SetStateAction<{ top: number; left: number; right: number; bottom: number; centerX: number; centerY: number } | null>>,
) {
  if (window.matchMedia("(max-width: 767px)").matches || !editor.isActive("table")) {
    setPosition(null);
    return;
  }

  const anchor = editor.view.domAtPos(editor.state.selection.from).node;
  const element =
    anchor instanceof HTMLElement
      ? anchor
      : anchor.parentElement instanceof HTMLElement
        ? anchor.parentElement
        : null;
  const table = element?.closest("table");
  if (!(table instanceof HTMLElement)) {
    setPosition(null);
    return;
  }

  const bounds = table.getBoundingClientRect();
  setPosition({
    top: bounds.top,
    left: bounds.left,
    right: bounds.right,
    bottom: bounds.bottom,
    centerX: bounds.left + bounds.width / 2,
    centerY: bounds.top + bounds.height / 2,
  });
}

function scrollHeadingToTop(editor: TiptapEditor, target: HTMLElement) {
  const scrollContainer = editor.view.dom.closest('[data-editor-scroll-container="true"]');
  if (!(scrollContainer instanceof HTMLElement)) {
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - 8;
  scrollContainer.scrollTo({
    top: Math.max(nextTop, 0),
    behavior: "smooth",
  });
}

// ── Component ──

interface MarkdownEditorProps {
  outlinePortalHost?: HTMLElement | null;
}

export function MarkdownEditor({ outlinePortalHost = null }: MarkdownEditorProps) {
  const updateContent = useDocumentStore((s) => s.updateContent);
  const currentPath = useDocumentStore((s) => s.currentPath);
  const editorSyncVersion = useDocumentStore((s) => s.editorSyncVersion);
  const beginComposition = useDocumentStore((s) => s.beginComposition);
  const endComposition = useDocumentStore((s) => s.endComposition);
  const showToast = useUIStore((s) => s.showToast);
  const outlineOpen = useUIStore((s) => s.outlineOpen);

  const [slashState, setSlashState] = useState<ReturnType<typeof getSlashQuery>>(null);
  const [slashMenuPosition, setSlashMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [activeOutline, setActiveOutline] = useState<string | null>(null);
  const [selectionToolbarPosition, setSelectionToolbarPosition] = useState<{ top: number; left: number } | null>(null);
  const [tableToolsPosition, setTableToolsPosition] = useState<{ top: number; left: number; right: number; bottom: number; centerX: number; centerY: number } | null>(null);

  const slashStateRef = useRef<ReturnType<typeof getSlashQuery>>(null);
  const selectedSlashIndexRef = useRef(0);
  const outlineSignatureRef = useRef("");
  const activeOutlineRef = useRef<string | null>(null);
  const composingRef = useRef(false);
  const uiSyncFrameRef = useRef<number | null>(null);
  const outlineSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commands = slashCommands();
  const visibleCommands = slashState ? filterSlashCommands(commands, slashState.query) : [];

  const doSyncSlash = (e: TiptapEditor) =>
    syncSlashState(e, slashStateRef, setSlashState, setSlashMenuPosition, selectedSlashIndexRef, setSelectedSlashIndex);

  const doSyncOutline = (editorInstance: TiptapEditor) => {
    const items = collectOutlineItems(editorInstance);
    const currentDoc = useDocumentStore.getState().currentDoc;
    const nextItems = items.length > 0
      ? items
      : currentDoc
        ? collectOutlineItemsFromMarkdown(currentDoc.content)
        : [];
    const signature = nextItems.map((item) => `${item.id}:${item.label}`).join("|");
    if (outlineSignatureRef.current !== signature) {
      outlineSignatureRef.current = signature;
      setOutlineItems(nextItems);
    }
  };

  const doSyncOutlineSelection = (editorInstance: TiptapEditor) => {
    const nextActive = activeOutlineId(
      collectOutlineItems(editorInstance),
      editorInstance.state.selection.from,
    );
    if (activeOutlineRef.current !== nextActive) {
      activeOutlineRef.current = nextActive;
      setActiveOutline(nextActive);
    }
  };

  const syncAll = (e: TiptapEditor) => {
    doSyncSlash(e);
    doSyncOutline(e);
    doSyncOutlineSelection(e);
    syncSelectionToolbar(e, setSelectionToolbarPosition);
    syncTableTools(e, setTableToolsPosition);
  };

  const syncTransientUi = (editorInstance: TiptapEditor) => {
    doSyncSlash(editorInstance);
    doSyncOutlineSelection(editorInstance);
    syncSelectionToolbar(editorInstance, setSelectionToolbarPosition);
    syncTableTools(editorInstance, setTableToolsPosition);
  };

  const runSlashCommand = (command: SlashCommand) => {
    if (!editor || !slashStateRef.current) return;
    const range = slashStateRef.current;
    editor.chain().focus().deleteRange(range).run();
    command.run(editor);
    slashStateRef.current = null;
    setSlashState(null);
    setSlashMenuPosition(null);
    setSelectedSlashIndex(0);
  };

  const scheduleUiSync = (editorInstance: TiptapEditor) => {
    if (uiSyncFrameRef.current !== null) {
      cancelAnimationFrame(uiSyncFrameRef.current);
    }
    uiSyncFrameRef.current = requestAnimationFrame(() => {
      uiSyncFrameRef.current = null;
      startTransition(() => {
        syncTransientUi(editorInstance);
      });
    });
  };

  const scheduleOutlineSync = (editorInstance: TiptapEditor, delayMs = 160) => {
    if (outlineSyncTimeoutRef.current) {
      clearTimeout(outlineSyncTimeoutRef.current);
    }
    outlineSyncTimeoutRef.current = setTimeout(() => {
      outlineSyncTimeoutRef.current = null;
      startTransition(() => {
        doSyncOutline(editorInstance);
      });
    }, delayMs);
  };

  const flushEditorState = (editorInstance: TiptapEditor) => {
    updateContent(serializeDocToMarkdown(editorInstance.schema, editorInstance.state.doc));
    scheduleUiSync(editorInstance);
    scheduleOutlineSync(editorInstance);
  };

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: "",
    onCreate: ({ editor }) => syncAll(editor),
    onUpdate: ({ editor }) => {
      if (composingRef.current || editor.view.composing) {
        return;
      }
      flushEditorState(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      if (composingRef.current || editor.view.composing) {
        return;
      }
      scheduleUiSync(editor);
    },
    editorProps: {
      attributes: { class: "docs-editor-content" },
      // Export markdown when copying as plain text (Ctrl+C)
      clipboardTextSerializer: (slice, view) => {
        const schema = view.state.schema;
        const wrapper = schema.topNodeType.create(null, slice.content);
        return serializeDocToMarkdown(schema, wrapper);
      },
      // Parse markdown from plain-text paste
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData("text/html");
        const text = event.clipboardData?.getData("text/plain");

        // If the HTML has rich structural tags, let TipTap handle it natively.
        // Otherwise prefer our markdown parser even when HTML is present
        // (e.g. Discord/Slack/Outline wrap plain text in bare <p>/<div> tags).
        const hasRichHtml = html && /<(?:h[1-6]|[uo]l|li|blockquote|pre|table)\b/i.test(html);
        if (hasRichHtml) return false;

        if (!text || !looksLikeMarkdown(text)) return false;

        event.preventDefault();
        const parsed = parseMarkdownToDoc(view.state.schema, text);
        const slice = parsed.slice(0, parsed.content.size);
        const { state } = view;
        const tr = state.tr;

        // Delete current selection first
        if (!state.selection.empty) {
          tr.deleteSelection();
        }

        // Insert at block boundary so block-level nodes (headings, lists)
        // are placed correctly instead of being flattened into inline text.
        const $pos = tr.doc.resolve(tr.selection.from);
        if ($pos.depth === 0) {
          // Already at doc level
          tr.replaceRange(tr.selection.from, tr.selection.from, slice);
        } else if ($pos.parent.content.size === 0) {
          // Empty block — replace it entirely
          tr.replaceRange($pos.before($pos.depth), $pos.after($pos.depth), slice);
        } else {
          // Inside a non-empty block — insert after the current block
          const after = $pos.after($pos.depth);
          tr.replaceRange(after, after, slice);
        }

        view.dispatch(tr);
        return true;
      },
      handleDOMEvents: {
        compositionstart: () => {
          composingRef.current = true;
          beginComposition();
          return false;
        },
        compositionend: () => {
          queueMicrotask(() => {
            composingRef.current = false;
            if (editor) {
              flushEditorState(editor);
            }
            endComposition();
          });
          return false;
        },
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files?.length && currentPath) {
          event.preventDefault();
          void (async () => {
            try {
              const uploaded = await api.uploadAsset(currentPath, files[0]);
              const state = useDocumentStore.getState();
              const next = `${state.currentDoc?.content?.trimEnd() ?? ""}\n\n${uploaded.markdownLink}\n`;
              updateContent(next.trimStart());
            } catch (error) {
              console.error("Failed to upload asset:", error);
              showToast("파일 업로드에 실패했습니다. 형식과 용량을 확인해 주세요.", "error");
            }
          })();
          return true;
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
        if (editor && event.key === " " && editor.state.selection.empty) {
          const { $from } = editor.state.selection;
          const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
          const taskMatch = /^-\[( |x|X)?\]$/.exec(textBefore);
          if (taskMatch && $from.parent.type.name !== "codeBlock") {
            // Only convert when cursor is at the END of the pattern (right after ']').
            // If there is text after the cursor, the user is editing mid-line — don't convert.
            const textAfter = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, "\0", "\0");
            if (textAfter.length > 0) {
              return false;
            }
            event.preventDefault();
            const checked = taskMatch[1]?.toLowerCase() === "x";
            editor
              .chain()
              .focus()
              .deleteRange({ from: $from.start(), to: $from.pos })
              .toggleTaskList()
              .run();
            if (checked) {
              editor.chain().focus().updateAttributes("taskItem", { checked: true }).run();
            }
            return true;
          }
        }

        const nextSlashState = editor ? getSlashQuery(editor) : null;
        slashStateRef.current = nextSlashState;
        if (!nextSlashState) return false;

        const nextVisible = filterSlashCommands(commands, nextSlashState.query);
        if (nextVisible.length === 0) return false;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedSlashIndex((current) => {
            const nextIndex = Math.min(current + 1, nextVisible.length - 1);
            selectedSlashIndexRef.current = nextIndex;
            return nextIndex;
          });
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedSlashIndex((current) => {
            const nextIndex = Math.max(current - 1, 0);
            selectedSlashIndexRef.current = nextIndex;
            return nextIndex;
          });
          return true;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          runSlashCommand(nextVisible[Math.min(selectedSlashIndexRef.current, nextVisible.length - 1)]);
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          editor?.chain().focus().deleteRange(nextSlashState).run();
          slashStateRef.current = null;
          selectedSlashIndexRef.current = 0;
          setSlashState(null);
          setSlashMenuPosition(null);
          setSelectedSlashIndex(0);
          return true;
        }

        return false;
      },
    },
  });

  // Sync editor content when doc changes externally
  useEffect(() => {
    const latestDoc = useDocumentStore.getState().currentDoc;
    if (editor && latestDoc) {
      try {
        const currentMarkdown = serializeDocToMarkdown(editor.schema, editor.state.doc);
        if (currentMarkdown === latestDoc.content) {
          syncAll(editor);
          return;
        }
        const nextDoc = parseMarkdownToDoc(editor.schema, latestDoc.content);
        replaceEditorContentPreservingSelection(editor, nextDoc.toJSON() as Record<string, unknown>);
        syncAll(editor);
      } catch {
        showToast("지원되지 않는 구문이 있어 원문 편집기로 전환해야 합니다.", "error");
      }
    }
  }, [editor, editorSyncVersion, showToast]);

  useEffect(() => {
    return () => {
      if (uiSyncFrameRef.current !== null) {
        cancelAnimationFrame(uiSyncFrameRef.current);
      }
      if (outlineSyncTimeoutRef.current) {
        clearTimeout(outlineSyncTimeoutRef.current);
      }
    };
  }, []);

  // Scroll-based outline tracking
  useEffect(() => {
    if (!editor) return;

    const headings = Array.from(editor.view.dom.querySelectorAll<HTMLElement>("h2, h3, h4"));
    headings.forEach((element, index) => {
      const item = outlineItems[index];
      if (item) {
        element.dataset.outlineId = item.id;
      } else {
        delete element.dataset.outlineId;
      }
    });

    const syncFromViewport = () => {
      if (outlineItems.length === 0) {
        if (activeOutlineRef.current !== null) {
          activeOutlineRef.current = null;
          setActiveOutline(null);
        }
        return;
      }

      const scrollContainer = editor.view.dom.closest('[data-editor-scroll-container="true"]');
      if (!(scrollContainer instanceof HTMLElement)) {
        const nextActive = activeOutlineId(
          outlineItems.filter((item) => item.pos !== null) as OutlineItem[],
          editor.state.selection.from,
        );
        if (activeOutlineRef.current !== nextActive) {
          activeOutlineRef.current = nextActive;
          setActiveOutline(nextActive);
        }
        return;
      }

      const threshold = scrollContainer.getBoundingClientRect().top + 104;
      let nextActive = outlineItems[0]?.id ?? null;
      const headingNodes = Array.from(editor.view.dom.querySelectorAll<HTMLElement>("[data-outline-id]"));
      for (const heading of headingNodes) {
        const headingId = heading.dataset.outlineId;
        if (!headingId) continue;
        if (heading.getBoundingClientRect().top <= threshold) {
          nextActive = headingId;
          continue;
        }
        break;
      }

      if (activeOutlineRef.current !== nextActive) {
        activeOutlineRef.current = nextActive;
        setActiveOutline(nextActive);
      }
    };

    const scrollContainer = editor.view.dom.closest('[data-editor-scroll-container="true"]');
    syncFromViewport();
    if (!(scrollContainer instanceof HTMLElement)) return;

    scrollContainer.addEventListener("scroll", syncFromViewport, { passive: true });
    window.addEventListener("resize", syncFromViewport);
    return () => {
      scrollContainer.removeEventListener("scroll", syncFromViewport);
      window.removeEventListener("resize", syncFromViewport);
    };
  }, [editor, outlineItems]);

  if (!editor) return null;

  const formatActions = [
    { id: "paragraph", label: "P", title: "본문", run: () => editor.chain().focus().clearNodes().run(), active: () => editor.isActive("paragraph") },
    { id: "bold", label: "B", title: "굵게", run: () => editor.chain().focus().toggleBold().run(), active: () => editor.isActive("bold") },
    { id: "italic", label: "I", title: "기울임", run: () => editor.chain().focus().toggleItalic().run(), active: () => editor.isActive("italic") },
    { id: "strike", label: "S", title: "취소선", run: () => editor.chain().focus().toggleStrike().run(), active: () => editor.isActive("strike") },
    { id: "code", label: "</>", title: "인라인 코드", run: () => editor.chain().focus().toggleCode().run(), active: () => editor.isActive("code") },
    { id: "highlight", label: "H", title: "하이라이트", run: () => editor.chain().focus().toggleHighlight().run(), active: () => editor.isActive("highlight") },
    { id: "h2", label: "H2", title: "제목 2", run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor.isActive("heading", { level: 2 }) },
    { id: "h3", label: "H3", title: "제목 3", run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: () => editor.isActive("heading", { level: 3 }) },
    { id: "h4", label: "H4", title: "제목 4", run: () => editor.chain().focus().toggleHeading({ level: 4 }).run(), active: () => editor.isActive("heading", { level: 4 }) },
    { id: "bullet", label: "•", title: "불릿 목록", run: () => editor.chain().focus().toggleBulletList().run(), active: () => editor.isActive("bulletList") },
    { id: "ordered", label: "1.", title: "번호 목록", run: () => editor.chain().focus().toggleOrderedList().run(), active: () => editor.isActive("orderedList") },
    { id: "task", label: "[]", title: "체크리스트", run: () => editor.chain().focus().toggleTaskList().run(), active: () => editor.isActive("taskList") },
    { id: "quote", label: "\"", title: "인용문", run: () => editor.chain().focus().toggleBlockquote().run(), active: () => editor.isActive("blockquote") },
    { id: "link", label: "Link", title: "링크", run: () => promptForLink(editor), active: () => editor.isActive("link") },
    { id: "table", label: "Tbl", title: "표 삽입", run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: () => editor.isActive("table") },
    { id: "divider", label: "---", title: "구분선", run: () => editor.chain().focus().setHorizontalRule().run(), active: () => false },
  ];
  const desktopSelectionActions = formatActions.filter((a) => ["bold", "italic", "strike", "code", "highlight", "link", "bullet", "task"].includes(a.id));

  const focusOutlineItem = (item: OutlineItem) => {
    const target = editor.view.dom.querySelector<HTMLElement>(`[data-outline-id="${item.id}"]`)
      ?? Array.from(editor.view.dom.querySelectorAll<HTMLElement>("h2, h3, h4"))
        .find((node) => node.textContent?.trim() === item.label);

    if (item.pos !== null) {
      const selection = TextSelection.create(editor.state.doc, item.pos);
      editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
      editor.commands.focus(item.pos);
      doSyncOutline(editor);
      if (target instanceof HTMLElement) {
        requestAnimationFrame(() => {
          scrollHeadingToTop(editor, target);
        });
      }
      return;
    }

    if (target instanceof HTMLElement) {
      scrollHeadingToTop(editor, target);
      target.focus?.();
    }
  };

  return (
    <div className="docs-editor">
      <div className="docs-editor-shell" data-outline-open={outlineOpen ? "true" : "false"}>
        <div
          className="docs-editor-main"
          onClick={(e) => {
            if (e.target === e.currentTarget && editor) {
              editor.commands.focus("end");
            }
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {outlinePortalHost
        ? createPortal(
            <OutlinePanel
              items={outlineItems}
              activeId={activeOutline}
              isOpen={outlineOpen}
              onItemClick={focusOutlineItem}
            />,
            outlinePortalHost,
          )
        : null}

      {tableToolsPosition ? (
        <TableToolbar editor={editor} position={tableToolsPosition} />
      ) : null}

      {selectionToolbarPosition ? (
        <SelectionToolbar actions={desktopSelectionActions} position={selectionToolbarPosition} />
      ) : null}

      {visibleCommands.length > 0 && slashMenuPosition ? (
        <SlashMenu
          commands={visibleCommands}
          selectedIndex={selectedSlashIndex}
          position={slashMenuPosition}
          onSelect={runSlashCommand}
        />
      ) : null}
    </div>
  );
}
