import { TextSelection } from "@tiptap/pm/state";
import type { Editor as TiptapEditor } from "@tiptap/core";

export function promptForLink(editor: TiptapEditor): boolean {
  const previous = editor.getAttributes("link").href ?? "";
  const href = window.prompt("링크 주소를 입력하세요", previous);
  if (href === null) return false;

  const normalized = href.trim();
  if (!normalized) {
    return editor.chain().focus().extendMarkRange("link").unsetLink().run();
  }

  return editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run();
}

export function clampSelectionPosition(editor: TiptapEditor, position: number): number {
  const min = 1;
  const max = Math.max(1, editor.state.doc.content.size);
  return Math.min(Math.max(position, min), max);
}

export function replaceEditorContentPreservingSelection(
  editor: TiptapEditor,
  nextContent: Record<string, unknown>,
) {
  const { from, to } = editor.state.selection;
  const wasFocused = editor.isFocused;

  editor.commands.setContent(nextContent, false);

  const anchor = clampSelectionPosition(editor, from);
  const head = clampSelectionPosition(editor, to);
  const selection = TextSelection.create(editor.state.doc, anchor, head);
  editor.view.dispatch(editor.state.tr.setSelection(selection));

  if (wasFocused) {
    editor.view.focus();
  }
}
