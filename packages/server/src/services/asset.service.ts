import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveWorkspacePath } from "../lib/workspace.ts";

const MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  ".gif": ["image/gif"],
  ".jpeg": ["image/jpeg"],
  ".jpg": ["image/jpeg"],
  ".png": ["image/png"],
  ".svg": ["image/svg+xml"],
  ".txt": ["text/plain"],
  ".webp": ["image/webp"],
};

const MAX_ASSET_BYTES = 5 * 1024 * 1024;

function sanitizeFileName(fileName: string): string {
  const cleaned = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "-");
  return cleaned || "upload.bin";
}

function isImageExtension(extension: string): boolean {
  return [".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(extension);
}

export class AssetService {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async uploadAsset(
    docPath: string,
    file: File,
  ): Promise<{ path: string; url: string; markdownLink: string }> {
    if (!docPath.endsWith(".md")) {
      throw new Error("VALIDATION_ERROR");
    }

    const docDirectory = path.dirname(docPath) === "." ? "" : path.dirname(docPath);
    const docName = path.basename(docPath, ".md");
    const assetDirectory = path.join(".assets", docDirectory, docName);
    const absoluteDirectory = resolveWorkspacePath(this.workspaceRoot, assetDirectory);
    mkdirSync(absoluteDirectory, { recursive: true });

    const baseName = sanitizeFileName(file.name);
    const ext = path.extname(baseName);
    const allowedMimeTypes = ALLOWED_UPLOAD_TYPES[ext.toLowerCase()];
    if (!allowedMimeTypes) {
      throw new Error("UNSUPPORTED_ASSET_TYPE");
    }
    if (file.size <= 0 || file.size > MAX_ASSET_BYTES) {
      throw new Error("ASSET_TOO_LARGE");
    }
    if (file.type && !allowedMimeTypes.includes(file.type)) {
      throw new Error("UNSUPPORTED_ASSET_TYPE");
    }
    const stem = path.basename(baseName, ext);
    let finalName = baseName;
    let counter = 1;
    while (existsSync(path.join(absoluteDirectory, finalName))) {
      finalName = `${stem}-${counter}${ext}`;
      counter += 1;
    }

    const relativeAssetPath = path.join(assetDirectory, finalName).split(path.sep).join("/");
    const absoluteAssetPath = resolveWorkspacePath(this.workspaceRoot, relativeAssetPath);
    const bytes = new Uint8Array(await file.arrayBuffer());
    writeFileSync(absoluteAssetPath, bytes);

    const encodedPath = encodeURIComponent(relativeAssetPath);
    const url = `/api/assets/${encodedPath}`;
    const markdownLink = isImageExtension(ext)
      ? `![${path.basename(finalName, ext)}](${url})`
      : `[${finalName}](${url})`;

    return {
      path: relativeAssetPath,
      url,
      markdownLink,
    };
  }

  readAsset(assetPath: string): { body: Buffer; contentType: string; lastModified: string } {
    const absolutePath = resolveWorkspacePath(this.workspaceRoot, assetPath);
    const stats = statSync(absolutePath);
    if (!stats.isFile()) {
      throw new Error("NOT_FOUND");
    }

    return {
      body: readFileSync(absolutePath),
      contentType: MIME_TYPES[path.extname(absolutePath).toLowerCase()] ?? "application/octet-stream",
      lastModified: stats.mtime.toUTCString(),
    };
  }
}
