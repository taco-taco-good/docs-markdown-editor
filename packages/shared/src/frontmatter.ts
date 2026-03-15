export type FrontmatterValue = string | string[] | number | boolean | null;

export interface ParsedFrontmatter {
  data: Record<string, FrontmatterValue>;
  rawBlock: string;
  body: string;
  hasFrontmatter: boolean;
  isStructuredEditSafe: boolean;
}

const FRONTMATTER_START = "---";

function splitLines(value: string): string[] {
  return value.split(/\r?\n/);
}

function parseScalar(value: string): FrontmatterValue {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineArray(value: string): string[] {
  return value
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => String(parseScalar(item)));
}

function parseFrontmatterData(source: string): {
  data: Record<string, FrontmatterValue>;
  safe: boolean;
} {
  const lines = splitLines(source);
  const data: Record<string, FrontmatterValue> = {};
  let safe = true;
  let activeListKey: string | null = null;

  for (const line of lines) {
    if (line.trim() === "" || line.trim().startsWith("#")) {
      activeListKey = null;
      continue;
    }

    if (/^\s+-\s+/.test(line)) {
      if (!activeListKey) {
        safe = false;
        continue;
      }
      const value = line.replace(/^\s+-\s+/, "");
      const current = data[activeListKey];
      if (!Array.isArray(current)) {
        data[activeListKey] = [];
      }
      (data[activeListKey] as string[]).push(String(parseScalar(value)));
      continue;
    }

    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) {
      safe = false;
      activeListKey = null;
      continue;
    }

    const [, key, rawValue] = match;
    if (rawValue === "") {
      data[key] = [];
      activeListKey = key;
      continue;
    }

    activeListKey = null;
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      data[key] = parseInlineArray(rawValue);
      continue;
    }

    data[key] = parseScalar(rawValue);
  }

  return { data, safe };
}

function findFrontmatterEnd(raw: string): number {
  const normalized = raw.replace(/\r\n/g, "\n");
  let cursor = FRONTMATTER_START.length + 1;
  const lines = normalized.split("\n");

  if (lines[0] !== FRONTMATTER_START) return -1;

  for (let index = 1; index < lines.length; index += 1) {
    cursor += lines[index].length + 1;
    if (lines[index] === FRONTMATTER_START) {
      return cursor;
    }
  }

  return -1;
}

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  if (!raw.startsWith(`${FRONTMATTER_START}\n`) && !raw.startsWith(`${FRONTMATTER_START}\r\n`)) {
    return {
      data: {},
      rawBlock: "",
      body: raw,
      hasFrontmatter: false,
      isStructuredEditSafe: true,
    };
  }

  const endIndex = findFrontmatterEnd(raw);
  if (endIndex === -1) {
    return {
      data: {},
      rawBlock: "",
      body: raw,
      hasFrontmatter: false,
      isStructuredEditSafe: false,
    };
  }

  const rawBlock = raw.slice(0, endIndex);
  const body = raw.slice(endIndex);
  const normalizedBlock = rawBlock.replace(/\r\n/g, "\n");
  const inner = normalizedBlock.slice(4, normalizedBlock.lastIndexOf("\n---\n"));
  const parsed = parseFrontmatterData(inner);

  return {
    data: parsed.data,
    rawBlock,
    body,
    hasFrontmatter: true,
    isStructuredEditSafe: parsed.safe,
  };
}

export function serializeFrontmatter(
  data: Record<string, FrontmatterValue>,
  body: string,
): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
      continue;
    }
    if (typeof value === "string") {
      lines.push(`${key}: ${value}`);
      continue;
    }
    if (value === null) {
      lines.push(`${key}: null`);
      continue;
    }
    lines.push(`${key}: ${String(value)}`);
  }
  lines.push("---", "");
  return `${lines.join("\n")}${body}`;
}

export function mergeFrontmatter(
  existing: Record<string, FrontmatterValue>,
  updates: Record<string, FrontmatterValue>,
): Record<string, FrontmatterValue> {
  return { ...existing, ...updates };
}
