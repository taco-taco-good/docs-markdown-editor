import { EditorState } from "@codemirror/state";
import {
  defaultKeymap,
  deleteCharBackward,
  history,
  historyKeymap,
  indentWithTab,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import { keymap, drawSelection, EditorView, placeholder } from "@codemirror/view";
import { searchKeymap } from "@codemirror/search";
import {
  insertNewlineContinueMarkup,
  markdown,
  markdownLanguage,
} from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { markdownLivePreview } from "./live-preview";
import { autoCloseCodeFence } from "./code-blocks";
import {
  continueMarkdownMarkup,
  deleteMarkdownMarkupBackward,
  insertHorizontalRule,
  promptForLink,
  replaceEmptyTaskContinuationText,
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
} from "./commands";
import {
  formatMarkdownTable,
  moveToNextMarkdownTableCell,
  moveToPreviousMarkdownTableCell,
} from "./table-editing";
import { codeLanguages } from "./code-languages";

const editorHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#c678dd", fontWeight: "600" },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: "#e06c75" },
  { tag: [t.function(t.variableName), t.labelName], color: "#61afef" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#d19a66" },
  { tag: [t.definition(t.name), t.separator], color: "#abb2bf" },
  { tag: [t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#e5c07b" },
  { tag: [t.typeName], color: "#56b6c2" },
  { tag: [t.operator, t.operatorKeyword], color: "#56b6c2" },
  { tag: [t.url, t.escape, t.regexp, t.link], color: "#56b6c2" },
  { tag: [t.meta, t.comment], color: "#7f8795", fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "700" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strikethrough], textDecoration: "line-through" },
  { tag: [t.link], color: "#61afef", textDecoration: "underline" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#d19a66" },
  { tag: [t.processingInstruction, t.string, t.inserted], color: "#98c379" },
  { tag: [t.invalid], color: "#ffffff", backgroundColor: "#e06c75" },
]);

function chainKeyRuns(...commands: Array<(view: EditorView) => boolean>): (view: EditorView) => boolean {
  return (view) => commands.some((command) => command(view));
}

function skipWhileComposing(command: (view: EditorView) => boolean): (view: EditorView) => boolean {
  return (view) => {
    if (view.composing) return false;
    return command(view);
  };
}

function isMarkupContinuationLine(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head).text;
  return /^(\s*)(-\s\[[ xX]\]\s+|[-+*]\s+|\d+\.\s+|>\s+)/.test(line);
}

function continueNativeMarkdownMarkup(view: EditorView): boolean {
  if (!isMarkupContinuationLine(view)) return false;
  return insertNewlineContinueMarkup(view);
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

function transformEmptyTaskContinuationInput(view: EditorView, from: number, to: number, text: string): boolean {
  if (from !== to || (text !== "-" && text !== "*" && text !== "+")) return false;
  const current = view.state.doc.toString();
  const result = replaceEmptyTaskContinuationText(current, from, text);
  if (!result) return false;

  view.dispatch({
    changes: computeMinimalChange(current, result.doc),
    selection: { anchor: result.selection.from, head: result.selection.to },
    userEvent: "input",
  });
  return true;
}

export function createEditorExtensions(options: {
  currentPath: string;
  onDocChange: (raw: string) => void;
  onSelectionChange: (selection: { from: number; to: number; head: number; empty: boolean }) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
  onDropFiles: (files: FileList) => void;
  onLinkActivate: (url: string) => void;
  onActivateTable: (pos: number) => void;
}) {
  return [
    history(),
    drawSelection(),
    markdown({ base: markdownLanguage, codeLanguages, addKeymap: false }),
    syntaxHighlighting(editorHighlightStyle),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    placeholder("마크다운 문서를 입력하세요"),
    EditorState.tabSize.of(2),
    keymap.of([
      {
        key: "Tab",
        run: (view) => moveToNextMarkdownTableCell(view) || Boolean(indentWithTab.run?.(view)),
      },
      {
        key: "Shift-Tab",
        run: moveToPreviousMarkdownTableCell,
      },
      {
        key: "Enter",
        run: skipWhileComposing(
          chainKeyRuns(autoCloseCodeFence, continueMarkdownMarkup, continueNativeMarkdownMarkup, insertNewlineAndIndent),
        ),
      },
      {
        key: "Backspace",
        run: skipWhileComposing(
          chainKeyRuns(deleteMarkdownMarkupBackward, deleteCharBackward),
        ),
      },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      { key: "Mod-b", run: toggleBold },
      { key: "Mod-i", run: toggleItalic },
      { key: "Mod-Shift-x", run: toggleStrike },
      { key: "Mod-e", run: toggleInlineCode },
      { key: "Mod-k", run: promptForLink },
      { key: "Mod-Alt-t", run: formatMarkdownTable },
      { key: "Mod-Alt-1", run: (view) => setHeading(view, 1) },
      { key: "Mod-Alt-2", run: (view) => setHeading(view, 2) },
      { key: "Mod-Alt-3", run: (view) => setHeading(view, 3) },
      { key: "Mod-Shift-8", run: toggleBulletList },
      { key: "Mod-Shift-7", run: toggleOrderedList },
      { key: "Mod-Shift-9", run: toggleTaskList },
      { key: "Mod-Shift-.", run: toggleBlockquote },
      { key: "Mod-Alt-c", run: toggleCodeBlock },
      { key: "Mod-Alt--", run: insertHorizontalRule },
    ]),
    markdownLivePreview({
      currentPath: options.currentPath,
      onLinkActivate: options.onLinkActivate,
      onActivateTable: options.onActivateTable,
    }),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        height: "auto",
        minHeight: "100%",
        width: "100%",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-body)",
        fontSize: "1.05rem",
        lineHeight: "1.72",
        color: "var(--color-text-primary)",
        width: "100%",
        height: "auto",
        minHeight: "100%",
        overflow: "visible",
        caretColor: "var(--color-accent)",
      },
      ".cm-content": {
        boxSizing: "border-box",
        width: "100%",
        minHeight: "100%",
      },
      ".cm-focused": {
        outline: "none",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--color-accent)",
      },
      ".cm-selectionBackground": {
        backgroundColor: "color-mix(in srgb, var(--color-accent) 18%, transparent) !important",
      },
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onDocChange(update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const main = update.state.selection.main;
        options.onSelectionChange({
          from: main.from,
          to: main.to,
          head: main.head,
          empty: main.empty,
        });
      }
    }),
    EditorView.inputHandler.of((view, from, to, text, insert) => {
      if (!view.composing && transformEmptyTaskContinuationInput(view, from, to, text)) {
        return true;
      }
      return false;
    }),
    EditorView.domEventHandlers({
      compositionstart: () => {
        options.onCompositionStart();
        return false;
      },
      compositionend: () => {
        queueMicrotask(() => options.onCompositionEnd());
        return false;
      },
      drop: (event) => {
        if (event.dataTransfer?.files?.length) {
          event.preventDefault();
          options.onDropFiles(event.dataTransfer.files);
          return true;
        }
        return false;
      },
    }),
  ];
}
