import type { Document } from "../api/client";

const DRAFT_PREFIX = "docs-md-draft:";

export interface DocumentDraft {
  raw: string;
  lastSavedRaw: string;
  baseRevision?: string;
  updatedAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function getDraftKey(path: string): string {
  return `${DRAFT_PREFIX}${path}`;
}

export function readDocumentDraft(path: string, storage?: StorageLike): DocumentDraft | null {
  const target = getStorage(storage);
  if (!target) return null;

  try {
    const raw = target.getItem(getDraftKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DocumentDraft>;
    if (
      !parsed ||
      typeof parsed.raw !== "string" ||
      typeof parsed.lastSavedRaw !== "string" ||
      typeof parsed.updatedAt !== "number"
    ) {
      return null;
    }
    return {
      raw: parsed.raw,
      lastSavedRaw: parsed.lastSavedRaw,
      baseRevision: typeof parsed.baseRevision === "string" ? parsed.baseRevision : undefined,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function writeDocumentDraft(
  path: string,
  draft: Omit<DocumentDraft, "updatedAt">,
  storage?: StorageLike,
): void {
  const target = getStorage(storage);
  if (!target) return;

  try {
    const payload: DocumentDraft = {
      ...draft,
      updatedAt: Date.now(),
    };
    target.setItem(getDraftKey(path), JSON.stringify(payload));
  } catch {
    // localStorage unavailable
  }
}

export function clearDocumentDraft(path: string, storage?: StorageLike): void {
  const target = getStorage(storage);
  if (!target) return;

  try {
    target.removeItem(getDraftKey(path));
  } catch {
    // localStorage unavailable
  }
}

export function shouldRestoreDocumentDraft(doc: Document, draft: DocumentDraft): boolean {
  if (draft.raw === doc.raw) {
    return false;
  }
  if (draft.lastSavedRaw === doc.raw) {
    return true;
  }
  if (draft.baseRevision && doc.meta.revision && draft.baseRevision === doc.meta.revision) {
    return true;
  }
  return false;
}
