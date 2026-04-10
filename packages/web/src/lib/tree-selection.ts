export function expandAncestorPaths(expandedPaths: Set<string>, path: string): Set<string> {
  const next = new Set(expandedPaths);
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return next;
  }

  let current = "";
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = current ? `${current}/${segments[index]}` : segments[index];
    next.add(current);
  }
  return next;
}
