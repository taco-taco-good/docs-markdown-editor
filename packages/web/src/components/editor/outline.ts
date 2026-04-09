export interface OutlineItem {
  id: string;
  label: string;
  level: 2 | 3 | 4;
  pos: number | null;
}

export function collectOutlineItemsFromMarkdown(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let offset = 0;

  for (const [index, rawLine] of markdown.split(/\n/).entries()) {
    // strip trailing CR so CRLF files work correctly
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const match = /^(#{2,4})\s+(.+?)\s*$/.exec(line);
    if (match) {
      items.push({
        id: `outline-${index}-${offset}`,
        label: match[2].trim(),
        level: match[1].length as 2 | 3 | 4,
        pos: offset + match[1].length + 1,
      });
    }
    offset += rawLine.length + 1; // rawLine.length preserves \r if present; +1 for \n
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
