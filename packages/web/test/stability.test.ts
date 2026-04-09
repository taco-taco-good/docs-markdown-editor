import assert from "node:assert/strict";
import test from "node:test";

import { EditorSelection, EditorState } from "@codemirror/state";

import {
  activeLineSpan,
  didActiveLinesChange,
  shouldHideRange,
  shouldRenderIndentWidget,
  shouldRenderWidget,
} from "../src/components/editor/codemirror/stability.ts";

function createState(doc: string, anchor: number, head = anchor): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
  });
}

test("activeLineSpan uses the entire current line for a caret selection", () => {
  const state = createState("first\n- [ ] task\nlast", 10);
  const span = activeLineSpan(state);
  assert.equal(state.sliceDoc(span.from, span.to), "- [ ] task");
});

test("activeLineSpan expands across all selected lines", () => {
  const doc = "first\n- [ ] task\nsecond line\nlast";
  const state = createState(doc, 8, 25);
  const span = activeLineSpan(state);
  assert.equal(state.sliceDoc(span.from, span.to), "- [ ] task\nsecond line");
});

test("shouldHideRange and shouldRenderWidget keep the active line in raw mode", () => {
  const doc = "title\n- [ ] task\nnext";
  const state = createState(doc, 10);
  const taskLineStart = doc.indexOf("- [ ] task");
  const taskLineEnd = taskLineStart + "- [ ] task".length;

  assert.equal(shouldHideRange(state, taskLineStart, taskLineStart + 6), false);
  assert.equal(shouldRenderWidget(state, taskLineStart, taskLineEnd), false);
  assert.equal(shouldHideRange(state, 0, 5), true);
});

test("shouldRenderIndentWidget keeps nested indent visible when caret is after the indent", () => {
  const doc = "root\n  - child";
  const state = createState(doc, doc.length);
  const indentFrom = doc.indexOf("  - child");
  const indentTo = indentFrom + 2;

  assert.equal(shouldRenderIndentWidget(state, indentFrom, indentTo), true);
});

test("shouldRenderIndentWidget falls back to raw when caret is inside the indent", () => {
  const doc = "root\n  - child";
  const indentFrom = doc.indexOf("  - child");
  const state = createState(doc, indentFrom + 1);

  assert.equal(shouldRenderIndentWidget(state, indentFrom, indentFrom + 2), false);
});

test("shouldRenderIndentWidget falls back to raw for range selections on the active line", () => {
  const doc = "root\n  - child";
  const indentFrom = doc.indexOf("  - child");
  const state = createState(doc, indentFrom, indentFrom + 5);

  assert.equal(shouldRenderIndentWidget(state, indentFrom, indentFrom + 2), false);
});

test("didActiveLinesChange ignores caret moves within the same line", () => {
  const doc = "first\n- [ ] task\nlast";
  const previous = createState(doc, 9);
  const next = createState(doc, 14);
  assert.equal(didActiveLinesChange(previous, next), false);
});

test("didActiveLinesChange detects moving to another line", () => {
  const doc = "first\n- [ ] task\nlast";
  const previous = createState(doc, 9);
  const next = createState(doc, doc.length - 2);
  assert.equal(didActiveLinesChange(previous, next), true);
});
