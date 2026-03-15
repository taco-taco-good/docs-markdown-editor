import type { Editor as TiptapEditor } from "@tiptap/core";

export interface OutlineItem {
  id: string;
  label: string;
  level: 2 | 3 | 4;
  pos: number | null;
}

export function collectOutlineItems(editor: TiptapEditor): OutlineItem[] {
  const items: OutlineItem[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    const level = Number(node.attrs.level);
    if (level !== 2 && level !== 3 && level !== 4) return true;

    const label = node.textContent.trim() || `제목 ${items.length + 1}`;
    items.push({
      id: `${level}-${pos}-${label}`,
      label,
      level: level as 2 | 3 | 4,
      pos: pos + 1,
    });
    return true;
  });

  return items;
}

export function collectOutlineItemsFromMarkdown(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    const match = /^(#{2,4})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    items.push({
      id: `markdown-${index}-${match[2].trim()}`,
      label: match[2].trim(),
      level: match[1].length as 2 | 3 | 4,
      pos: null,
    });
  }
  return items;
}

export function activeOutlineId(items: OutlineItem[], selectionPos: number): string | null {
  let active: OutlineItem | null = null;
  for (const item of items) {
    if (item.pos === null) continue;
    if (item.pos <= selectionPos) {
      active = item;
      continue;
    }
    break;
  }
  return active?.id ?? null;
}
