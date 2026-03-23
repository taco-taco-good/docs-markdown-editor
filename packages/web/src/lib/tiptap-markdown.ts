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
// Zero-width space sentinel for empty paragraphs.
// \u00a0 (non-breaking space) was visible as a space in other editors.
// \u200b is invisible in all editors and survives markdown-it roundtrip.
const EMPTY_PARAGRAPH_SENTINEL = "\u200b";

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

function cloneToken(token: Token): Token {
  const copy = new Token(token.type, token.tag, token.nesting);
  copy.attrs = token.attrs ? token.attrs.map(([name, value]) => [name, value]) : null;
  copy.map = token.map ? [...token.map] : null;
  copy.level = token.level;
  copy.children = token.children ? token.children.map((child) => cloneToken(child)) : null;
  copy.content = token.content;
  copy.markup = token.markup;
  copy.info = token.info;
  copy.meta = token.meta ? { ...token.meta } : null;
  copy.block = token.block;
  copy.hidden = token.hidden;
  return copy;
}

function highlightPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("emphasis", "highlight", (state, silent) => {
    const start = state.pos;
    const max = state.posMax;
    if (start + 3 >= max) return false;
    if (state.src.charCodeAt(start) !== 0x3D || state.src.charCodeAt(start + 1) !== 0x3D) return false;

    const end = state.src.indexOf("==", start + 2);
    if (end < 0 || end === start + 2) return false;

    if (!silent) {
      const openToken = state.push("highlight_open", "mark", 1);
      openToken.markup = "==";
      const tokenizer = state.md.inline;
      const innerState = new (state.constructor as { new(src: string, md: MarkdownIt, env: unknown, outTokens: Token[]): typeof state })(
        state.src.slice(start + 2, end), state.md, state.env, []
      );
      tokenizer.tokenize(innerState);
      for (const tok of innerState.tokens) {
        state.push(tok.type, tok.tag, tok.nesting).content = tok.content;
      }
      const closeToken = state.push("highlight_close", "mark", -1);
      closeToken.markup = "==";
    }
    state.pos = end + 2;
    return true;
  });
}

function createTokenizer(): MarkdownIt {
  const tokenizer = MarkdownIt("default", { html: false, linkify: true });
  highlightPlugin(tokenizer);

  tokenizer.core.ruler.after("inline", "docs-task-lists", (state) => {
    const taskLists: Array<{
      index: number;
      itemCount: number;
      taskItems: Array<{
        openIndex: number;
        inlineIndex: number;
        checked: boolean;
      }>;
    }> = [];
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
        taskLists.push({ index, itemCount: 0, taskItems: [] });
        continue;
      }

      if (token.type === "bullet_list_close") {
        const currentList = taskLists.pop();
        if (currentList && currentList.itemCount > 0 && currentList.taskItems.length === currentList.itemCount) {
          state.tokens[currentList.index].type = "task_list_open";
          token.type = "task_list_close";
          for (const taskItem of currentList.taskItems) {
            const openToken = state.tokens[taskItem.openIndex];
            const inlineToken = state.tokens[taskItem.inlineIndex];
            const closeIndex = findListItemClose(state.tokens, taskItem.openIndex);
            if (closeIndex < 0) continue;
            const closeToken = state.tokens[closeIndex];

            openToken.type = "task_item_open";
            openToken.meta = { ...(openToken.meta ?? {}), checked: taskItem.checked };
            stripTaskPrefix(inlineToken);
            closeToken.type = "task_item_close";
          }
        } else if (currentList && currentList.taskItems.length > 0) {
          const closeIndex = index;
          const taskOpenIndexes = new Set(currentList.taskItems.map((item) => item.openIndex));
          const taskItemByOpenIndex = new Map(currentList.taskItems.map((item) => [item.openIndex, item]));
          const replacement: Token[] = [];
          const listOpenToken = state.tokens[currentList.index];
          const listCloseToken = state.tokens[closeIndex];
          let cursor = currentList.index + 1;

          while (cursor < closeIndex) {
            const listItemCloseIndex = findListItemClose(state.tokens, cursor);
            if (listItemCloseIndex < 0) break;

            const isTaskSegment = taskOpenIndexes.has(cursor);
            const segmentOpen = cloneToken(listOpenToken);
            segmentOpen.type = isTaskSegment ? "task_list_open" : "bullet_list_open";
            replacement.push(segmentOpen);

            while (cursor < closeIndex) {
              const itemCloseIndex = findListItemClose(state.tokens, cursor);
              if (itemCloseIndex < 0) break;
              const nextIsTask = taskOpenIndexes.has(cursor);
              if (nextIsTask !== isTaskSegment) break;

              const slice = state.tokens
                .slice(cursor, itemCloseIndex + 1)
                .map((sliceToken) => cloneToken(sliceToken));

              if (isTaskSegment) {
                const taskItem = taskItemByOpenIndex.get(cursor);
                if (taskItem) {
                  slice[0].type = "task_item_open";
                  slice[0].meta = { ...(slice[0].meta ?? {}), checked: taskItem.checked };
                  const inlineOffset = taskItem.inlineIndex - cursor;
                  if (inlineOffset >= 0 && inlineOffset < slice.length) {
                    stripTaskPrefix(slice[inlineOffset]);
                  }
                  slice[slice.length - 1].type = "task_item_close";
                }
              }

              replacement.push(...slice);
              cursor = itemCloseIndex + 1;
            }

            const segmentClose = cloneToken(listCloseToken);
            segmentClose.type = isTaskSegment ? "task_list_close" : "bullet_list_close";
            replacement.push(segmentClose);
          }

          state.tokens.splice(currentList.index, closeIndex - currentList.index + 1, ...replacement);
          index = currentList.index + replacement.length - 1;
        }
        continue;
      }

      if (token.type !== "list_item_open" || taskLists.length === 0) {
        continue;
      }

      const currentList = taskLists[taskLists.length - 1];
      const inlineToken = state.tokens[index + 2];
      const match = inlineToken?.type === "inline" ? /^\[([ xX])\]\s+/.exec(inlineToken.content) : null;
      const closeIndex = findListItemClose(state.tokens, index);
      currentList.itemCount += 1;
      if (!match || closeIndex < 0) {
        continue;
      }

      currentList.taskItems.push({
        openIndex: index,
        inlineIndex: index + 2,
        checked: match[1].toLowerCase() === "x",
      });
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
    highlight: { mark: "highlight" },
  });

  parserCache.set(schema, parser);
  return parser;
}

function normalizeParsedNode(schema: Schema, node: ProseMirrorNode): ProseMirrorNode {
  const content = [];
  for (let index = 0; index < node.childCount; index += 1) {
    content.push(normalizeParsedNode(schema, node.child(index)));
  }

  // Strip sentinel characters (current \u200b and legacy \u00a0) back to empty paragraphs
  if (node.type.name === "paragraph" && (node.textContent === EMPTY_PARAGRAPH_SENTINEL || node.textContent === "\u00a0")) {
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
        } else {
          state.renderInline(node);
        }
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
      highlight: { open: "==", close: "==", mixable: true, expelEnclosingWhitespace: true },
    },
    { strict: true, tightLists: true } as { strict: boolean },
  );

  serializerCache.set(schema, serializer);
  return serializer;
}

const MARKDOWN_PATTERNS = /(?:^|\n)(?:#{1,6}\s|[-*+]\s|\d+\.\s|- \[[ xX]\]\s|>\s|```|---|\*\*|__|\[.+\]\(.+\))/;

/**
 * Quick heuristic to detect markdown-formatted text.
 * Used by the paste handler to decide whether plain text should be parsed as markdown.
 */
export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_PATTERNS.test(text);
}

export function parseMarkdownToDoc(schema: Schema, markdown: string): ProseMirrorNode {
  const parsed = createParser(schema).parse(markdown);
  return normalizeParsedNode(schema, parsed);
}

export function serializeDocToMarkdown(schema: Schema, doc: ProseMirrorNode): string {
  return createSerializer(schema).serialize(doc);
}
