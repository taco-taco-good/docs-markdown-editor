import assert from "node:assert/strict";
import test from "node:test";

import { applyTheme, resolveTheme } from "../src/lib/themes.ts";

test("applyTheme writes semantic color and browser chrome metadata", () => {
  const properties = new Map<string, string>();
  const attributes = new Map<string, string>();
  const themeColorMeta = { content: "" };
  const favicon = { href: "" };
  const appleTouchIcon = { href: "" };

  const previousDocument = globalThis.document;

  const style = {
    colorScheme: "",
    setProperty(name: string, value: string) {
      properties.set(name, value);
    },
  };

  globalThis.document = {
    documentElement: {
      style,
      setAttribute(name: string, value: string) {
        attributes.set(name, value);
      },
    },
    querySelector(selector: string) {
      if (selector === 'meta[name="theme-color"]') return themeColorMeta;
      if (selector === 'link[rel="icon"]') return favicon;
      if (selector === 'link[rel="apple-touch-icon"]') return appleTouchIcon;
      return null;
    },
  } as typeof document;

  try {
    applyTheme(resolveTheme("one-light"));

    assert.equal(properties.get("--color-warning"), "#c88400");
    assert.equal(properties.get("--radius-panel"), "18px");
    assert.equal(attributes.get("data-appearance"), "light");
    assert.equal(style.colorScheme, "light");
    assert.equal(themeColorMeta.content, "#fafafa");
    assert.equal(favicon.href, "/brand-mark-light-square.png");
    assert.equal(appleTouchIcon.href, "/brand-mark-light-square.png");
  } finally {
    globalThis.document = previousDocument;
  }
});
