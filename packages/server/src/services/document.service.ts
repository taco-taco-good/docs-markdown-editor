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

export interface ReadDocumentResult {
  path: string;
  title: string;
  raw: string;
  content: string;
  frontmatter: Record<string, FrontmatterValue>;
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

  constructor(workspaceRoot: string, auditService?: AuditService, templateService?: TemplateService) {
    this.workspaceRoot = workspaceRoot;
    this.auditService = auditService;
    this.templateService = templateService ?? new TemplateService(workspaceRoot);
  }

  private absolutePath(docPath: string): string {
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
    }

    const result = this.read(docPath);
    return { ...result, changed: rawAfter !== rawBefore };
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
