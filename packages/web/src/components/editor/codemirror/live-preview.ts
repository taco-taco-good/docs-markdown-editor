import { EditorState, StateField, type Range, type Transaction } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { toggleTaskCheckboxAtLine } from "./commands.js";
import { createTableElement } from "./table-render.js";
import {
  didActiveLinesChange,
  isCompositionTransaction,
  shouldHideRange,
  shouldRenderIndentWidget,
  shouldRenderWidget,
} from "./stability.js";
import { collectProtectedRanges, rangesOverlap } from "./live-preview-ranges.js";

class LinkWidget extends WidgetType {
  private readonly label: string;
  private readonly url: string;
  private readonly onActivate: (url: string) => void;

  constructor(
    label: string,
    url: string,
    onActivate: (url: string) => void,
  ) {
    super();
    this.label = label;
    this.url = url;
    this.onActivate = onActivate;
  }

  eq(other: LinkWidget): boolean {
    return other.label === this.label && other.url === this.url;
  }

  toDOM(): HTMLElement {
    const anchor = document.createElement("a");
    anchor.className = "cm-md-link-widget";
    anchor.textContent = this.label;
    anchor.href = this.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.draggable = false;
    anchor.setAttribute("contenteditable", "false");
    const swallowPointer = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    anchor.addEventListener("pointerdown", swallowPointer);
    anchor.addEventListener("mousedown", swallowPointer);
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onActivate(this.url);
    });
    return anchor;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class MentionWidget extends WidgetType {
  private readonly label: string;
  private readonly reference: string;
  private readonly onActivate: (url: string) => void;

  constructor(
    label: string,
    reference: string,
    onActivate: (url: string) => void,
  ) {
    super();
    this.label = label;
    this.reference = reference;
    this.onActivate = onActivate;
  }

  eq(other: MentionWidget): boolean {
    return other.label === this.label && other.reference === this.reference;
  }

  toDOM(): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-md-mention-widget";
    button.textContent = `@${this.label}`;
    button.draggable = false;
    button.setAttribute("contenteditable", "false");
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onActivate(this.reference);
    });
    return button;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class TaskCheckboxWidget extends WidgetType {
  private readonly checked: boolean;
  private readonly lineFrom: number;

  constructor(
    checked: boolean,
    lineFrom: number,
  ) {
    super();
    this.checked = checked;
    this.lineFrom = lineFrom;
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked && other.lineFrom === this.lineFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-md-task-toggle";
    button.dataset.checked = this.checked ? "true" : "false";
    button.setAttribute("aria-label", this.checked ? "할 일 완료 취소" : "할 일 완료");
    button.draggable = false;
    button.setAttribute("contenteditable", "false");
    const toggleFromWidget = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleTaskCheckboxAtLine(view, this.lineFrom);
    };
    button.addEventListener("pointerdown", toggleFromWidget);
    button.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        toggleFromWidget(event);
      }
    });
    return button;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const divider = document.createElement("div");
    divider.className = "cm-md-hr-widget";
    return divider;
  }
}

class BulletListWidget extends WidgetType {
  private readonly orderedLabel?: string;

  constructor(orderedLabel?: string) {
    super();
    this.orderedLabel = orderedLabel;
  }

  eq(other: BulletListWidget): boolean {
    return other.orderedLabel === this.orderedLabel;
  }

  toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = "cm-md-list-widget";
    marker.dataset.ordered = this.orderedLabel ? "true" : "false";
    marker.textContent = this.orderedLabel ?? "•";
    marker.draggable = false;
    marker.setAttribute("aria-hidden", "true");
    marker.setAttribute("contenteditable", "false");
    return marker;
  }
}

class IndentWidget extends WidgetType {
  private readonly depth: number;

  constructor(depth: number) {
    super();
    this.depth = depth;
  }

  eq(other: IndentWidget): boolean {
    return other.depth === this.depth;
  }

  toDOM(): HTMLElement {
    const spacer = document.createElement("span");
    spacer.className = "cm-md-indent-widget";
    spacer.style.setProperty("--cm-md-indent-size", String(Math.max(1, this.depth)));
    spacer.setAttribute("aria-hidden", "true");
    spacer.setAttribute("contenteditable", "false");
    return spacer;
  }
}

class TableWidget extends WidgetType {
  private readonly markdown: string;
  private readonly currentPath: string;
  private readonly from: number;
  private readonly onLinkActivate: (url: string) => void;
  private readonly onActivateTable: (pos: number) => void;

  constructor(
    markdown: string,
    currentPath: string,
    from: number,
    onLinkActivate: (url: string) => void,
    onActivateTable: (pos: number) => void,
  ) {
    super();
    this.markdown = markdown;
    this.currentPath = currentPath;
    this.from = from;
    this.onLinkActivate = onLinkActivate;
    this.onActivateTable = onActivateTable;
  }

  eq(other: TableWidget): boolean {
    return (
      other.markdown === this.markdown &&
      other.currentPath === this.currentPath &&
      other.from === this.from
    );
  }

  toDOM(): HTMLElement {
    return createTableElement({
      markdown: this.markdown,
      currentPath: this.currentPath,
      onLinkActivate: this.onLinkActivate,
      onActivateTable: () => this.onActivateTable(this.from),
    });
  }
}

function pushDecoration(
  ranges: Range<Decoration>[],
  from: number,
  to: number,
  decoration: Decoration,
): void {
  ranges.push(decoration.range(from, to));
}

function hideRangeIfSafe(ranges: Range<Decoration>[], state: EditorState, from: number, to: number): void {
  if (!shouldHideRange(state, from, to)) return;
  pushDecoration(ranges, from, to, Decoration.replace({}));
}

function widgetRangeIfSafe(
  ranges: Range<Decoration>[],
  state: EditorState,
  from: number,
  to: number,
  widget: WidgetType,
): void {
  if (!shouldRenderWidget(state, from, to)) return;
  pushDecoration(ranges, from, to, Decoration.replace({ widget }));
}

function indentRangeIfSafe(
  ranges: Range<Decoration>[],
  state: EditorState,
  from: number,
  to: number,
  depth: number,
): void {
  if (!shouldRenderIndentWidget(state, from, to)) return;
  pushDecoration(ranges, from, to, Decoration.replace({ widget: new IndentWidget(depth) }));
}

function indentDepth(spaces: string): number {
  return Math.max(0, spaces.length);
}

function addMarkForSelectionIntersections(
  ranges: Range<Decoration>[],
  state: EditorState,
  from: number,
  to: number,
  className: string,
): void {
  for (const range of state.selection.ranges) {
    if (range.empty) continue;
    const markFrom = Math.max(from, range.from);
    const markTo = Math.min(to, range.to);
    if (markFrom < markTo) {
      pushDecoration(ranges, markFrom, markTo, Decoration.mark({ class: className }));
    }
  }
}

function isTableRowLine(text: string): boolean {
  return /^\|.+\|\s*$/.test(text);
}

function isTableDelimiterLine(text: string): boolean {
  const body = text.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = body.split("|").map((cell) => cell.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function buildDecorations(
  state: EditorState,
  options: {
    currentPath: string;
    onLinkActivate: (url: string) => void;
    onActivateTable: (pos: number) => void;
  },
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  let inCodeBlock = false;

  // Detect YAML frontmatter: starts with --- on line 1, ends with --- or ...
  let inFrontmatter = false;
  let frontmatterChecked = false;

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const text = line.text;

    if (!frontmatterChecked) {
      frontmatterChecked = true;
      if (text === "---") {
        inFrontmatter = true;
        continue;
      }
    } else if (inFrontmatter) {
      if (text === "---" || text === "...") {
        inFrontmatter = false;
      }
      continue;
    }

    const fenceMatch = /^(```|~~~)(.*)$/.exec(text);

    if (fenceMatch) {
      pushDecoration(ranges, line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--code-fence" } }));
      addMarkForSelectionIntersections(ranges, state, line.from, line.to, "cm-md-code-selection");
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      pushDecoration(ranges, line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--code" } }));
      addMarkForSelectionIntersections(ranges, state, line.from, line.to, "cm-md-code-selection");
      continue;
    }

    const nextLine = lineNumber < state.doc.lines ? state.doc.line(lineNumber + 1) : null;
    if (isTableRowLine(text) && nextLine && isTableDelimiterLine(nextLine.text)) {
      let tableEndLineNumber = lineNumber + 1;
      while (tableEndLineNumber + 1 <= state.doc.lines) {
        const candidate = state.doc.line(tableEndLineNumber + 1);
        if (!isTableRowLine(candidate.text)) break;
        tableEndLineNumber += 1;
      }

      const tableStart = line.from;
      const tableEnd = state.doc.line(tableEndLineNumber).to;
      const tableMarkdown = state.sliceDoc(tableStart, tableEnd);
      if (shouldRenderWidget(state, tableStart, tableEnd)) {
        pushDecoration(ranges, tableStart, tableEnd, Decoration.replace({
          widget: new TableWidget(
            tableMarkdown,
            options.currentPath,
            tableStart,
            options.onLinkActivate,
            options.onActivateTable,
          ),
          block: true,
        }));
      } else {
        for (let tableLine = lineNumber; tableLine <= tableEndLineNumber; tableLine += 1) {
          const currentLine = state.doc.line(tableLine);
          pushDecoration(ranges, currentLine.from, currentLine.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--table" } }));
        }
      }
      lineNumber = tableEndLineNumber;
      continue;
    }

    if (/^\s*((?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})\s*$/.test(text)) {
      pushDecoration(ranges, line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--hr" } }));
      widgetRangeIfSafe(ranges, state, line.from, line.to, new HorizontalRuleWidget());
      continue;
    }

    const protectedRanges = collectProtectedRanges(text, line.from);

    const heading = /^(#{1,6})\s+(.+)$/.exec(text);
    if (heading) {
      const prefixLength = heading[1].length + 1;
      pushDecoration(ranges, line.from, line.from, Decoration.line({ attributes: { class: `cm-md-line cm-md-line--heading cm-md-line--h${heading[1].length}` } }));
      hideRangeIfSafe(ranges, state, line.from, line.from + prefixLength);
      pushDecoration(ranges, line.from + prefixLength, line.to, Decoration.mark({ class: "cm-md-inline cm-md-inline--heading" }));
      protectedRanges.push({ from: line.from + prefixLength, to: line.to });
    }

    const quote = /^(>\s+)/.exec(text);
    if (quote) {
      pushDecoration(ranges, line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--quote" } }));
      hideRangeIfSafe(ranges, state, line.from, line.from + quote[1].length);
    }

    const task = /^(\s*)-\s\[([ xX])\]\s+/.exec(text);
    if (task) {
      pushDecoration(ranges, line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--task" } }));
      if (task[1].length > 0) {
        indentRangeIfSafe(ranges, state, line.from, line.from + task[1].length, indentDepth(task[1]));
      }
      const markerFrom = line.from + task[1].length;
      const markerTo = line.from + task[0].length;
      widgetRangeIfSafe(
        ranges,
        state,
        markerFrom,
        markerTo,
        new TaskCheckboxWidget(task[2].trim().toLowerCase() === "x", line.from),
      );
    } else {
      const bullet = /^(\s*)([-+*])\s+/.exec(text);
      if (bullet) {
        pushDecoration(ranges, line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--list cm-md-line--bullet" } }));
        if (bullet[1].length > 0) {
          indentRangeIfSafe(ranges, state, line.from, line.from + bullet[1].length, indentDepth(bullet[1]));
        }
        const markerFrom = line.from + bullet[1].length;
        const markerTo = markerFrom + bullet[0].length - bullet[1].length;
        widgetRangeIfSafe(ranges, state, markerFrom, markerTo, new BulletListWidget());
      } else {
        const ordered = /^(\s*)(\d+\.)\s+/.exec(text);
        if (ordered) {
          pushDecoration(ranges, line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--list cm-md-line--ordered" } }));
          if (ordered[1].length > 0) {
            indentRangeIfSafe(ranges, state, line.from, line.from + ordered[1].length, indentDepth(ordered[1]));
          }
          const markerFrom = line.from + ordered[1].length;
          const markerTo = markerFrom + ordered[0].length - ordered[1].length;
          widgetRangeIfSafe(ranges, state, markerFrom, markerTo, new BulletListWidget(ordered[2]));
        }
      }
    }

    for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
      const start = line.from + (match.index ?? 0);
      const end = start + match[0].length;
      widgetRangeIfSafe(ranges, state, start, end, new LinkWidget(match[1], match[2], options.onLinkActivate));
    }

    for (const match of text.matchAll(/(^|[\s([{"'])@([\p{Letter}\p{Number}./_-]+(?:#[\p{Letter}\p{Number}./_-]+)?)/gu)) {
      const prefix = match[1] ?? "";
      const start = line.from + (match.index ?? 0) + prefix.length;
      const reference = `@${match[2]}`;
      const end = start + reference.length;
      widgetRangeIfSafe(ranges, state, start, end, new MentionWidget(match[2], reference, options.onLinkActivate));
    }

    for (const match of text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
      const start = line.from + (match.index ?? 0);
      const end = start + match[0].length;
      if (rangesOverlap(start, end, protectedRanges)) continue;
      hideRangeIfSafe(ranges, state, start, start + 2);
      pushDecoration(ranges, start + 2, start + 2 + match[1].length, Decoration.mark({ class: "cm-md-inline cm-md-inline--strong" }));
      hideRangeIfSafe(ranges, state, start + 2 + match[1].length, start + 4 + match[1].length);
    }

    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const start = line.from + (match.index ?? 0);
      const end = start + match[0].length;
      if (rangesOverlap(start, end, protectedRanges)) continue;
      hideRangeIfSafe(ranges, state, start, start + 1);
      pushDecoration(ranges, start + 1, start + 1 + match[1].length, Decoration.mark({ class: "cm-md-inline cm-md-inline--code" }));
      hideRangeIfSafe(ranges, state, start + 1 + match[1].length, start + 2 + match[1].length);
    }

    for (const match of text.matchAll(/~~([^~\n]+)~~/g)) {
      const start = line.from + (match.index ?? 0);
      const end = start + match[0].length;
      if (rangesOverlap(start, end, protectedRanges)) continue;
      hideRangeIfSafe(ranges, state, start, start + 2);
      pushDecoration(ranges, start + 2, start + 2 + match[1].length, Decoration.mark({ class: "cm-md-inline cm-md-inline--strike" }));
      hideRangeIfSafe(ranges, state, start + 2 + match[1].length, start + 4 + match[1].length);
    }
  }

  return Decoration.set(ranges, true);
}

export function markdownLivePreview(options: {
  currentPath: string;
  onLinkActivate: (url: string) => void;
  onActivateTable: (pos: number) => void;
}) {
  return StateField.define<DecorationSet>({
    create(state: EditorState) {
      return buildDecorations(state, options);
    },
    update(value: DecorationSet, tr: Transaction) {
      if (tr.docChanged && isCompositionTransaction(tr)) {
        return value.map(tr.changes);
      }
      const activeLinesChanged = didActiveLinesChange(tr.startState, tr.state);
      if (!tr.docChanged && !activeLinesChanged) {
        return value;
      }
      return buildDecorations(tr.state, options);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
