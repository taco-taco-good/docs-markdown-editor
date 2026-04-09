import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  ITextEditor,
  Point,
  Range,
  TableEditor,
  optionsWithDefaults,
} from "@tgrosinger/md-advanced-tables";
import type { TransformResult } from "./commands";

const TABLE_OPTIONS = optionsWithDefaults({
  smartCursor: true,
});

interface InternalSelection {
  anchor: number;
  head: number;
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

function docToLines(source: string): string[] {
  return source.length === 0 ? [""] : source.split("\n");
}

function linesToDoc(lines: string[]): string {
  if (lines.length === 0) return "";
  if (lines.length === 1 && lines[0] === "") return "";
  return lines.join("\n");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointToOffset(source: string, point: Point): number {
  const lines = docToLines(source);
  const row = clamp(point.row, 0, Math.max(0, lines.length - 1));
  const column = clamp(point.column, 0, lines[row]?.length ?? 0);
  let offset = 0;
  for (let index = 0; index < row; index += 1) {
    offset += lines[index].length + 1;
  }
  return offset + column;
}

function offsetToPoint(source: string, offset: number): Point {
  const clamped = clamp(offset, 0, source.length);
  const prefix = source.slice(0, clamped);
  const row = prefix.length === 0 ? 0 : prefix.split("\n").length - 1;
  const lastBreak = prefix.lastIndexOf("\n");
  const column = lastBreak === -1 ? prefix.length : prefix.length - lastBreak - 1;
  return new Point(row, column);
}

function isRowInCodeFence(source: string, targetRow: number): boolean {
  const lines = docToLines(source);
  let inFence = false;
  for (let row = 0; row <= Math.min(targetRow, lines.length - 1); row += 1) {
    if (/^\s*(```|~~~)/.test(lines[row])) {
      inFence = !inFence;
    }
  }
  return inFence;
}

class MutableMarkdownTableEditor extends ITextEditor {
  private doc: string;
  private selection: InternalSelection;

  constructor(source: string, selection: InternalSelection) {
    super();
    this.doc = source;
    this.selection = selection;
  }

  getResult(): TransformResult | null {
    return {
      doc: this.doc,
      selection: {
        from: this.selection.anchor,
        to: this.selection.head,
      },
    };
  }

  getCursorPosition(): Point {
    return offsetToPoint(this.doc, this.selection.head);
  }

  setCursorPosition(pos: Point): void {
    const offset = pointToOffset(this.doc, pos);
    this.selection = { anchor: offset, head: offset };
  }

  setSelectionRange(range: Range): void {
    this.selection = {
      anchor: pointToOffset(this.doc, range.start),
      head: pointToOffset(this.doc, range.end),
    };
  }

  getLastRow(): number {
    return docToLines(this.doc).length - 1;
  }

  acceptsTableEdit(row: number): boolean {
    return !isRowInCodeFence(this.doc, row);
  }

  getLine(row: number): string {
    return docToLines(this.doc)[row] ?? "";
  }

  insertLine(row: number, line: string): void {
    const lines = docToLines(this.doc);
    const insertAt = clamp(row, 0, lines.length);
    if (lines.length === 1 && lines[0] === "") {
      this.doc = line;
      return;
    }
    lines.splice(insertAt, 0, line);
    this.doc = linesToDoc(lines);
  }

  deleteLine(row: number): void {
    const lines = docToLines(this.doc);
    if (lines.length === 1) {
      this.doc = "";
      return;
    }
    lines.splice(clamp(row, 0, lines.length - 1), 1);
    this.doc = linesToDoc(lines);
  }

  replaceLines(startRow: number, endRow: number, lines: string[]): void {
    const current = docToLines(this.doc);
    const start = clamp(startRow, 0, current.length);
    const end = clamp(endRow, start, current.length);
    current.splice(start, end - start, ...lines);
    this.doc = linesToDoc(current);
  }

  transact(func: () => void): void {
    func();
  }
}

function runTableCommand(
  source: string,
  selection: InternalSelection,
  command: (tableEditor: TableEditor) => void,
): TransformResult | null {
  const adapter = new MutableMarkdownTableEditor(source, selection);
  const tableEditor = new TableEditor(adapter);
  if (!tableEditor.cursorIsInTable(TABLE_OPTIONS)) return null;
  command(tableEditor);
  return adapter.getResult();
}

function dispatchTableTransform(view: EditorView, result: TransformResult | null): boolean {
  if (!result) return false;
  const current = view.state.doc.toString();
  const change = computeMinimalChange(current, result.doc);
  view.dispatch({
    changes: change,
    selection: EditorSelection.range(result.selection.from, result.selection.to),
  });
  return true;
}

export function formatMarkdownTableText(source: string, cursorPos: number): TransformResult | null {
  return runTableCommand(source, { anchor: cursorPos, head: cursorPos }, (tableEditor) => {
    tableEditor.format(TABLE_OPTIONS);
  });
}

export function moveToNextMarkdownTableCellText(source: string, cursorPos: number): TransformResult | null {
  return runTableCommand(source, { anchor: cursorPos, head: cursorPos }, (tableEditor) => {
    tableEditor.nextCell(TABLE_OPTIONS);
  });
}

export function moveToPreviousMarkdownTableCellText(source: string, cursorPos: number): TransformResult | null {
  return runTableCommand(source, { anchor: cursorPos, head: cursorPos }, (tableEditor) => {
    tableEditor.previousCell(TABLE_OPTIONS);
  });
}

export function selectMarkdownTableCellText(source: string, cursorPos: number): TransformResult | null {
  return runTableCommand(source, { anchor: cursorPos, head: cursorPos }, (tableEditor) => {
    tableEditor.selectCell(TABLE_OPTIONS);
  });
}

export function formatMarkdownTable(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  return dispatchTableTransform(view, formatMarkdownTableText(view.state.doc.toString(), head));
}

export function moveToNextMarkdownTableCell(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  return dispatchTableTransform(view, moveToNextMarkdownTableCellText(view.state.doc.toString(), head));
}

export function moveToPreviousMarkdownTableCell(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  return dispatchTableTransform(view, moveToPreviousMarkdownTableCellText(view.state.doc.toString(), head));
}

export function selectMarkdownTableCell(view: EditorView, pos?: number): boolean {
  const head = pos ?? view.state.selection.main.head;
  return dispatchTableTransform(view, selectMarkdownTableCellText(view.state.doc.toString(), head));
}
