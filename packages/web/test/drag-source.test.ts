import assert from "node:assert/strict";
import test from "node:test";

import {
  clearDragSource,
  CUSTOM_MIME_TYPE,
  getDragSource,
  setDragSource,
} from "../src/components/tree/drag-source.ts";

function createDataTransfer(values: Record<string, string>) {
  return {
    getData(type: string) {
      return values[type] ?? "";
    },
  } as DataTransfer;
}

test("getDragSource prefers custom mime data and falls back to module state", () => {
  clearDragSource();
  setDragSource("fallback/path.md");

  assert.equal(
    getDragSource(createDataTransfer({ [CUSTOM_MIME_TYPE]: "custom/path.md", "text/plain": "plain/path.md" })),
    "custom/path.md",
  );
  assert.equal(
    getDragSource(createDataTransfer({ "text/plain": "plain/path.md" })),
    "plain/path.md",
  );
  assert.equal(
    getDragSource(createDataTransfer({})),
    "fallback/path.md",
  );

  clearDragSource();
});
