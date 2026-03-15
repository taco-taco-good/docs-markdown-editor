import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { SearchService } from "../src/services/search.service.ts";

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "docs-md-search-"));
}

test("SearchService returns Korean results through the CJK fallback path", () => {
  const workspace = createWorkspace();
  mkdirSync(path.join(workspace, "guide"), { recursive: true });
  writeFileSync(
    path.join(workspace, "guide", "install.md"),
    "---\ntitle: 설치 가이드\ntags: [설치]\n---\n\n마크다운 편집기 설치 방법입니다.\n",
    "utf8",
  );
  writeFileSync(
    path.join(workspace, "guide", "auth.md"),
    "---\ntitle: 인증 문서\ntags: [인증]\n---\n\nAuthentik와 로컬 로그인을 설명합니다.\n",
    "utf8",
  );

  const search = new SearchService(workspace);
  search.buildIndex();

  const installResults = search.search("설치");
  const authResults = search.search("인증");

  assert.ok(installResults.length > 0);
  assert.equal(installResults[0].path, "guide/install.md");
  assert.match(installResults[0].snippet, /설치 방법/);
  assert.ok(authResults.length > 0);
  assert.equal(authResults[0].path, "guide/auth.md");
  assert.match(authResults[0].snippet, /Authentik/);
});
