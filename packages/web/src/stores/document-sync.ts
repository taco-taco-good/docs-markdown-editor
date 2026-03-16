export type SaveStatus = "saved" | "saving" | "conflict" | "idle";

interface StatusState {
  hasPendingRemoteUpdate: boolean;
  isDirty: boolean;
}

export interface RemoteSnapshot {
  content: string;
  frontmatter: string;
  baseContent: string;
  baseFrontmatter: string;
}

interface RemoteUpdateParams extends StatusState {
  content: string;
  frontmatter: string;
  currentContent: string;
  currentFrontmatter: string;
  lastSavedContent: string;
  lastSavedFrontmatter: string;
  isComposing: boolean;
  originClientId?: string | null;
  editorClientId: string;
}

interface SaveSuccessParams extends StatusState {
  hasNewerLocalEdits: boolean;
  requestedContent: string;
}

export function deriveSaveStatus(state: StatusState): SaveStatus {
  if (state.isDirty) return "idle";
  return "saved";
}

export function resolveRemoteUpdate(params: RemoteUpdateParams):
  | { action: "ignore" }
  | { action: "queue"; snapshot: RemoteSnapshot }
  | { action: "apply"; content: string; frontmatter: string; saveStatus: SaveStatus } {
  if (params.originClientId === params.editorClientId) {
    return { action: "ignore" };
  }
  if (
    params.content === params.currentContent &&
    params.frontmatter === params.currentFrontmatter
  ) {
    return { action: "ignore" };
  }
  if (params.isDirty || params.isComposing) {
    return {
      action: "queue",
      snapshot: {
        content: params.content,
        frontmatter: params.frontmatter,
        baseContent: params.lastSavedContent,
        baseFrontmatter: params.lastSavedFrontmatter,
      },
    };
  }
  return {
    action: "apply",
    content: params.content,
    frontmatter: params.frontmatter,
    saveStatus: "saved",
  };
}

export function resolveSaveSuccess(params: SaveSuccessParams): {
  lastSavedContent: string;
  saveStatus: SaveStatus;
} {
  return {
    lastSavedContent: params.requestedContent,
    saveStatus: params.hasNewerLocalEdits
      ? deriveSaveStatus({ hasPendingRemoteUpdate: params.hasPendingRemoteUpdate, isDirty: true })
      : deriveSaveStatus({ hasPendingRemoteUpdate: params.hasPendingRemoteUpdate, isDirty: false }),
  };
}

export function shouldReloadAfterCompositionEnd(state: StatusState): boolean {
  return !state.isDirty && state.hasPendingRemoteUpdate;
}

export function shouldApplySaveResponse(params: {
  currentPath: string | null;
  requestedPath: string;
  hasCurrentDoc: boolean;
}): boolean {
  return params.currentPath === params.requestedPath && params.hasCurrentDoc;
}

function splitLines(text: string): string[] {
  if (text === "") return [""];
  const parts = text.match(/[^\n]*\n|[^\n]+$/g);
  return parts && parts.length > 0 ? parts : [text];
}

interface LineChange {
  start: number;
  end: number;
  replacement: string[];
}

function computeLineChange(baseText: string, nextText: string): LineChange | null {
  if (baseText === nextText) return null;

  const base = splitLines(baseText);
  const next = splitLines(nextText);

  let start = 0;
  while (start < base.length && start < next.length && base[start] === next[start]) {
    start += 1;
  }

  let baseEnd = base.length;
  let nextEnd = next.length;
  while (baseEnd > start && nextEnd > start && base[baseEnd - 1] === next[nextEnd - 1]) {
    baseEnd -= 1;
    nextEnd -= 1;
  }

  return {
    start,
    end: baseEnd,
    replacement: next.slice(start, nextEnd),
  };
}

function applyLineChange(base: string[], change: LineChange): string[] {
  return [
    ...base.slice(0, change.start),
    ...change.replacement,
    ...base.slice(change.end),
  ];
}

export function mergeConcurrentContent(params: {
  base: string;
  local: string;
  remote: string;
}): {
  content: string;
  hadRemoteChanges: boolean;
  droppedRemoteChanges: boolean;
} {
  const { base, local, remote } = params;

  if (local === remote) {
    return { content: local, hadRemoteChanges: false, droppedRemoteChanges: false };
  }
  if (local === base) {
    return { content: remote, hadRemoteChanges: true, droppedRemoteChanges: false };
  }
  if (remote === base) {
    return { content: local, hadRemoteChanges: false, droppedRemoteChanges: false };
  }

  const localChange = computeLineChange(base, local);
  const remoteChange = computeLineChange(base, remote);
  if (!localChange) {
    return { content: remote, hadRemoteChanges: true, droppedRemoteChanges: false };
  }
  if (!remoteChange) {
    return { content: local, hadRemoteChanges: false, droppedRemoteChanges: false };
  }

  const changesOverlap =
    localChange.start < remoteChange.end && remoteChange.start < localChange.end;
  const touchesSameInsertionPoint =
    localChange.start === localChange.end &&
    remoteChange.start === remoteChange.end &&
    localChange.start === remoteChange.start;

  if (changesOverlap || touchesSameInsertionPoint) {
    return { content: local, hadRemoteChanges: true, droppedRemoteChanges: true };
  }

  const baseLines = splitLines(base);
  const ordered = [localChange, remoteChange].sort((left, right) => right.start - left.start);
  const mergedLines = ordered.reduce((acc, change) => applyLineChange(acc, change), baseLines);
  return {
    content: mergedLines.join(""),
    hadRemoteChanges: true,
    droppedRemoteChanges: false,
  };
}

export function mergeConcurrentFrontmatter(params: {
  base: string;
  local: string;
  remote: string;
}): {
  frontmatter: string;
  hadRemoteChanges: boolean;
  droppedRemoteChanges: boolean;
} {
  const { base, local, remote } = params;

  if (local === remote) {
    return { frontmatter: local, hadRemoteChanges: false, droppedRemoteChanges: false };
  }
  if (local === base) {
    return { frontmatter: remote, hadRemoteChanges: true, droppedRemoteChanges: false };
  }
  if (remote === base) {
    return { frontmatter: local, hadRemoteChanges: false, droppedRemoteChanges: false };
  }

  const baseObject = JSON.parse(base) as Record<string, unknown>;
  const localObject = JSON.parse(local) as Record<string, unknown>;
  const remoteObject = JSON.parse(remote) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...baseObject };
  let hadRemoteChanges = false;
  let droppedRemoteChanges = false;

  const keys = new Set([
    ...Object.keys(baseObject),
    ...Object.keys(localObject),
    ...Object.keys(remoteObject),
  ]);

  for (const key of keys) {
    const baseValue = baseObject[key];
    const localValue = localObject[key];
    const remoteValue = remoteObject[key];
    const localChanged = JSON.stringify(localValue) !== JSON.stringify(baseValue);
    const remoteChanged = JSON.stringify(remoteValue) !== JSON.stringify(baseValue);

    if (localChanged && remoteChanged) {
      if (JSON.stringify(localValue) === JSON.stringify(remoteValue)) {
        merged[key] = localValue;
      } else {
        merged[key] = localValue;
        hadRemoteChanges = true;
        droppedRemoteChanges = true;
      }
      continue;
    }

    if (localChanged) {
      merged[key] = localValue;
      continue;
    }

    if (remoteChanged) {
      merged[key] = remoteValue;
      hadRemoteChanges = true;
      continue;
    }

    if (key in baseObject) {
      merged[key] = baseValue;
    }
  }

  return {
    frontmatter: JSON.stringify(merged),
    hadRemoteChanges,
    droppedRemoteChanges,
  };
}
