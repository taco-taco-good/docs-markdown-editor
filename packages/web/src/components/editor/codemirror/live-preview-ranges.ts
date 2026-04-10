export interface ProtectedRange {
  from: number;
  to: number;
}

export function rangesOverlap(
  from: number,
  to: number,
  protectedRanges: ProtectedRange[],
): boolean {
  return protectedRanges.some((range) => from < range.to && to > range.from);
}

export function collectProtectedRanges(text: string, lineFrom: number): ProtectedRange[] {
  const protectedRanges: ProtectedRange[] = [];

  for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    const start = lineFrom + (match.index ?? 0);
    const end = start + match[0].length;
    protectedRanges.push({ from: start, to: end });
  }

  for (const match of text.matchAll(/(^|[\s([{"'])@([\p{Letter}\p{Number}./_-]+(?:#[\p{Letter}\p{Number}./_-]+)?)/gu)) {
    const prefix = match[1] ?? "";
    const start = lineFrom + (match.index ?? 0) + prefix.length;
    const end = start + `@${match[2]}`.length;
    protectedRanges.push({ from: start, to: end });
  }

  return protectedRanges;
}
