import assert from "node:assert/strict";
import test from "node:test";

import {
  continueMarkdownMarkupText,
  deleteMarkdownMarkupBackwardText,
  insertHorizontalRuleText,
  insertLinkText,
  insertTextAtSelectionText,
  replaceEmptyTaskContinuationText,
  setHeadingText,
  toggleBlockquoteText,
  toggleBoldText,
  toggleBulletListText,
  toggleCodeBlockText,
  toggleInlineCodeText,
  toggleItalicText,
  toggleOrderedListText,
  toggleStrikeText,
  toggleTaskCheckboxAtLineText,
  toggleTaskListText,
  type SelectionRange,
} from "../src/components/editor/codemirror/commands.ts";

function range(from: number, to: number): SelectionRange {
  return { from, to };
}

test("toggleBoldText wraps a plain selection with markdown tokens", () => {
  const result = toggleBoldText("hello world", range(0, 5));
  assert.deepEqual(result, {
    doc: "**hello** world",
    selection: { from: 2, to: 7 },
  });
});

test("toggleBoldText unwraps an already-bold selection", () => {
  const result = toggleBoldText("**hello** world", range(2, 7));
  assert.deepEqual(result, {
    doc: "hello world",
    selection: { from: 0, to: 5 },
  });
});

test("toggleItalicText wraps selection with a single asterisk pair", () => {
  const result = toggleItalicText("alpha beta", range(6, 10));
  assert.deepEqual(result, {
    doc: "alpha *beta*",
    selection: { from: 7, to: 11 },
  });
});

test("toggleInlineCodeText wraps selection with backticks", () => {
  const result = toggleInlineCodeText("const value", range(6, 11));
  assert.deepEqual(result, {
    doc: "const `value`",
    selection: { from: 7, to: 12 },
  });
});

test("toggleStrikeText wraps selection with double tildes", () => {
  const result = toggleStrikeText("obsolete item", range(0, 8));
  assert.deepEqual(result, {
    doc: "~~obsolete~~ item",
    selection: { from: 2, to: 10 },
  });
});

test("setHeadingText adds a heading prefix to a plain line", () => {
  const result = setHeadingText("Title", range(0, 5), 2);
  assert.deepEqual(result, {
    doc: "## Title",
    selection: { from: 3, to: 8 },
  });
});

test("setHeadingText removes the same heading level when toggled again", () => {
  const result = setHeadingText("## Title", range(3, 8), 2);
  assert.deepEqual(result, {
    doc: "Title",
    selection: { from: 3, to: 5 },
  });
});

test("setHeadingText replaces an existing different heading level", () => {
  const result = setHeadingText("### Deep", range(4, 8), 1);
  assert.deepEqual(result, {
    doc: "# Deep",
    selection: { from: 2, to: 6 },
  });
});

test("toggleBulletListText prefixes each selected line", () => {
  const source = "one\ntwo\nthree";
  const result = toggleBulletListText(source, range(0, source.length));
  assert.deepEqual(result, {
    doc: "- one\n- two\n- three",
    selection: { from: 0, to: 19 },
  });
});

test("toggleBulletListText removes bullet prefixes when every selected line already has one", () => {
  const source = "- one\n- two";
  const result = toggleBulletListText(source, range(0, source.length));
  assert.deepEqual(result, {
    doc: "one\ntwo",
    selection: { from: 0, to: 7 },
  });
});

test("toggleOrderedListText renumbers every selected line from one", () => {
  const source = "first\nsecond\nthird";
  const result = toggleOrderedListText(source, range(0, source.length));
  assert.deepEqual(result, {
    doc: "1. first\n2. second\n3. third",
    selection: { from: 0, to: 27 },
  });
});

test("toggleTaskListText prefixes plain lines with unchecked markdown tasks", () => {
  const source = "ship it\nwrite tests";
  const result = toggleTaskListText(source, range(0, source.length));
  assert.deepEqual(result, {
    doc: "- [ ] ship it\n- [ ] write tests",
    selection: { from: 0, to: 31 },
  });
});

test("toggleTaskListText removes task markers when every selected line is already a task", () => {
  const source = "- [ ] ship it\n- [x] write tests";
  const result = toggleTaskListText(source, range(0, source.length));
  assert.deepEqual(result, {
    doc: "ship it\nwrite tests",
    selection: { from: 0, to: 19 },
  });
});

test("toggleBlockquoteText prefixes each selected line with a quote marker", () => {
  const source = "line one\nline two";
  const result = toggleBlockquoteText(source, range(0, source.length));
  assert.deepEqual(result, {
    doc: "> line one\n> line two",
    selection: { from: 0, to: 21 },
  });
});

test("toggleCodeBlockText wraps the current selection in fenced markdown", () => {
  const result = toggleCodeBlockText("const x = 1;", range(0, 12));
  assert.deepEqual(result, {
    doc: "```\nconst x = 1;\n```",
    selection: { from: 4, to: 16 },
  });
});

test("toggleCodeBlockText inserts an empty fenced block for an empty selection", () => {
  const result = toggleCodeBlockText("", range(0, 0));
  assert.deepEqual(result, {
    doc: "```\n\n```",
    selection: { from: 4, to: 4 },
  });
});

test("insertLinkText wraps the selected text in markdown link syntax", () => {
  const result = insertLinkText("Read docs", range(0, 4), "https://example.com");
  assert.deepEqual(result, {
    doc: "[Read](https://example.com) docs",
    selection: { from: 1, to: 5 },
  });
});

test("insertLinkText falls back to a default label when the selection is empty", () => {
  const result = insertLinkText("", range(0, 0), "https://example.com");
  assert.deepEqual(result, {
    doc: "[link](https://example.com)",
    selection: { from: 1, to: 5 },
  });
});

test("insertHorizontalRuleText inserts a top-level divider at the beginning of a document", () => {
  const result = insertHorizontalRuleText("hello", range(0, 0));
  assert.deepEqual(result, {
    doc: "---\n\nhello",
    selection: { from: 5, to: 5 },
  });
});

test("insertHorizontalRuleText inserts a divider with surrounding newlines inside a document", () => {
  const result = insertHorizontalRuleText("hello", range(5, 5));
  assert.deepEqual(result, {
    doc: "hello\n---\n",
    selection: { from: 10, to: 10 },
  });
});

test("insertTextAtSelectionText replaces the selected range and places the caret after the inserted text", () => {
  const result = insertTextAtSelectionText("hello world", range(6, 11), "markdown");
  assert.deepEqual(result, {
    doc: "hello markdown",
    selection: { from: 14, to: 14 },
  });
});

test("toggleTaskCheckboxAtLineText flips an unchecked task to checked", () => {
  const result = toggleTaskCheckboxAtLineText("- [ ] write tests\nnext", 0);
  assert.deepEqual(result, {
    doc: "- [x] write tests\nnext",
    selection: { from: 0, to: 0 },
  });
});

test("toggleTaskCheckboxAtLineText flips a checked task back to unchecked", () => {
  const result = toggleTaskCheckboxAtLineText("- [x] write tests\nnext", 0);
  assert.deepEqual(result, {
    doc: "- [ ] write tests\nnext",
    selection: { from: 0, to: 0 },
  });
});

test("toggleTaskCheckboxAtLineText returns null for non-task lines", () => {
  assert.equal(toggleTaskCheckboxAtLineText("plain paragraph", 0), null);
});

test("replaceEmptyTaskContinuationText converts an empty continued task into a bullet", () => {
  const result = replaceEmptyTaskContinuationText("- [ ] ", 6, "-");
  assert.deepEqual(result, {
    doc: "- ",
    selection: { from: 2, to: 2 },
  });
});

test("replaceEmptyTaskContinuationText preserves indentation when converting a nested task", () => {
  const result = replaceEmptyTaskContinuationText("  - [ ] ", 8, "+");
  assert.deepEqual(result, {
    doc: "  + ",
    selection: { from: 4, to: 4 },
  });
});

test("replaceEmptyTaskContinuationText ignores non-empty task lines", () => {
  assert.equal(replaceEmptyTaskContinuationText("- [ ] keep", 10, "-"), null);
});

test("continueMarkdownMarkupText continues a non-empty task list item", () => {
  const source = "- [ ] task";
  const result = continueMarkdownMarkupText(source, source.length);
  assert.deepEqual(result, {
    doc: "- [ ] task\n- [ ] ",
    selection: { from: 17, to: 17 },
  });
});

test("continueMarkdownMarkupText continues a non-empty bullet list item", () => {
  const source = "  - child";
  const result = continueMarkdownMarkupText(source, source.length);
  assert.deepEqual(result, {
    doc: "  - child\n  - ",
    selection: { from: 14, to: 14 },
  });
});

test("continueMarkdownMarkupText turns an empty task continuation into a plain line", () => {
  const source = "- [ ] ";
  const result = continueMarkdownMarkupText(source, source.length);
  assert.deepEqual(result, {
    doc: "",
    selection: { from: 0, to: 0 },
  });
});

test("continueMarkdownMarkupText outdents an empty nested bullet continuation one level", () => {
  const source = "  - ";
  const result = continueMarkdownMarkupText(source, source.length);
  assert.deepEqual(result, {
    doc: "- ",
    selection: { from: 2, to: 2 },
  });
});

test("continueMarkdownMarkupText outdents an empty nested task continuation one level", () => {
  const source = "    - [ ] ";
  const result = continueMarkdownMarkupText(source, source.length);
  assert.deepEqual(result, {
    doc: "  - [ ] ",
    selection: { from: 8, to: 8 },
  });
});

test("continueMarkdownMarkupText outdents an empty nested ordered continuation one level", () => {
  const source = "    3. ";
  const result = continueMarkdownMarkupText(source, source.length);
  assert.deepEqual(result, {
    doc: "  1. ",
    selection: { from: 5, to: 5 },
  });
});

test("continueMarkdownMarkupText creates an indented child task when the line ends with a colon", () => {
  const source = "- [x] parent:";
  const result = continueMarkdownMarkupText(source, source.length);
  assert.deepEqual(result, {
    doc: "- [x] parent:\n  - [ ] ",
    selection: { from: 22, to: 22 },
  });
});

test("continueMarkdownMarkupText creates an indented child bullet when the line ends with a colon", () => {
  const source = "- parent:";
  const result = continueMarkdownMarkupText(source, source.length);
  assert.deepEqual(result, {
    doc: "- parent:\n  - ",
    selection: { from: 14, to: 14 },
  });
});

test("deleteMarkdownMarkupBackwardText turns an empty task into a paragraph line", () => {
  const source = "- [ ] ";
  const result = deleteMarkdownMarkupBackwardText(source, source.length);
  assert.deepEqual(result, {
    doc: "",
    selection: { from: 0, to: 0 },
  });
});

test("deleteMarkdownMarkupBackwardText removes a bare bullet marker but preserves indentation", () => {
  const source = "  - ";
  const result = deleteMarkdownMarkupBackwardText(source, source.length);
  assert.deepEqual(result, {
    doc: "  ",
    selection: { from: 2, to: 2 },
  });
});
