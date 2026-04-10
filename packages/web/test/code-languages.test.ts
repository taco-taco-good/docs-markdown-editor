import assert from "node:assert/strict";
import test from "node:test";

import { supportsCodeLanguage } from "../src/components/editor/codemirror/code-languages.ts";

test("supports common fenced code block language names", () => {
  assert.equal(supportsCodeLanguage("ts"), true);
  assert.equal(supportsCodeLanguage("javascript"), true);
  assert.equal(supportsCodeLanguage("json"), true);
  assert.equal(supportsCodeLanguage("bash"), true);
  assert.equal(supportsCodeLanguage("yaml"), true);
});

test("returns false for unsupported language names", () => {
  assert.equal(supportsCodeLanguage("brainfuck"), false);
});
