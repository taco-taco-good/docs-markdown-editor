const UNSUPPORTED_PATTERNS = [/^\[\^[^\]]+\]:/m, /^:::/m, /^<details>/m];

export function supportsWysiwygMarkdown(raw: string): boolean {
  return UNSUPPORTED_PATTERNS.every((pattern) => !pattern.test(raw));
}
