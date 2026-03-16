import type { TreeNode } from "../api/client";

export type TreeDropMode = "inside" | "before" | "after";

export interface TreeDropIntent {
  targetPath: string;
  mode: TreeDropMode;
}

export function parentDirectoryFromPath(path: string): string {
  const segments = path.split("/");
  segments.pop();
  return segments.join("/");
}

export function resolveDropIntentFromRatio(
  sourcePath: string,
  target: TreeNode,
  ratio: number,
): TreeDropIntent | null {
  if (!sourcePath || sourcePath === target.path) return null;
  if (sourcePath.startsWith(`${target.path}/`)) return null;

  const normalizedRatio = Math.min(Math.max(ratio, 0), 1);
  if (target.type === "directory") {
    if (normalizedRatio < 0.25) {
      return { targetPath: target.path, mode: "before" };
    }
    if (normalizedRatio <= 0.75) {
      return { targetPath: target.path, mode: "inside" };
    }
    return { targetPath: target.path, mode: "after" };
  }

  return {
    targetPath: target.path,
    mode: normalizedRatio < 0.5 ? "before" : "after",
  };
}
