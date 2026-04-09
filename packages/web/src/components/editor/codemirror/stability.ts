import type { EditorState, Transaction } from "@codemirror/state";

interface LineSpan {
  from: number;
  to: number;
}

function rangeOverlaps(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom <= bTo && aTo >= bFrom;
}

export function activeLineSpan(state: EditorState): LineSpan {
  const main = state.selection.main;
  const startLine = state.doc.lineAt(main.from);
  const endLine = state.doc.lineAt(main.to);
  return {
    from: startLine.from,
    to: endLine.to,
  };
}

function activeSelection(state: EditorState): { from: number; to: number; empty: boolean } {
  const main = state.selection.main;
  return {
    from: main.from,
    to: main.to,
    empty: main.empty,
  };
}

export function rangeTouchesActiveLines(state: EditorState, from: number, to: number): boolean {
  const active = activeLineSpan(state);
  return rangeOverlaps(from, to, active.from, active.to);
}

export function didActiveLinesChange(previous: EditorState, next: EditorState): boolean {
  const before = activeLineSpan(previous);
  const after = activeLineSpan(next);
  return before.from !== after.from || before.to !== after.to;
}

export function shouldHideRange(state: EditorState, from: number, to: number): boolean {
  return !rangeTouchesActiveLines(state, from, to);
}

export function shouldRenderWidget(state: EditorState, from: number, to: number): boolean {
  return !rangeTouchesActiveLines(state, from, to);
}

export function shouldRenderIndentWidget(state: EditorState, from: number, to: number): boolean {
  if (!rangeTouchesActiveLines(state, from, to)) return true;

  const selection = activeSelection(state);
  if (!selection.empty) return false;

  const caret = selection.from;
  return caret > to;
}

export function isCompositionTransaction(transaction: Transaction): boolean {
  return transaction.isUserEvent("input.type.compose");
}
