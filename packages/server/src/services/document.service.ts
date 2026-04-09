import { createHash } from "node:crypto";
import { readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import {
  analyzeMarkdownSupport,
  composeRawPreservingFrontmatter,
  extractTitle,
  parseMarkdownDocument,
  updateStructuredFrontmatter,
} from "../../../shared/src/markdown-document.ts";
import type { FrontmatterValue } from "../../../shared/src/frontmatter.ts";
import { ensureParentDirectory, registerWorkspaceEntry, resolveWorkspacePath } from "../lib/workspace.ts";
import { AuditService } from "./audit.service.ts";
import { TemplateService } from "./template.service.ts";
import { VersioningService } from "./versioning.service.ts";

export interface ReadDocumentResult {
  path: string;
  title: string;
  raw: string;
  content: string;
  frontmatter: Record<string, FrontmatterValue>;
  revision: string;
  changed: boolean;
  supportedInWysiwyg: boolean;
}

export interface DocumentActor {
  actorId: string;
  provider: "local" | "oidc" | "pat" | "filesystem";
}

interface CreateOptions {
  template?: string;
  title?: string;
  author?: string;
  provider?: DocumentActor["provider"];
}

export class DocumentService {
  private readonly workspaceRoot: string;
  private readonly auditService?: AuditService;
  private readonly templateService: TemplateService;
  private readonly versioningService?: VersioningService;

  constructor(
    workspaceRoot: string,
    auditService?: AuditService,
    templateService?: TemplateService,
    versioningService?: VersioningService,
  ) {
    this.workspaceRoot = workspaceRoot;
    this.auditService = auditService;
    this.templateService = templateService ?? new TemplateService(workspaceRoot);
    this.versioningService = versioningService;
  }

  private absolutePath(docPath: string): string {
    if (docPath.split("/").some((segment) => segment === "..")) {
      throw new Error("PATH_TRAVERSAL");
    }
    if (!docPath.endsWith(".md")) {
      throw new Error("Document path must end with .md");
    }
    return resolveWorkspacePath(this.workspaceRoot, docPath);
  }

  read(docPath: string): ReadDocumentResult {
    const absolutePath = this.absolutePath(docPath);
    const raw = readFileSync(absolutePath, "utf8");
    const document = parseMarkdownDocument(raw);
    const support = analyzeMarkdownSupport(raw);
    return {
      path: docPath,
      title: extractTitle(docPath, document),
      raw,
      content: document.body,
      frontmatter: document.frontmatter,
      revision: createHash("sha1").update(raw).digest("hex"),
      changed: false,
      supportedInWysiwyg: support.supportedInWysiwyg,
    };
  }

  write(docPath: string, content: string, actor?: DocumentActor): ReadDocumentResult {
    const absolutePath = this.absolutePath(docPath);
    if (!existsSync(absolutePath)) {
      throw new Error("NOT_FOUND");
    }

    const rawBefore = readFileSync(absolutePath, "utf8");
    const parsed = parseMarkdownDocument(rawBefore);
    const rawAfter = composeRawPreservingFrontmatter(parsed, content);

    if (rawAfter !== rawBefore) {
      writeFileSync(absolutePath, rawAfter, "utf8");
      this.auditService?.recordDocumentEdit({
        path: docPath,
        actorId: actor?.actorId ?? "system",
        provider: actor?.provider ?? "filesystem",
        action: "update",
      });
      this.versioningService?.queueSnapshot(`docs: update ${docPath}`, this.absolutePath(docPath));
    }

    const result = this.read(docPath);
    return { ...result, changed: rawAfter !== rawBefore };
  }

  writeRaw(docPath: string, raw: string, actor?: DocumentActor): ReadDocumentResult {
    const absolutePath = this.absolutePath(docPath);
    if (!existsSync(absolutePath)) {
      throw new Error("NOT_FOUND");
    }

    const rawBefore = readFileSync(absolutePath, "utf8");
    if (rawBefore !== raw) {
      writeFileSync(absolutePath, raw, "utf8");
      this.auditService?.recordDocumentEdit({
        path: docPath,
        actorId: actor?.actorId ?? "system",
        provider: actor?.provider ?? "filesystem",
        action: "update",
      });
      this.versioningService?.queueSnapshot(`docs: update ${docPath}`, this.absolutePath(docPath));
    }

    const result = this.read(docPath);
    return { ...result, changed: rawBefore !== raw };
  }

  create(docPath: string, options: CreateOptions = {}): ReadDocumentResult {
    const absolutePath = this.absolutePath(docPath);
    if (existsSync(absolutePath)) {
      throw new Error("ALREADY_EXISTS");
    }

    ensureParentDirectory(absolutePath);
    const title = options.title ?? path.basename(docPath, ".md");
    const raw = options.template
      ? this.templateService.renderTemplate(options.template, {
          title,
          author: options.author ?? "system",
        })
      : this.templateService.renderTemplate("default", {
          title,
          author: options.author ?? "system",
        });
    writeFileSync(absolutePath, raw, "utf8");
    registerWorkspaceEntry(this.workspaceRoot, docPath);
    this.auditService?.recordDocumentEdit({
      path: docPath,
      actorId: options.author ?? "system",
      provider: options.provider ?? "filesystem",
      action: "create",
    });
    this.versioningService?.queueSnapshot(`docs: create ${docPath}`, absolutePath);
    const result = this.read(docPath);
    return { ...result, changed: true };
  }

  updateFrontmatter(
    docPath: string,
    updates: Record<string, FrontmatterValue>,
    actor?: DocumentActor,
  ): ReadDocumentResult {
    const absolutePath = this.absolutePath(docPath);
    const rawBefore = readFileSync(absolutePath, "utf8");
    const parsed = parseMarkdownDocument(rawBefore);
    const rawAfter = updateStructuredFrontmatter(parsed, updates);

    if (rawAfter !== rawBefore) {
      writeFileSync(absolutePath, rawAfter, "utf8");
      this.auditService?.recordDocumentEdit({
        path: docPath,
        actorId: actor?.actorId ?? "system",
        provider: actor?.provider ?? "filesystem",
        action: "update",
      });
      this.versioningService?.queueSnapshot(`docs: update metadata ${docPath}`);
    }

    const result = this.read(docPath);
    return { ...result, changed: rawAfter !== rawBefore };
  }

  delete(docPath: string, actor?: DocumentActor): void {
    const absolutePath = this.absolutePath(docPath);
    rmSync(absolutePath, { force: true });
    this.auditService?.recordDocumentEdit({
      path: docPath,
      actorId: actor?.actorId ?? "system",
      provider: actor?.provider ?? "filesystem",
      action: "delete",
    });
    this.versioningService?.queueSnapshot(`docs: delete ${docPath}`);
  }

  exists(docPath: string): boolean {
    return existsSync(this.absolutePath(docPath));
  }

  stat(docPath: string): { size: number; modifiedAt: string } {
    const stats = statSync(this.absolutePath(docPath));
    return {
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
  }
}
