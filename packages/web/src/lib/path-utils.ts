/**
 * Remap a path when a parent entry has been moved.
 * Shared between document.store and tree.store.
 */
export function remapMovedPath(path: string | null, from: string, to: string): string | null {
  if (!path) return path;
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) {
    return `${to}${path.slice(from.length)}`;
  }
  return path;
}
