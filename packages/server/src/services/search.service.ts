import { readFileSync } from "node:fs";
import path from "node:path";

import { extractTitle, parseMarkdownDocument } from "../../../shared/src/markdown-document.ts";
import { listMarkdownFiles, resolveWorkspacePath } from "../lib/workspace.ts";

interface IndexedDocument {
  path: string;
  title: string;
  content: string;
  tags: string[];
  normalizedTitle: string;
  normalizedContent: string;
  asciiTokens: Set<string>;
  cjkTokens2: Set<string>;
  cjkTokens3: Set<string>;
}

interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
}

function normalizeText(value: string): string {
  return value.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

function containsCjk(value: string): boolean {
  return /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
}

function asciiTokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(/[^a-z0-9]+/).filter((token) => token.length > 1));
}

function ngrams(value: string, size: number): Set<string> {
  const compact = normalizeText(value).replace(/\s+/g, "");
  const tokens = new Set<string>();
  if (compact.length < size) {
    if (compact.length > 0) tokens.add(compact);
    return tokens;
  }
  for (let index = 0; index <= compact.length - size; index += 1) {
    tokens.add(compact.slice(index, index + size));
  }
  return tokens;
}

function createSnippet(content: string, query: string, maxLength = 140): string {
  const plainContent = content.replace(/\s+/g, " ").trim();
  if (!plainContent) return "";

  const lowerContent = plainContent.toLowerCase();
  const normalizedQuery = normalizeText(query);
  const asciiQueryTokens = [...asciiTokens(query)].sort((left, right) => right.length - left.length);
  const candidateNeedles = [
    query.trim(),
    normalizedQuery,
    ...asciiQueryTokens,
  ].filter(Boolean);

  let matchIndex = -1;
  let matchLength = 0;

  for (const candidate of candidateNeedles) {
    const index = lowerContent.indexOf(candidate.toLowerCase());
    if (index >= 0) {
      matchIndex = index;
      matchLength = candidate.length;
      break;
    }
  }

  if (matchIndex < 0) {
    return plainContent.length <= maxLength
      ? plainContent
      : `${plainContent.slice(0, maxLength - 1).trimEnd()}…`;
  }

  const contextRadius = Math.max(Math.floor((maxLength - matchLength) / 2), 24);
  const start = Math.max(0, matchIndex - contextRadius);
  const end = Math.min(plainContent.length, matchIndex + matchLength + contextRadius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < plainContent.length ? "…" : "";
  return `${prefix}${plainContent.slice(start, end).trim()}${suffix}`;
}

export class SearchService {
  private readonly documents = new Map<string, IndexedDocument>();
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  buildIndex(): void {
    this.documents.clear();
    for (const relativePath of listMarkdownFiles(this.workspaceRoot)) {
      const absolutePath = resolveWorkspacePath(this.workspaceRoot, relativePath);
      const raw = readFileSync(absolutePath, "utf8");
      const document = parseMarkdownDocument(raw);
      const title = extractTitle(relativePath, document);
      const tags = Array.isArray(document.frontmatter.tags)
        ? document.frontmatter.tags.map(String)
        : [];
      this.documents.set(relativePath, {
        path: relativePath,
        title,
        content: document.body,
        tags,
        normalizedTitle: normalizeText(title),
        normalizedContent: normalizeText(document.body),
        asciiTokens: asciiTokens(`${title} ${document.body} ${relativePath}`),
        cjkTokens2: ngrams(`${title} ${document.body}`, 2),
        cjkTokens3: ngrams(`${title} ${document.body}`, 3),
      });
    }
  }

  search(query: string, limit = 10): SearchResult[] {
    const normalizedQuery = normalizeText(query);
    const queryAsciiTokens = asciiTokens(query);
    const useCjk = containsCjk(query);
    const query2 = useCjk ? ngrams(query, 2) : new Set<string>();
    const query3 = useCjk && normalizedQuery.replace(/\s+/g, "").length >= 4 ? ngrams(query, 3) : new Set<string>();
    const results: SearchResult[] = [];

    for (const document of this.documents.values()) {
      let flexScore = 0;
      for (const token of queryAsciiTokens) {
        if (document.asciiTokens.has(token)) flexScore += 1;
      }
      if (document.normalizedTitle.includes(normalizedQuery)) flexScore += 3;
      if (document.path.toLowerCase().includes(normalizedQuery)) flexScore += 2;

      let cjkScore = 0;
      if (useCjk) {
        for (const token of query2) {
          if (document.cjkTokens2.has(token)) cjkScore += 1;
        }
        for (const token of query3) {
          if (document.cjkTokens3.has(token)) cjkScore += 1.2;
        }
      }

      const titleBonus = document.normalizedTitle.includes(normalizedQuery) ? 2 : 0;
      const exactPathBonus = path.basename(document.path, ".md").toLowerCase() === normalizedQuery ? 1.5 : 0;
      const finalScore = Math.max(flexScore, 0.85 * cjkScore) + titleBonus + exactPathBonus;

      if (finalScore > 0) {
        results.push({
          path: document.path,
          title: document.title,
          snippet: createSnippet(document.content, query),
          score: Number(finalScore.toFixed(2)),
        });
      }
    }

    return results.sort((left, right) => right.score - left.score).slice(0, limit);
  }
}
