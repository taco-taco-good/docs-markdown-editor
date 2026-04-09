import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { resolveEditorReferenceTarget, resolveMarkdownLinkTarget } from "./navigation.js";

export interface ParsedTable {
  header: string[];
  alignments: Array<"" | "left" | "center" | "right">;
  rows: string[][];
}

const remarkTableProcessor = unified().use(remarkParse).use(remarkGfm);

interface MdastNode {
  type?: string;
  align?: Array<"left" | "center" | "right" | null>;
  children?: MdastNode[];
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

function splitTableRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return body.split("|").map((cell) => cell.trim());
}

function parseAlignment(cell: string): "" | "left" | "center" | "right" {
  const trimmed = cell.trim();
  if (!/^:?-{3,}:?$/.test(trimmed)) return "";
  const left = trimmed.startsWith(":");
  const right = trimmed.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return "";
}

function extractNodeSource(block: string, node: MdastNode): string {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start === "number" && typeof end === "number" && end >= start) {
    return block.slice(start, end).trim();
  }
  return "";
}

function extractCellSource(block: string, cell: MdastNode): string {
  const children = cell.children ?? [];
  if (children.length === 0) return "";
  const first = children[0];
  const last = children[children.length - 1];
  const start = first.position?.start?.offset;
  const end = last.position?.end?.offset;
  if (typeof start === "number" && typeof end === "number" && end >= start) {
    return block.slice(start, end).trim();
  }
  return children.map((child) => extractNodeSource(block, child)).join("").trim();
}

function parseMarkdownTableWithRemark(block: string): ParsedTable | null {
  const tree = remarkTableProcessor.parse(block) as MdastNode;
  const table = tree.children?.find((child) => child.type === "table");
  if (!table || !table.children || table.children.length === 0) return null;

  const [headerRow, ...bodyRows] = table.children;
  const headerCells = headerRow.children ?? [];
  if (headerCells.length === 0) return null;

  const header = headerCells.map((cell) => extractCellSource(block, cell));
  const alignments = (table.align ?? header.map(() => null)).map((alignment) => alignment ?? "");
  const rows = bodyRows.map((row) => (row.children ?? []).map((cell) => extractCellSource(block, cell)));
  return { header, alignments, rows };
}

function parseMarkdownTableLegacy(block: string): ParsedTable | null {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return null;
  const header = splitTableRow(lines[0]);
  const delimiter = splitTableRow(lines[1]);
  if (header.length === 0 || header.length !== delimiter.length) return null;

  const alignments = delimiter.map(parseAlignment);
  if (alignments.some((value, index) => !value && !/^[-:\s]+$/.test(delimiter[index]))) {
    return null;
  }

  const rows = lines.slice(2).map(splitTableRow).filter((row) => row.length > 0);
  return { header, alignments, rows };
}

export function parseMarkdownTable(block: string): ParsedTable | null {
  return parseMarkdownTableWithRemark(block) ?? parseMarkdownTableLegacy(block);
}

function renderInlineMarkdown(
  value: string,
  currentPath: string,
  onLinkActivate: (url: string) => void,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const mentionPattern = /(^|[\s([{"'])@([\p{Letter}\p{Number}./_-]+(?:#[\p{Letter}\p{Number}./_-]+)?)/gu;
  let cursor = 0;
  const matches: Array<
    | { kind: "link"; index: number; full: string; label: string; target: string }
    | { kind: "mention"; index: number; full: string; label: string; target: string }
  > = [];

  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkPattern.exec(value)) !== null) {
    matches.push({
      kind: "link",
      index: linkMatch.index,
      full: linkMatch[0],
      label: linkMatch[1],
      target: linkMatch[2],
    });
  }

  let mentionMatch: RegExpExecArray | null;
  while ((mentionMatch = mentionPattern.exec(value)) !== null) {
    const prefix = mentionMatch[1] ?? "";
    matches.push({
      kind: "mention",
      index: mentionMatch.index + prefix.length,
      full: `@${mentionMatch[2]}`,
      label: `@${mentionMatch[2]}`,
      target: `@${mentionMatch[2]}`,
    });
  }

  matches.sort((left, right) => left.index - right.index);

  for (const match of matches) {
    if (match.index < cursor) continue;
    if (match.index > cursor) {
      fragment.append(document.createTextNode(value.slice(cursor, match.index)));
    }

    const anchor = document.createElement("a");
    anchor.className = match.kind === "mention" ? "cm-md-mention-widget" : "cm-md-link-widget";
    anchor.textContent = match.label;
    anchor.href = match.target;
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onLinkActivate(match.target);
    });

    const target = match.kind === "mention"
      ? resolveEditorReferenceTarget(currentPath, match.target)
      : resolveMarkdownLinkTarget(currentPath, match.target);
    if (target?.type === "external") {
      anchor.target = "_blank";
      anchor.rel = "noreferrer noopener";
    } else if (target?.type === "internal") {
      anchor.dataset.internalPath = target.path;
      if (target.anchor) {
        anchor.dataset.anchor = target.anchor;
      }
    }

    fragment.append(anchor);
    cursor = match.index + match.full.length;
  }

  if (cursor < value.length) {
    fragment.append(document.createTextNode(value.slice(cursor)));
  }

  return fragment;
}

export function createTableElement(options: {
  markdown: string;
  currentPath: string;
  onLinkActivate: (url: string) => void;
  onActivateTable?: () => void;
}): HTMLElement {
  const parsed = parseMarkdownTable(options.markdown);
  const wrapper = document.createElement("div");
  wrapper.className = "cm-md-table-widget";

  if (!parsed) {
    wrapper.textContent = options.markdown;
    return wrapper;
  }

  const table = document.createElement("table");
  table.className = "cm-md-table-widget__table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  parsed.header.forEach((cell, index) => {
    const th = document.createElement("th");
    const alignment = parsed.alignments[index];
    if (alignment) {
      th.dataset.align = alignment;
    }
    th.append(renderInlineMarkdown(cell, options.currentPath, options.onLinkActivate));
    headRow.append(th);
  });
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  parsed.rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell, index) => {
      const td = document.createElement("td");
      const alignment = parsed.alignments[index];
      if (alignment) {
        td.dataset.align = alignment;
      }
      td.append(renderInlineMarkdown(cell, options.currentPath, options.onLinkActivate));
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  wrapper.append(table);

  wrapper.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("a")) return;
    event.preventDefault();
    event.stopPropagation();
    options.onActivateTable?.();
  });

  return wrapper;
}
