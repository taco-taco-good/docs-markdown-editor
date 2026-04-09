import assert from "node:assert/strict";
import test from "node:test";

import { autoCloseCodeFenceText } from "../src/components/editor/codemirror/code-blocks.ts";

test("autoCloseCodeFenceText inserts a closing fence for a plain opener line", () => {
  const source = "```";
  const result = autoCloseCodeFenceText(source, source.length);

  assert.deepEqual(result, {
    doc: "```\n\n```",
    selection: { from: 4, to: 4 },
  });
});

test("autoCloseCodeFenceText preserves language info and indentation", () => {
  const source = "  ```ts";
  const result = autoCloseCodeFenceText(source, source.length);

  assert.deepEqual(result, {
    doc: "  ```ts\n\n  ```",
    selection: { from: 8, to: 8 },
  });
});

test("autoCloseCodeFenceText does not duplicate an immediate existing closing fence", () => {
  const source = "```ts\n```";
  const result = autoCloseCodeFenceText(source, 5);

  assert.equal(result, null);
});
