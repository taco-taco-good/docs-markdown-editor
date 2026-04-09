export type SaveStatus = "saved" | "saving" | "conflict" | "idle";

interface StatusState {
  hasPendingRemoteUpdate: boolean;
  isDirty: boolean;
}

export interface RemoteSnapshot {
  raw: string;
  baseRaw: string;
}

interface RemoteUpdateParams extends StatusState {
  raw: string;
  currentRaw: string;
  lastSavedRaw: string;
  isComposing: boolean;
  originClientId?: string | null;
  editorClientId: string;
}

interface SaveSuccessParams extends StatusState {
  hasNewerLocalEdits: boolean;
  requestedRaw: string;
}

export function deriveSaveStatus(state: StatusState): SaveStatus {
  if (state.isDirty) return "idle";
  return "saved";
}

export function resolveRemoteUpdate(params: RemoteUpdateParams):
  | { action: "ignore" }
  | { action: "queue"; snapshot: RemoteSnapshot }
  | { action: "apply"; raw: string; saveStatus: SaveStatus } {
  if (params.originClientId === params.editorClientId) {
    return { action: "ignore" };
  }
  if (params.raw === params.currentRaw) {
    return { action: "ignore" };
  }
  if (params.isDirty || params.isComposing) {
    return {
      action: "queue",
      snapshot: {
        raw: params.raw,
        baseRaw: params.lastSavedRaw,
      },
    };
  }
  return {
    action: "apply",
    raw: params.raw,
    saveStatus: "saved",
  };
}

export function resolveSaveSuccess(params: SaveSuccessParams): {
  lastSavedRaw: string;
  saveStatus: SaveStatus;
} {
  return {
    lastSavedRaw: params.requestedRaw,
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

export function mergeConcurrentMarkdown(params: {
  base: string;
  local: string;
  remote: string;
}): {
  raw: string;
  hadRemoteChanges: boolean;
  droppedRemoteChanges: boolean;
} {
  const { base, local, remote } = params;

  if (local === remote) {
    return { raw: local, hadRemoteChanges: false, droppedRemoteChanges: false };
  }
  if (local === base) {
    return { raw: remote, hadRemoteChanges: true, droppedRemoteChanges: false };
  }
  if (remote === base) {
    return { raw: local, hadRemoteChanges: false, droppedRemoteChanges: false };
  }

  const localChange = computeLineChange(base, local);
  const remoteChange = computeLineChange(base, remote);
  if (!localChange) {
    return { raw: remote, hadRemoteChanges: true, droppedRemoteChanges: false };
  }
  if (!remoteChange) {
    return { raw: local, hadRemoteChanges: false, droppedRemoteChanges: false };
  }

  const changesOverlap =
    localChange.start < remoteChange.end && remoteChange.start < localChange.end;
  const touchesSameInsertionPoint =
    localChange.start === localChange.end &&
    remoteChange.start === remoteChange.end &&
    localChange.start === remoteChange.start;

  if (changesOverlap || touchesSameInsertionPoint) {
    return { raw: local, hadRemoteChanges: true, droppedRemoteChanges: true };
  }

  const baseLines = splitLines(base);
  const ordered = [localChange, remoteChange].sort((left, right) => right.start - left.start);
  const mergedLines = ordered.reduce((acc, change) => applyLineChange(acc, change), baseLines);
  return {
    raw: mergedLines.join(""),
    hadRemoteChanges: true,
    droppedRemoteChanges: false,
  };
}
