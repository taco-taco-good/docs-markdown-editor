import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseFrontmatter } from "../../../shared/src/frontmatter.ts";

export interface TemplateMeta {
  name: string;
}

export interface TemplateDocument {
  name: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  default: `---
title: "{{title}}"
tags: []
date: "{{date}}"
---

# {{title}}

`,
  "meeting-note": `---
title: "{{title}}"
tags: [meeting]
date: "{{date}}"
author: "{{author}}"
---

# {{title}}

## Agenda

- 

## Notes

- 

## Decisions

- 
`,
  "tech-spec": `---
title: "{{title}}"
tags: [tech-spec]
date: "{{date}}"
author: "{{author}}"
---

# {{title}}

## Overview

## Goals

## Design

## Risks

`,
};

export class TemplateService {
  private readonly templateRoot: string;

  constructor(workspaceRoot: string) {
    this.templateRoot = path.join(workspaceRoot, ".docs", "templates");
  }

  listTemplates(): TemplateMeta[] {
    this.ensureDefaults();
    return readdirSync(this.templateRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => ({ name: path.basename(entry.name, ".md") }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  readTemplate(name: string): TemplateDocument {
    this.ensureDefaults();
    const templatePath = this.resolveTemplatePath(name);
    if (!existsSync(templatePath)) {
      throw new Error("NOT_FOUND");
    }
    const content = readFileSync(templatePath, "utf8");
    const parsed = parseFrontmatter(content);
    return {
      name,
      content,
      frontmatter: parsed.data,
    };
  }

  renderTemplate(
    name: string,
    variables: { title: string; author: string; date?: string },
  ): string {
    const template = this.readTemplate(name);
    const date = variables.date ?? new Date().toISOString().slice(0, 10);
    return template.content
      .replaceAll("{{title}}", variables.title)
      .replaceAll("{{author}}", variables.author)
      .replaceAll("{{date}}", date);
  }

  hasTemplate(name: string): boolean {
    this.ensureDefaults();
    return existsSync(this.resolveTemplatePath(name));
  }

  writeTemplate(name: string, content: string): TemplateDocument {
    this.ensureDefaults();
    if (!content.trim()) {
      throw new Error("VALIDATION_ERROR");
    }
    const templatePath = this.resolveTemplatePath(name);
    writeFileSync(templatePath, content, "utf8");
    return this.readTemplate(name);
  }

  deleteTemplate(name: string): void {
    this.ensureDefaults();
    if (name === "default") {
      throw new Error("VALIDATION_ERROR");
    }

    const templatePath = this.resolveTemplatePath(name);
    if (!existsSync(templatePath)) {
      throw new Error("NOT_FOUND");
    }

    rmSync(templatePath, { force: true });
  }

  private ensureDefaults(): void {
    mkdirSync(this.templateRoot, { recursive: true });
    for (const [name, content] of Object.entries(DEFAULT_TEMPLATES)) {
      const templatePath = path.join(this.templateRoot, `${name}.md`);
      if (!existsSync(templatePath)) {
        writeFileSync(templatePath, content, "utf8");
      }
    }
  }

  private resolveTemplatePath(name: string): string {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
      throw new Error("VALIDATION_ERROR");
    }
    return path.join(this.templateRoot, `${name}.md`);
  }
}
