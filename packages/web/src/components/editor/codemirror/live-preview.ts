import { EditorState, RangeSetBuilder, StateField, type Transaction } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { toggleTaskCheckboxAtLine } from "./commands";
import { createTableElement } from "./table-render";
import {
  didActiveLinesChange,
  isCompositionTransaction,
  shouldHideRange,
  shouldRenderIndentWidget,
  shouldRenderWidget,
} from "./stability";

class LinkWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly url: string,
    private readonly onActivate: (url: string) => void,
  ) {
    super();
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
  constructor(
    private readonly label: string,
    private readonly reference: string,
    private readonly onActivate: (url: string) => void,
  ) {
    super();
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
  constructor(
    private readonly checked: boolean,
    private readonly lineFrom: number,
  ) {
    super();
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
  constructor(private readonly orderedLabel?: string) {
    super();
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
  constructor(private readonly depth: number) {
    super();
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
  constructor(
    private readonly markdown: string,
    private readonly currentPath: string,
    private readonly from: number,
    private readonly onLinkActivate: (url: string) => void,
    private readonly onActivateTable: (pos: number) => void,
  ) {
    super();
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

function hideRangeIfSafe(builder: RangeSetBuilder<Decoration>, state: EditorState, from: number, to: number): void {
  if (!shouldHideRange(state, from, to)) return;
  builder.add(from, to, Decoration.replace({}));
}

function widgetRangeIfSafe(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  from: number,
  to: number,
  widget: WidgetType,
): void {
  if (!shouldRenderWidget(state, from, to)) return;
  builder.add(from, to, Decoration.replace({ widget }));
}

function indentRangeIfSafe(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  from: number,
  to: number,
  depth: number,
): void {
  if (!shouldRenderIndentWidget(state, from, to)) return;
  builder.add(from, to, Decoration.replace({ widget: new IndentWidget(depth) }));
}

function indentDepth(spaces: string): number {
  return Math.max(0, spaces.length);
}

function addMarkForSelectionIntersections(
  builder: RangeSetBuilder<Decoration>,
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
      builder.add(markFrom, markTo, Decoration.mark({ class: className }));
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
  const builder = new RangeSetBuilder<Decoration>();
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
      builder.add(line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--code-fence" } }));
      addMarkForSelectionIntersections(builder, state, line.from, line.to, "cm-md-code-selection");
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      builder.add(line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--code" } }));
      addMarkForSelectionIntersections(builder, state, line.from, line.to, "cm-md-code-selection");
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
        builder.add(tableStart, tableEnd, Decoration.replace({
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
          builder.add(currentLine.from, currentLine.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--table" } }));
        }
      }
      lineNumber = tableEndLineNumber;
      continue;
    }

    if (/^\s*((?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})\s*$/.test(text)) {
      builder.add(line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--hr" } }));
      widgetRangeIfSafe(builder, state, line.from, line.to, new HorizontalRuleWidget());
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(text);
    if (heading) {
      const prefixLength = heading[1].length + 1;
      builder.add(line.from, line.from, Decoration.line({ attributes: { class: `cm-md-line cm-md-line--heading cm-md-line--h${heading[1].length}` } }));
      hideRangeIfSafe(builder, state, line.from, line.from + prefixLength);
      builder.add(line.from + prefixLength, line.to, Decoration.mark({ class: "cm-md-inline cm-md-inline--heading" }));
    }

    const quote = /^(>\s+)/.exec(text);
    if (quote) {
      builder.add(line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--quote" } }));
      hideRangeIfSafe(builder, state, line.from, line.from + quote[1].length);
    }

    const task = /^(\s*)-\s\[([ xX])\]\s+/.exec(text);
    if (task) {
      builder.add(line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--task" } }));
      if (task[1].length > 0) {
        indentRangeIfSafe(builder, state, line.from, line.from + task[1].length, indentDepth(task[1]));
      }
      const markerFrom = line.from + task[1].length;
      const markerTo = line.from + task[0].length;
      widgetRangeIfSafe(
        builder,
        state,
        markerFrom,
        markerTo,
        new TaskCheckboxWidget(task[2].trim().toLowerCase() === "x", line.from),
      );
    } else {
      const bullet = /^(\s*)([-+*])\s+/.exec(text);
      if (bullet) {
        builder.add(line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--list cm-md-line--bullet" } }));
        if (bullet[1].length > 0) {
          indentRangeIfSafe(builder, state, line.from, line.from + bullet[1].length, indentDepth(bullet[1]));
        }
        const markerFrom = line.from + bullet[1].length;
        const markerTo = markerFrom + bullet[0].length - bullet[1].length;
        widgetRangeIfSafe(builder, state, markerFrom, markerTo, new BulletListWidget());
      } else {
        const ordered = /^(\s*)(\d+\.)\s+/.exec(text);
        if (ordered) {
          builder.add(line.from, line.from, Decoration.line({ attributes: { class: "cm-md-line cm-md-line--list cm-md-line--ordered" } }));
          if (ordered[1].length > 0) {
            indentRangeIfSafe(builder, state, line.from, line.from + ordered[1].length, indentDepth(ordered[1]));
          }
          const markerFrom = line.from + ordered[1].length;
          const markerTo = markerFrom + ordered[0].length - ordered[1].length;
          widgetRangeIfSafe(builder, state, markerFrom, markerTo, new BulletListWidget(ordered[2]));
        }
      }
    }

    for (const match of text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
      const start = line.from + (match.index ?? 0);
      hideRangeIfSafe(builder, state, start, start + 2);
      builder.add(start + 2, start + 2 + match[1].length, Decoration.mark({ class: "cm-md-inline cm-md-inline--strong" }));
      hideRangeIfSafe(builder, state, start + 2 + match[1].length, start + 4 + match[1].length);
    }

    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const start = line.from + (match.index ?? 0);
      hideRangeIfSafe(builder, state, start, start + 1);
      builder.add(start + 1, start + 1 + match[1].length, Decoration.mark({ class: "cm-md-inline cm-md-inline--code" }));
      hideRangeIfSafe(builder, state, start + 1 + match[1].length, start + 2 + match[1].length);
    }

    for (const match of text.matchAll(/~~([^~\n]+)~~/g)) {
      const start = line.from + (match.index ?? 0);
      hideRangeIfSafe(builder, state, start, start + 2);
      builder.add(start + 2, start + 2 + match[1].length, Decoration.mark({ class: "cm-md-inline cm-md-inline--strike" }));
      hideRangeIfSafe(builder, state, start + 2 + match[1].length, start + 4 + match[1].length);
    }

    for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
      const start = line.from + (match.index ?? 0);
      const label = match[1];
      const end = start + match[0].length;
      widgetRangeIfSafe(builder, state, start, end, new LinkWidget(label, match[2], options.onLinkActivate));
    }

    for (const match of text.matchAll(/(^|[\s([{"'])@([\p{Letter}\p{Number}./_-]+(?:#[\p{Letter}\p{Number}./_-]+)?)/gu)) {
      const prefix = match[1] ?? "";
      const start = line.from + (match.index ?? 0) + prefix.length;
      const reference = `@${match[2]}`;
      const end = start + reference.length;
      widgetRangeIfSafe(builder, state, start, end, new MentionWidget(match[2], reference, options.onLinkActivate));
    }
  }

  return builder.finish();
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
