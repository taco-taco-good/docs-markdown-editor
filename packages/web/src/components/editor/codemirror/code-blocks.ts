import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export interface CodeBlockTransformResult {
  doc: string;
  selection: {
    from: number;
    to: number;
  };
}

function replaceRange(source: string, from: number, to: number, insert: string): string {
  return `${source.slice(0, from)}${insert}${source.slice(to)}`;
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

function lineBounds(source: string, pos: number): { from: number; to: number; text: string } {
  const from = source.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
  const nextBreak = source.indexOf("\n", pos);
  const to = nextBreak === -1 ? source.length : nextBreak;
  return { from, to, text: source.slice(from, to) };
}

function linesBefore(source: string, lineStart: number): string[] {
  if (lineStart <= 0) return [];
  return source.slice(0, Math.max(0, lineStart - 1)).split("\n");
}

function linesAfter(source: string, lineEnd: number): string[] {
  if (lineEnd >= source.length) return [];
  return source.slice(lineEnd + 1).split("\n");
}

function isMatchingClosingFence(line: string, indent: string, fence: string): boolean {
  const match = /^(\s*)(`{3,}|~{3,})\s*$/.exec(line);
  if (!match) return false;
  return match[1] === indent && match[2][0] === fence[0] && match[2].length >= fence.length;
}

function isInsideOpenFenceBefore(source: string, lineStart: number, fence: string): boolean {
  let open = false;
  for (const line of linesBefore(source, lineStart)) {
    const match = /^(\s*)(`{3,}|~{3,})([^\n]*)$/.exec(line);
    if (!match) continue;
    const currentFence = match[2];
    if (currentFence[0] !== fence[0] || currentFence.length < fence.length) continue;
    open = !open;
  }
  return open;
}

function hasMatchingClosingFenceAfter(source: string, lineEnd: number, indent: string, fence: string): boolean {
  for (const line of linesAfter(source, lineEnd)) {
    if (isMatchingClosingFence(line, indent, fence)) {
      return true;
    }
  }
  return false;
}

export function autoCloseCodeFenceText(source: string, cursorPos: number): CodeBlockTransformResult | null {
  const bounds = lineBounds(source, cursorPos);
  if (cursorPos !== bounds.to) return null;

  const opener = /^(\s*)(`{3,}|~{3,})([^\n]*)$/.exec(bounds.text);
  if (!opener) return null;

  const [, indent, fence, info] = opener;

  if (isInsideOpenFenceBefore(source, bounds.from, fence)) {
    return null;
  }

  if (hasMatchingClosingFenceAfter(source, bounds.to, indent, fence)) {
    return null;
  }

  const insert = `\n\n${indent}${fence}`;
  return {
    doc: replaceRange(source, cursorPos, cursorPos, insert),
    selection: {
      from: cursorPos + 1,
      to: cursorPos + 1,
    },
  };
}

export function autoCloseCodeFence(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const result = autoCloseCodeFenceText(view.state.doc.toString(), selection.from);
  if (!result) return false;

  const current = view.state.doc.toString();
  const change = computeMinimalChange(current, result.doc);
  view.dispatch({
    changes: change,
    selection: EditorSelection.range(result.selection.from, result.selection.to),
  });
  return true;
}
