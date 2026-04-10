function normalizeDocPath(path: string): string {
  const parts = path.split("/");
  const normalized: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }

  return normalized.join("/");
}

function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export function slugifyHeading(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function findHeadingPosition(markdown: string, anchor: string): number | null {
  const normalizedAnchor = anchor.trim().replace(/^#/, "").toLowerCase();
  if (!normalizedAnchor) return null;

  let offset = 0;
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match && slugifyHeading(match[2]) === normalizedAnchor) {
      return offset + match[1].length + 1;
    }
    offset += line.length + 1;
  }

  return null;
}

export type LinkTarget =
  | { type: "external"; url: string }
  | { type: "internal"; path: string; anchor?: string };

function ensureMarkdownPath(path: string): string {
  return /\.[a-z0-9]+$/i.test(path) ? path : `${path}.md`;
}

export function resolveMarkdownLinkTarget(currentPath: string, rawUrl: string, workspaceRoot?: string): LinkTarget | null {
  const url = rawUrl.trim();
  if (!url) return null;

  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url) || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return { type: "external", url };
  }

  const [rawPathPart, rawHashPart] = url.split("#", 2);
  const anchor = rawHashPart ? decodeURIComponent(rawHashPart) : undefined;

  if (!rawPathPart) {
    return { type: "internal", path: currentPath, anchor };
  }

  const decodedPath = decodeURIComponent(rawPathPart);
  const normalizedWorkspaceRoot = workspaceRoot
    ? workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "")
    : "";
  const normalizedDecodedPath = decodedPath.replace(/\\/g, "/");
  const workspaceRelativePath =
    normalizedWorkspaceRoot &&
    (normalizedDecodedPath === normalizedWorkspaceRoot || normalizedDecodedPath.startsWith(`${normalizedWorkspaceRoot}/`))
      ? normalizedDecodedPath.slice(normalizedWorkspaceRoot.length).replace(/^\/+/, "")
      : null;
  const pathPart = decodedPath.startsWith("/")
    ? (workspaceRelativePath ?? decodedPath.slice(1))
    : normalizeDocPath(`${dirname(currentPath)}/${decodedPath}`);

  return {
    type: "internal",
    path: pathPart,
    ...(anchor ? { anchor } : {}),
  };
}

export function resolveAtReferenceTarget(currentPath: string, rawReference: string): LinkTarget | null {
  const ref = rawReference.trim().replace(/^@+/, "");
  if (!ref) return null;

  const [rawPathPart, rawHashPart] = ref.split("#", 2);
  const anchor = rawHashPart ? decodeURIComponent(rawHashPart) : undefined;
  const decodedPath = decodeURIComponent(rawPathPart.trim());
  if (!decodedPath) return null;

  const normalizedPath = decodedPath.startsWith("/")
    ? decodedPath.slice(1)
    : normalizeDocPath(`${dirname(currentPath)}/${decodedPath}`);

  if (!normalizedPath) return null;

  return {
    type: "internal",
    path: ensureMarkdownPath(normalizedPath),
    ...(anchor ? { anchor } : {}),
  };
}

export function resolveEditorReferenceTarget(currentPath: string, rawTarget: string, workspaceRoot?: string): LinkTarget | null {
  if (rawTarget.trim().startsWith("@")) {
    return resolveAtReferenceTarget(currentPath, rawTarget);
  }
  return resolveMarkdownLinkTarget(currentPath, rawTarget, workspaceRoot);
}
