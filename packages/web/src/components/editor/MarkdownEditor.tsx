import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { api } from "../../api/client";
import { useDocumentStore } from "../../stores/document.store";
import { useUIStore } from "../../stores/ui.store";
import { parseMarkdownToDoc, serializeDocToMarkdown } from "../../lib/tiptap-markdown";
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

// ── Component ──

interface MarkdownEditorProps {
  outlinePortalHost?: HTMLElement | null;
}

export function MarkdownEditor({ outlinePortalHost = null }: MarkdownEditorProps) {
  const currentDoc = useDocumentStore((s) => s.currentDoc);
  const updateContent = useDocumentStore((s) => s.updateContent);
  const currentPath = useDocumentStore((s) => s.currentPath);
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

  const commands = slashCommands();
  const visibleCommands = slashState ? filterSlashCommands(commands, slashState.query) : [];

  const doSyncSlash = (e: TiptapEditor) =>
    syncSlashState(e, slashStateRef, setSlashState, setSlashMenuPosition, selectedSlashIndexRef, setSelectedSlashIndex);

  const doSyncOutline = (editorInstance: TiptapEditor) => {
    const items = collectOutlineItems(editorInstance);
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

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: "",
    onCreate: ({ editor }) => syncAll(editor),
    onUpdate: ({ editor }) => {
      updateContent(serializeDocToMarkdown(editor.schema, editor.state.doc));
      syncAll(editor);
    },
    onSelectionUpdate: ({ editor }) => syncAll(editor),
    editorProps: {
      attributes: { class: "docs-editor-content" },
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
    if (editor && currentDoc) {
      try {
        const nextDoc = parseMarkdownToDoc(editor.schema, currentDoc.content);
        const currentSerialized = serializeDocToMarkdown(editor.schema, editor.state.doc);
        if (currentSerialized !== currentDoc.content) {
          replaceEditorContentPreservingSelection(editor, nextDoc.toJSON() as Record<string, unknown>);
        }
        syncAll(editor);
      } catch {
        showToast("지원되지 않는 구문이 있어 원문 편집기로 전환해야 합니다.", "error");
      }
    }
  }, [editor, currentDoc?.content, currentPath, showToast]);

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
  const desktopSelectionActions = formatActions.filter((a) => ["bold", "italic", "code", "link", "bullet", "task"].includes(a.id));

  const focusOutlineItem = (item: OutlineItem) => {
    if (item.pos !== null) {
      const selection = TextSelection.create(editor.state.doc, item.pos);
      editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
      editor.commands.focus(item.pos);
      doSyncOutline(editor);
      return;
    }

    const target = editor.view.dom.querySelector<HTMLElement>(`[data-outline-id="${item.id}"]`)
      ?? Array.from(editor.view.dom.querySelectorAll<HTMLElement>("h2, h3, h4"))
        .find((node) => node.textContent?.trim() === item.label);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
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
