import type { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";

export interface SelectionRange {
  from: number;
  to: number;
}

export interface TransformResult {
  doc: string;
  selection: SelectionRange;
}

interface DispatchOptions {
  focus?: boolean;
  scrollIntoView?: boolean;
}

function replaceRange(source: string, from: number, to: number, insert: string): string {
  return `${source.slice(0, from)}${insert}${source.slice(to)}`;
}

function outdentIndent(indent: string, step = 2): string {
  if (indent.length <= 0) return "";
  return indent.slice(0, Math.max(0, indent.length - step));
}

function selectedRange(view: EditorView): SelectionRange {
  const range = view.state.selection.main;
  return { from: range.from, to: range.to };
}

function selectedText(source: string, range: SelectionRange): string {
  return source.slice(range.from, range.to);
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

function dispatchResult(view: EditorView, result: TransformResult, options: DispatchOptions = {}): boolean {
  const current = view.state.doc.toString();
  const change = computeMinimalChange(current, result.doc);
  view.dispatch({
    changes: change,
    selection: EditorSelection.range(result.selection.from, result.selection.to),
    ...(options.scrollIntoView ? { scrollIntoView: true } : {}),
  });
  if (options.focus) {
    view.focus();
  }
  return true;
}

function lineBounds(source: string, range: SelectionRange): { from: number; to: number; text: string } {
  const from = source.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1;
  const nextBreak = source.indexOf("\n", range.to);
  const to = nextBreak === -1 ? source.length : nextBreak;
  return { from, to, text: source.slice(from, to) };
}

function selectedLines(source: string, range: SelectionRange): { from: number; to: number; lines: string[] } {
  const from = source.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1;
  const nextBreak = source.indexOf("\n", range.to);
  const to = nextBreak === -1 ? source.length : nextBreak;
  return { from, to, lines: source.slice(from, to).split("\n") };
}

function wrapInline(source: string, range: SelectionRange, token: string): TransformResult {
  const text = selectedText(source, range);
  const before = source.slice(Math.max(0, range.from - token.length), range.from);
  const after = source.slice(range.to, range.to + token.length);

  if (before === token && after === token) {
    return {
      doc: `${source.slice(0, range.from - token.length)}${text}${source.slice(range.to + token.length)}`,
      selection: {
        from: range.from - token.length,
        to: range.to - token.length,
      },
    };
  }

  const next = replaceRange(source, range.from, range.to, `${token}${text}${token}`);
  return {
    doc: next,
    selection: {
      from: range.from + token.length,
      to: range.to + token.length,
    },
  };
}

function toggleHeadingLevel(source: string, range: SelectionRange, level: number): TransformResult {
  const bounds = lineBounds(source, range);
  const line = bounds.text;
  const stripped = line.replace(/^#{1,6}\s+/, "");
  const nextPrefix = `${"#".repeat(level)} `;
  const nextLine = line.startsWith(nextPrefix) ? stripped : `${nextPrefix}${stripped}`;
  return {
    doc: replaceRange(source, bounds.from, bounds.to, nextLine),
    selection: {
      from: bounds.from + Math.min(nextLine.length, nextPrefix.length),
      to: bounds.from + nextLine.length,
    },
  };
}

function toggleLinePrefix(source: string, range: SelectionRange, prefix: string, matcher: RegExp): TransformResult {
  const block = selectedLines(source, range);
  const everyPrefixed = block.lines.every((line) => line === "" || matcher.test(line));
  const nextLines = block.lines.map((line, index) => {
    if (line === "") return everyPrefixed ? line : `${prefix}`;
    if (everyPrefixed) return line.replace(matcher, "");
    if (prefix === "1. ") {
      return `${index + 1}. ${line.replace(/^\d+\.\s+/, "")}`;
    }
    return `${prefix}${line.replace(matcher, "")}`;
  });
  const joined = nextLines.join("\n");
  return {
    doc: replaceRange(source, block.from, block.to, joined),
    selection: {
      from: block.from,
      to: block.from + joined.length,
    },
  };
}

function wrapCodeBlock(source: string, range: SelectionRange): TransformResult {
  const text = selectedText(source, range);
  const normalized = text.length > 0 ? text : "";
  const fenced = `\`\`\`\n${normalized}\n\`\`\``;
  return {
    doc: replaceRange(source, range.from, range.to, fenced),
    selection: {
      from: range.from + 4,
      to: range.from + 4 + normalized.length,
    },
  };
}

function insertLink(source: string, range: SelectionRange, href: string): TransformResult {
  const text = selectedText(source, range) || "link";
  const insert = `[${text}](${href})`;
  return {
    doc: replaceRange(source, range.from, range.to, insert),
    selection: {
      from: range.from + 1,
      to: range.from + 1 + text.length,
    },
  };
}

function insertDivider(source: string, range: SelectionRange): TransformResult {
  const insert = range.from === 0 ? "---\n\n" : "\n---\n";
  return {
    doc: replaceRange(source, range.from, range.to, insert),
    selection: {
      from: range.from + insert.length,
      to: range.from + insert.length,
    },
  };
}

export function toggleBoldText(source: string, range: SelectionRange): TransformResult {
  return wrapInline(source, range, "**");
}

export function toggleItalicText(source: string, range: SelectionRange): TransformResult {
  return wrapInline(source, range, "*");
}

export function toggleInlineCodeText(source: string, range: SelectionRange): TransformResult {
  return wrapInline(source, range, "`");
}

export function toggleStrikeText(source: string, range: SelectionRange): TransformResult {
  return wrapInline(source, range, "~~");
}

export function setHeadingText(source: string, range: SelectionRange, level: number): TransformResult {
  return toggleHeadingLevel(source, range, level);
}

export function toggleBulletListText(source: string, range: SelectionRange): TransformResult {
  return toggleLinePrefix(source, range, "- ", /^[-*+]\s+/);
}

export function toggleOrderedListText(source: string, range: SelectionRange): TransformResult {
  return toggleLinePrefix(source, range, "1. ", /^\d+\.\s+/);
}

export function toggleTaskListText(source: string, range: SelectionRange): TransformResult {
  return toggleLinePrefix(source, range, "- [ ] ", /^-\s\[[ xX]\]\s+/);
}

export function toggleBlockquoteText(source: string, range: SelectionRange): TransformResult {
  return toggleLinePrefix(source, range, "> ", /^>\s+/);
}

export function toggleCodeBlockText(source: string, range: SelectionRange): TransformResult {
  return wrapCodeBlock(source, range);
}

export function insertLinkText(source: string, range: SelectionRange, href: string): TransformResult {
  return insertLink(source, range, href);
}

export function insertHorizontalRuleText(source: string, range: SelectionRange): TransformResult {
  return insertDivider(source, range);
}

export function insertTextAtSelectionText(source: string, range: SelectionRange, text: string): TransformResult {
  return {
    doc: replaceRange(source, range.from, range.to, text),
    selection: {
      from: range.from + text.length,
      to: range.from + text.length,
    },
  };
}

export function toggleTaskCheckboxAtLineText(source: string, lineFrom: number): TransformResult | null {
  const lineStart = source.lastIndexOf("\n", Math.max(0, lineFrom - 1)) + 1;
  const lineEndIndex = source.indexOf("\n", lineStart);
  const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
  const lineText = source.slice(lineStart, lineEnd);
  const nextLine = lineText.replace(/^(\s*-\s\[)( |x|X)(\]\s+)/, (_m, open, checked, close) =>
    `${open}${checked.trim().toLowerCase() === "x" ? " " : "x"}${close}`,
  );
  if (nextLine === lineText) return null;
  return {
    doc: replaceRange(source, lineStart, lineEnd, nextLine),
    selection: {
      from: lineStart,
      to: lineStart,
    },
  };
}

export function deleteMarkdownMarkupBackwardText(source: string, cursorPos: number): TransformResult | null {
  const bounds = lineBounds(source, { from: cursorPos, to: cursorPos });
  if (cursorPos !== bounds.to) return null;

  const patterns = [
    /^(\s*)-\s\[[ xX]\]\s$/,
    /^(\s*)[-+*]\s$/,
    /^(\s*)\d+\.\s$/,
    /^(\s*)>\s$/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(bounds.text);
    if (!match) continue;
    const indent = match[1] ?? "";
    return {
      doc: replaceRange(source, bounds.from, bounds.to, indent),
      selection: {
        from: bounds.from + indent.length,
        to: bounds.from + indent.length,
      },
    };
  }

  return null;
}

export function replaceEmptyTaskContinuationText(
  source: string,
  cursorPos: number,
  marker: "-" | "*" | "+",
): TransformResult | null {
  const lineStart = source.lastIndexOf("\n", Math.max(0, cursorPos - 1)) + 1;
  const lineEndIndex = source.indexOf("\n", lineStart);
  const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
  const lineText = source.slice(lineStart, lineEnd);
  const match = /^(\s*)-\s\[[ xX]\]\s*$/.exec(lineText);
  if (!match) return null;

  const replacement = `${match[1]}${marker} `;
  return {
    doc: replaceRange(source, lineStart, lineEnd, replacement),
    selection: {
      from: lineStart + replacement.length,
      to: lineStart + replacement.length,
    },
  };
}

export function continueMarkdownMarkupText(source: string, cursorPos: number): TransformResult | null {
  const bounds = lineBounds(source, { from: cursorPos, to: cursorPos });
  const beforeCursor = source.slice(bounds.from, cursorPos);
  const lineEndsWithColon = beforeCursor.trimEnd().endsWith(":");

  const task = /^(\s*)-\s\[([ xX])\]\s+(.*)$/.exec(bounds.text);
  if (task && beforeCursor === bounds.text) {
    const [, indent, _checked, content] = task;
    if (content.trim() === "") {
      if (indent.length > 0) {
        const replacement = `${outdentIndent(indent)}- [ ] `;
        return {
          doc: replaceRange(source, bounds.from, bounds.to, replacement),
          selection: {
            from: bounds.from + replacement.length,
            to: bounds.from + replacement.length,
          },
        };
      }
      return {
        doc: replaceRange(source, bounds.from, bounds.to, ""),
        selection: {
          from: bounds.from,
          to: bounds.from,
        },
      };
    }
    const insert = lineEndsWithColon ? `\n${indent}  - [ ] ` : `\n${indent}- [ ] `;
    return {
      doc: replaceRange(source, cursorPos, cursorPos, insert),
      selection: {
        from: cursorPos + insert.length,
        to: cursorPos + insert.length,
      },
    };
  }

  const bullet = /^(\s*)([-+*])\s+(.*)$/.exec(bounds.text);
  if (bullet && beforeCursor === bounds.text) {
    const [, indent, marker, content] = bullet;
    if (content.trim() === "") {
      if (indent.length > 0) {
        const replacement = `${outdentIndent(indent)}${marker} `;
        return {
          doc: replaceRange(source, bounds.from, bounds.to, replacement),
          selection: {
            from: bounds.from + replacement.length,
            to: bounds.from + replacement.length,
          },
        };
      }
      return {
        doc: replaceRange(source, bounds.from, bounds.to, ""),
        selection: {
          from: bounds.from,
          to: bounds.from,
        },
      };
    }
    const insert = lineEndsWithColon ? `\n${indent}  ${marker} ` : `\n${indent}${marker} `;
    return {
      doc: replaceRange(source, cursorPos, cursorPos, insert),
      selection: {
        from: cursorPos + insert.length,
        to: cursorPos + insert.length,
      },
    };
  }

  const ordered = /^(\s*)(\d+)\.\s+(.*)$/.exec(bounds.text);
  if (ordered && beforeCursor === bounds.text) {
    const [, indent, num, content] = ordered;
    if (content.trim() === "") {
      if (indent.length > 0) {
        const replacement = `${outdentIndent(indent)}1. `;
        return {
          doc: replaceRange(source, bounds.from, bounds.to, replacement),
          selection: {
            from: bounds.from + replacement.length,
            to: bounds.from + replacement.length,
          },
        };
      }
      return {
        doc: replaceRange(source, bounds.from, bounds.to, ""),
        selection: {
          from: bounds.from,
          to: bounds.from,
        },
      };
    }
    const insert = lineEndsWithColon ? `\n${indent}   1. ` : `\n${indent}${Number(num) + 1}. `;
    return {
      doc: replaceRange(source, cursorPos, cursorPos, insert),
      selection: {
        from: cursorPos + insert.length,
        to: cursorPos + insert.length,
      },
    };
  }

  const quote = /^(\s*>\s)(.*)$/.exec(bounds.text);
  if (quote && beforeCursor === bounds.text) {
    const [, prefix, content] = quote;
    if (content.trim() === "") {
      const indent = prefix.replace(/>\s$/, "");
      return {
        doc: replaceRange(source, bounds.from, bounds.to, indent),
        selection: {
          from: bounds.from + indent.length,
          to: bounds.from + indent.length,
        },
      };
    }
    const insert = `\n${prefix}`;
    return {
      doc: replaceRange(source, cursorPos, cursorPos, insert),
      selection: {
        from: cursorPos + insert.length,
        to: cursorPos + insert.length,
      },
    };
  }

  return null;
}

export function toggleBold(view: EditorView): boolean {
  return dispatchResult(view, toggleBoldText(view.state.doc.toString(), selectedRange(view)), {
    focus: true,
    scrollIntoView: true,
  });
}

export function toggleItalic(view: EditorView): boolean {
  return dispatchResult(view, toggleItalicText(view.state.doc.toString(), selectedRange(view)), {
    focus: true,
    scrollIntoView: true,
  });
}

export function toggleInlineCode(view: EditorView): boolean {
  return dispatchResult(view, toggleInlineCodeText(view.state.doc.toString(), selectedRange(view)), {
    focus: true,
    scrollIntoView: true,
  });
}

export function toggleStrike(view: EditorView): boolean {
  return dispatchResult(view, toggleStrikeText(view.state.doc.toString(), selectedRange(view)), {
    focus: true,
    scrollIntoView: true,
  });
}

export function setHeading(view: EditorView, level: number): boolean {
  return dispatchResult(view, setHeadingText(view.state.doc.toString(), selectedRange(view), level), {
    focus: true,
    scrollIntoView: true,
  });
}

export function toggleBulletList(view: EditorView): boolean {
  return dispatchResult(view, toggleBulletListText(view.state.doc.toString(), selectedRange(view)), {
    focus: true,
    scrollIntoView: true,
  });
}

export function toggleOrderedList(view: EditorView): boolean {
  return dispatchResult(view, toggleOrderedListText(view.state.doc.toString(), selectedRange(view)), {
    focus: true,
    scrollIntoView: true,
  });
}

export function toggleTaskList(view: EditorView): boolean {
  return dispatchResult(view, toggleTaskListText(view.state.doc.toString(), selectedRange(view)), {
    focus: true,
    scrollIntoView: true,
  });
}

export function toggleBlockquote(view: EditorView): boolean {
  return dispatchResult(view, toggleBlockquoteText(view.state.doc.toString(), selectedRange(view)), {
    focus: true,
    scrollIntoView: true,
  });
}

export function toggleCodeBlock(view: EditorView): boolean {
  return dispatchResult(view, toggleCodeBlockText(view.state.doc.toString(), selectedRange(view)), {
    focus: true,
    scrollIntoView: true,
  });
}

export function promptForLink(view: EditorView): boolean {
  const href = window.prompt("링크 주소를 입력하세요", "https://");
  if (!href) return false;
  return dispatchResult(view, insertLinkText(view.state.doc.toString(), selectedRange(view), href.trim()), {
    focus: true,
    scrollIntoView: true,
  });
}

export function insertHorizontalRule(view: EditorView): boolean {
  return dispatchResult(view, insertHorizontalRuleText(view.state.doc.toString(), selectedRange(view)), {
    focus: true,
    scrollIntoView: true,
  });
}

export function insertTextAtSelection(view: EditorView, text: string): boolean {
  return dispatchResult(
    view,
    insertTextAtSelectionText(view.state.doc.toString(), selectedRange(view), text),
    {
      focus: true,
      scrollIntoView: true,
    },
  );
}

export function continueMarkdownMarkup(view: EditorView): boolean {
  const selection = selectedRange(view);
  if (selection.from !== selection.to) return false;
  const result = continueMarkdownMarkupText(view.state.doc.toString(), selection.from);
  if (!result) return false;
  return dispatchResult(view, result);
}

export function deleteMarkdownMarkupBackward(view: EditorView): boolean {
  const selection = selectedRange(view);
  if (selection.from !== selection.to) return false;
  const result = deleteMarkdownMarkupBackwardText(view.state.doc.toString(), selection.from);
  if (!result) return false;
  return dispatchResult(view, result);
}

export function toggleTaskCheckboxAtLine(view: EditorView, lineFrom: number): boolean {
  const result = toggleTaskCheckboxAtLineText(view.state.doc.toString(), lineFrom);
  if (!result) return false;
  return dispatchResult(view, result);
}
