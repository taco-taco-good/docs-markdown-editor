import type { Editor as TiptapEditor } from "@tiptap/core";
import { getSlashQuery } from "./slash-commands";

export function syncSlashState(
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

export function syncSelectionToolbar(
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

export type TableToolsPosition = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
};

export function syncTableTools(
  editor: TiptapEditor,
  setPosition: React.Dispatch<React.SetStateAction<TableToolsPosition | null>>,
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

export function scrollHeadingToTop(editor: TiptapEditor, target: HTMLElement) {
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
