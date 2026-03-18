import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type TreeOrderState = Record<string, string[]>;

export function orderStatePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".docs", "tree-order.json");
}

export function readTreeOrderState(workspaceRoot: string): TreeOrderState {
  const filePath = orderStatePath(workspaceRoot);
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const state: TreeOrderState = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      state[key] = value.filter((item): item is string => typeof item === "string");
    }
    return state;
  } catch {
    return {};
  }
}

export function writeTreeOrderState(workspaceRoot: string, state: TreeOrderState): void {
  const filePath = orderStatePath(workspaceRoot);
  mkdirSync(path.dirname(filePath), { recursive: true });

  const normalized = Object.fromEntries(
    Object.entries(state)
      .map(([key, value]) => [key, Array.from(new Set(value.filter(Boolean)))])
      .filter(([, value]) => value.length > 0),
  );

  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export function orderedEntryNames(entries: string[], order: TreeOrderState, directoryPath: string): string[] {
  const desired = order[directoryPath] ?? [];
  const known = desired.filter((name) => entries.includes(name));
  const remainder = entries.filter((name) => !known.includes(name)).sort((left, right) => left.localeCompare(right));
  return [...known, ...remainder];
}

export function appendToParentOrder(state: TreeOrderState, directoryPath: string, entryName: string): void {
  if (!entryName) return;
  const current = state[directoryPath] ?? [];
  state[directoryPath] = [...current.filter((item) => item !== entryName), entryName];
}

export function removeFromParentOrder(state: TreeOrderState, directoryPath: string, entryName: string): void {
  if (!state[directoryPath]) return;
  state[directoryPath] = state[directoryPath].filter((item) => item !== entryName);
  if (state[directoryPath].length === 0) {
    delete state[directoryPath];
  }
}

export function replaceInParentOrder(
  state: TreeOrderState,
  directoryPath: string,
  previousName: string,
  nextName: string,
): void {
  const current = state[directoryPath];
  if (!current?.length) {
    state[directoryPath] = [nextName];
    return;
  }

  let replaced = false;
  state[directoryPath] = current.map((item) => {
    if (item === previousName) {
      replaced = true;
      return nextName;
    }
    return item;
  });
  if (!replaced) {
    state[directoryPath] = [...state[directoryPath], nextName];
  }
}

export function insertAroundSibling(
  state: TreeOrderState,
  directoryPath: string,
  entryName: string,
  siblingName: string,
  placement: "before" | "after",
  fallbackNames: string[],
): void {
  const current = orderedEntryNames(fallbackNames.filter((item) => item !== entryName), state, directoryPath);
  const siblingIndex = current.indexOf(siblingName);
  if (siblingIndex === -1) {
    current.push(entryName);
    state[directoryPath] = current;
    return;
  }

  const insertAt = placement === "before" ? siblingIndex : siblingIndex + 1;
  current.splice(insertAt, 0, entryName);
  state[directoryPath] = current;
}

export function remapOrderKeys(state: TreeOrderState, fromPath: string, toPath: string): void {
  const nextEntries: Array<[string, string[]]> = [];
  for (const [key, value] of Object.entries(state)) {
    if (key === fromPath || key.startsWith(`${fromPath}/`)) {
      const nextKey = `${toPath}${key.slice(fromPath.length)}`;
      nextEntries.push([nextKey, value]);
      delete state[key];
    }
  }

  for (const [key, value] of nextEntries) {
    state[key] = value;
  }
}

export function removeDescendantOrder(state: TreeOrderState, targetPath: string): void {
  for (const key of Object.keys(state)) {
    if (key === targetPath || key.startsWith(`${targetPath}/`)) {
      delete state[key];
    }
  }
}
