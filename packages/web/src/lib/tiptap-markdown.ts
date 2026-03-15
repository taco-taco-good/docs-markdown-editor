import MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token.mjs";
import {
  MarkdownParser,
  MarkdownSerializer,
  type MarkdownSerializerState,
} from "prosemirror-markdown";
import type { Mark, Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

const parserCache = new WeakMap<Schema, MarkdownParser>();
const serializerCache = new WeakMap<Schema, MarkdownSerializer>();
type MarkdownStateWithAutolink = MarkdownSerializerState & { inAutolink?: boolean };
const EMPTY_PARAGRAPH_SENTINEL = "\u00a0";

function findListItemClose(tokens: Array<{ type: string }>, startIndex: number): number {
  let depth = 1;
  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    if (tokens[index].type === "list_item_open" || tokens[index].type === "task_item_open") {
      depth += 1;
    }
    if (tokens[index].type === "list_item_close" || tokens[index].type === "task_item_close") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function stripTaskPrefix(inlineToken: { content: string; children?: Array<{ type: string; content: string }> | null }): void {
  inlineToken.content = inlineToken.content.replace(/^\[([ xX])\]\s+/, "");
  if (!inlineToken.children?.length) return;
  const [firstChild] = inlineToken.children;
  if (firstChild?.type === "text") {
    firstChild.content = firstChild.content.replace(/^\[([ xX])\]\s+/, "");
    if (!firstChild.content) {
      inlineToken.children = inlineToken.children.slice(1);
    }
  }
}

function createTokenizer(): MarkdownIt {
  const tokenizer = MarkdownIt("default", { html: false, linkify: true });

  tokenizer.core.ruler.after("inline", "docs-task-lists", (state) => {
    const taskLists: Array<{ index: number; itemCount: number; taskCount: number }> = [];
    const normalizedTokens: Token[] = [];

    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];

      if (
        (token.type === "th_open" || token.type === "td_open") &&
        state.tokens[index + 1]?.type === "inline"
      ) {
        normalizedTokens.push(token);
        normalizedTokens.push(new Token("paragraph_open", "p", 1));
        normalizedTokens.push(state.tokens[index + 1]);
        normalizedTokens.push(new Token("paragraph_close", "p", -1));
        index += 1;
        continue;
      }

      normalizedTokens.push(token);
    }

    state.tokens = normalizedTokens;

    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];

      if (token.type === "bullet_list_open") {
        taskLists.push({ index, itemCount: 0, taskCount: 0 });
        continue;
      }

      if (token.type === "bullet_list_close") {
        const currentList = taskLists.pop();
        if (currentList && currentList.itemCount > 0 && currentList.taskCount === currentList.itemCount) {
          state.tokens[currentList.index].type = "task_list_open";
          token.type = "task_list_close";
        }
        continue;
      }

      if (token.type !== "list_item_open" || taskLists.length === 0) {
        continue;
      }

      const currentList = taskLists[taskLists.length - 1];
      currentList.itemCount += 1;

      const inlineToken = state.tokens[index + 2];
      const match = inlineToken?.type === "inline" ? /^\[([ xX])\]\s+/.exec(inlineToken.content) : null;
      if (!match) {
        continue;
      }

      currentList.taskCount += 1;
      token.type = "task_item_open";
      token.meta = { ...(token.meta ?? {}), checked: match[1].toLowerCase() === "x" };
      stripTaskPrefix(inlineToken);

      const closeIndex = findListItemClose(state.tokens, index);
      if (closeIndex >= 0) {
        state.tokens[closeIndex].type = "task_item_close";
      }
    }
  });

  return tokenizer;
}

function listIsTight(tokens: Array<{ type: string; hidden?: boolean }>, index: number): boolean {
  let cursor = index;
  while (++cursor < tokens.length) {
    if (tokens[cursor].type !== "list_item_open") {
      return Boolean(tokens[cursor].hidden);
    }
  }
  return false;
}

function createParser(schema: Schema): MarkdownParser {
  const cached = parserCache.get(schema);
  if (cached) return cached;

  const tokenizer = createTokenizer();
  const parser = new MarkdownParser(schema, tokenizer, {
    blockquote: { block: "blockquote" },
    paragraph: { block: "paragraph" },
    list_item: { block: "listItem" },
    task_item: {
      block: "taskItem",
      getAttrs: (token) => ({ checked: Boolean(token.meta?.checked) }),
    },
    bullet_list: {
      block: "bulletList",
      getAttrs: (_token, tokens, index) => ({ tight: listIsTight(tokens, index) }),
    },
    task_list: { block: "taskList" },
    ordered_list: {
      block: "orderedList",
      getAttrs: (token, tokens, index) => ({
        start: Number(token.attrGet("start") ?? "1") || 1,
        tight: listIsTight(tokens, index),
      }),
    },
    heading: { block: "heading", getAttrs: (token) => ({ level: Number(token.tag.slice(1)) }) },
    code_block: { block: "codeBlock", noCloseToken: true },
    fence: {
      block: "codeBlock",
      getAttrs: (token) => ({ language: token.info || null }),
      noCloseToken: true,
    },
    hr: { node: "horizontalRule" },
    table: { block: "table" },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: "tableRow" },
    th: { block: "tableHeader" },
    td: { block: "tableCell" },
    image: {
      node: "image",
      getAttrs: (token) => ({
        src: token.attrGet("src"),
        title: token.attrGet("title") || null,
        alt: token.children?.[0]?.content || null,
      }),
    },
    hardbreak: { node: "hardBreak" },
    em: { mark: "italic" },
    strong: { mark: "bold" },
    s: { mark: "strike" },
    link: {
      mark: "link",
      getAttrs: (token) => ({
        href: token.attrGet("href"),
        title: token.attrGet("title") || null,
      }),
    },
    code_inline: { mark: "code", noCloseToken: true },
  });

  parserCache.set(schema, parser);
  return parser;
}

function normalizeParsedNode(schema: Schema, node: ProseMirrorNode): ProseMirrorNode {
  const content = [];
  for (let index = 0; index < node.childCount; index += 1) {
    content.push(normalizeParsedNode(schema, node.child(index)));
  }

  if (node.type.name === "paragraph" && node.textContent === EMPTY_PARAGRAPH_SENTINEL) {
    return schema.nodes.paragraph.create(node.attrs);
  }

  if (node.isText) {
    return node;
  }

  if (!content.length) {
    return node.type.create(node.attrs, undefined, node.marks);
  }

  return node.type.create(node.attrs, content, node.marks);
}

function isPlainUrl(mark: Mark, parent: ProseMirrorNode, index: number): boolean {
  if (mark.attrs.title || !/^\w+:/.test(mark.attrs.href)) {
    return false;
  }

  const content = parent.child(index);
  if (!content.isText || content.text !== mark.attrs.href || content.marks[content.marks.length - 1] !== mark) {
    return false;
  }

  return index === parent.childCount - 1 || !mark.isInSet(parent.child(index + 1).marks);
}

function backticksFor(node: ProseMirrorNode, side: number): string {
  const matches = node.isText ? node.text?.match(/`+/g) ?? [] : [];
  const len = matches.reduce((max, match) => Math.max(max, match.length), 0);
  let result = len > 0 && side > 0 ? " `" : "`";
  result += "`".repeat(len);
  if (len > 0 && side < 0) {
    result += " ";
  }
  return result;
}

function serializeTableCell(schema: Schema, cell: ProseMirrorNode): string {
  const fragmentDoc = schema.topNodeType.createAndFill(null, cell.content);
  const rendered = fragmentDoc ? createSerializer(schema).serialize(fragmentDoc).trim() : "";
  return rendered.replace(/\|/g, "\\|").replace(/\n+/g, "<br>") || " ";
}

function createSerializer(schema: Schema): MarkdownSerializer {
  const cached = serializerCache.get(schema);
  if (cached) return cached;

  const serializer = new MarkdownSerializer(
    {
      blockquote(state, node) {
        state.wrapBlock("> ", null, node, () => state.renderContent(node));
      },
      bulletList(state, node) {
        state.renderList(node, "  ", () => "- ");
      },
      codeBlock(state, node) {
        const backticks = node.textContent.match(/`{3,}/gm);
        const fence = backticks ? `${backticks.sort().slice(-1)[0]}\`` : "```";
        state.write(`${fence}${node.attrs.language ?? ""}\n`);
        state.text(node.textContent, false);
        state.write("\n");
        state.write(fence);
        state.closeBlock(node);
      },
      hardBreak(state, node, parent, index) {
        for (let cursor = index + 1; cursor < parent.childCount; cursor += 1) {
          if (parent.child(cursor).type !== node.type) {
            state.write("\\\n");
            return;
          }
        }
      },
      heading(state, node) {
        state.write(`${state.repeat("#", node.attrs.level)} `);
        state.renderInline(node, false);
        state.closeBlock(node);
      },
      horizontalRule(state, node) {
        state.write(node.attrs.markup || "---");
        state.closeBlock(node);
      },
      image(state, node) {
        state.write(
          `![${state.esc(node.attrs.alt || "")}](${String(node.attrs.src).replace(/[\(\)]/g, "\\$&")}${
            node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : ""
          })`,
        );
      },
      listItem(state, node) {
        state.renderContent(node);
      },
      orderedList(state, node) {
        const start = node.attrs.start || 1;
        const maxWidth = String(start + node.childCount - 1).length;
        const space = state.repeat(" ", maxWidth + 2);
        state.renderList(node, space, (index) => {
          const n = String(start + index);
          return `${state.repeat(" ", maxWidth - n.length)}${n}. `;
        });
      },
      paragraph(state, node) {
        if (node.childCount === 0) {
          state.write(EMPTY_PARAGRAPH_SENTINEL);
          state.closeBlock(node);
          return;
        }
        state.renderInline(node);
        state.closeBlock(node);
      },
      table(state, node) {
        const rows = Array.from({ length: node.childCount }, (_, index) => node.child(index));
        if (!rows.length) {
          state.closeBlock(node);
          return;
        }

        const renderRow = (row: ProseMirrorNode) =>
          `| ${Array.from({ length: row.childCount }, (_, index) => serializeTableCell(schema, row.child(index))).join(" | ")} |`;

        state.write(renderRow(rows[0]));
        state.write("\n");
        state.write(`| ${Array.from({ length: rows[0].childCount }, () => "---").join(" | ")} |`);
        for (const row of rows.slice(1)) {
          state.write("\n");
          state.write(renderRow(row));
        }
        state.closeBlock(node);
      },
      tableCell() {},
      tableHeader() {},
      tableRow() {},
      taskList(state, node) {
        state.renderList(node, "  ", (index) => (node.child(index).attrs.checked ? "- [x] " : "- [ ] "));
      },
      taskItem(state, node) {
        state.renderContent(node);
      },
      text(state, node) {
        state.text(node.text ?? "", !(state as MarkdownStateWithAutolink).inAutolink);
      },
    },
    {
      bold: { open: "**", close: "**", mixable: true, expelEnclosingWhitespace: true },
      code: {
        open: (_state: MarkdownSerializerState, _mark: Mark, parent: ProseMirrorNode, index: number) =>
          backticksFor(parent.child(index), -1),
        close: (_state: MarkdownSerializerState, _mark: Mark, parent: ProseMirrorNode, index: number) =>
          backticksFor(parent.child(index - 1), 1),
        escape: false,
      },
      italic: { open: "*", close: "*", mixable: true, expelEnclosingWhitespace: true },
      link: {
        open(state, mark, parent, index) {
          const nextState = state as MarkdownStateWithAutolink;
          nextState.inAutolink = isPlainUrl(mark, parent, index);
          return nextState.inAutolink ? "<" : "[";
        },
        close(state, mark) {
          const nextState = state as MarkdownStateWithAutolink;
          const inAutolink = nextState.inAutolink;
          nextState.inAutolink = undefined;
          return inAutolink
            ? ">"
            : `](${String(mark.attrs.href).replace(/[\(\)"]/g, "\\$&")}${
                mark.attrs.title ? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"` : ""
              })`;
        },
        mixable: true,
      },
      strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    },
    { strict: true },
  );

  serializerCache.set(schema, serializer);
  return serializer;
}

export function parseMarkdownToDoc(schema: Schema, markdown: string): ProseMirrorNode {
  const parsed = createParser(schema).parse(markdown);
  return normalizeParsedNode(schema, parsed);
}

export function serializeDocToMarkdown(schema: Schema, doc: ProseMirrorNode): string {
  return createSerializer(schema).serialize(doc);
}
