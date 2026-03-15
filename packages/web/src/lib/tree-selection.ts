function parentDirectoryFromPath(path: string): string {
  const segments = path.split("/");
  segments.pop();
  return segments.join("/");
}

export function resolveTargetDirectory(
  selectedPath: string | null,
  currentDocumentPath: string | null,
): string {
  const preferredPath = selectedPath ?? currentDocumentPath;
  if (!preferredPath) return "";

  const normalizedPath = preferredPath.replace(/^\/+|\/+$/g, "");
  if (!normalizedPath) return "";

  if (normalizedPath.toLowerCase().endsWith(".md")) {
    return parentDirectoryFromPath(normalizedPath);
  }

  return normalizedPath;
}
