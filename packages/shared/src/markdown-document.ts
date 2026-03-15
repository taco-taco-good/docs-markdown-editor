import path from "node:path";

import {
  type FrontmatterValue,
  mergeFrontmatter,
  parseFrontmatter,
  serializeFrontmatter,
} from "./frontmatter.ts";

export interface MarkdownDocument {
  raw: string;
  frontmatter: Record<string, FrontmatterValue>;
  rawFrontmatterBlock: string;
  body: string;
  hasFrontmatter: boolean;
  isStructuredEditSafe: boolean;
}

const UNSUPPORTED_PATTERNS = [
  /^\[\^[^\]]+\]:/m,
  /^:::/m,
  /^<details>/m,
];

export function parseMarkdownDocument(raw: string): MarkdownDocument {
  const parsed = parseFrontmatter(raw);
  return {
    raw,
    frontmatter: parsed.data,
    rawFrontmatterBlock: parsed.rawBlock,
    body: parsed.body,
    hasFrontmatter: parsed.hasFrontmatter,
    isStructuredEditSafe: parsed.isStructuredEditSafe,
  };
}

export function composeRawPreservingFrontmatter(
  document: MarkdownDocument,
  nextBody: string,
): string {
  if (!document.hasFrontmatter) return nextBody;
  return `${document.rawFrontmatterBlock}${nextBody}`;
}

export function updateStructuredFrontmatter(
  document: MarkdownDocument,
  updates: Record<string, FrontmatterValue>,
): string {
  if (!document.isStructuredEditSafe) {
    throw new Error("Frontmatter requires raw mode for safe editing");
  }
  const merged = mergeFrontmatter(document.frontmatter, updates);
  return serializeFrontmatter(merged, document.body);
}

export function extractTitle(docPath: string, document: MarkdownDocument): string {
  const title = document.frontmatter.title;
  if (typeof title === "string" && title.trim() !== "") return title;

  const heading = /^#\s+(.+)$/m.exec(document.body);
  if (heading) return heading[1].trim();

  return path.basename(docPath, path.extname(docPath));
}

export function analyzeMarkdownSupport(raw: string): {
  supportedInWysiwyg: boolean;
  reasons: string[];
} {
  const reasons = UNSUPPORTED_PATTERNS.filter((pattern) => pattern.test(raw)).map((pattern) =>
    `Matched unsupported markdown pattern: ${pattern.toString()}`,
  );

  return {
    supportedInWysiwyg: reasons.length === 0,
    reasons,
  };
}
