import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable

from playwright.sync_api import sync_playwright


DEFAULT_BASE_URL = "http://127.0.0.1:3001"
DEFAULT_USERNAME = "admin"
DEFAULT_PASSWORD = "admin"


@dataclass
class Session:
  base_url: str
  cookie: str


def login(base_url: str, username: str, password: str) -> Session:
  request = urllib.request.Request(
    f"{base_url}/auth/login",
    data=json.dumps({"username": username, "password": password}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
  )
  with urllib.request.urlopen(request) as response:
    cookie_header = response.headers["Set-Cookie"]
  cookie = cookie_header.split(";", 1)[0].split("=", 1)[1]
  return Session(base_url=base_url, cookie=cookie)


def request_json(session: Session, path: str, method: str = "GET", payload: dict | None = None):
  body = None if payload is None else json.dumps(payload).encode()
  request = urllib.request.Request(
    f"{session.base_url}{path}",
    data=body,
    headers={
      "Content-Type": "application/json",
      "Cookie": f"session_id={session.cookie}",
    },
    method=method,
  )
  with urllib.request.urlopen(request) as response:
    raw = response.read().decode()
  return json.loads(raw)["data"] if raw else None


def upsert_document(session: Session, doc_path: str, raw: str) -> None:
  encoded = urllib.parse.quote(doc_path, safe="")
  request_json(session, f"/api/docs/{encoded}", method="PUT", payload={"content": raw})


def get_document_raw(session: Session, doc_path: str) -> str:
  encoded = urllib.parse.quote(doc_path, safe="")
  document = request_json(session, f"/api/docs/{encoded}")
  return document["raw"]


def create_page(context, session: Session, doc_path: str):
  context.add_cookies([{
    "name": "session_id",
    "value": session.cookie,
    "url": session.base_url,
    "httpOnly": True,
    "sameSite": "Lax",
  }])
  page = context.new_page()
  page.add_init_script(f"localStorage.setItem('docs-md-last-path', {json.dumps(doc_path)})")
  page.goto(session.base_url, wait_until="domcontentloaded")
  page.wait_for_timeout(1800)
  page.locator(".cm-editor").wait_for(timeout=10000)
  return page


def editor_scroll_state(page) -> dict:
  return page.evaluate(
    """() => {
      const scroller = document.querySelector('.docs-editor-codemirror') || document.querySelector('.cm-scroller');
      return {
        windowY: window.scrollY,
        scrollerTop: scroller ? scroller.scrollTop : null,
      };
    }"""
  )


def collect_page_issues(page) -> list[str]:
  issues: list[str] = []
  page.on("pageerror", lambda error: issues.append(f"pageerror:{error}"))
  page.on("console", lambda msg: issues.append(f"console:{msg.type}:{msg.text}"))
  return issues


def focus_line_end(page, text: str) -> None:
  line = page.locator(".cm-line").filter(has_text=text).first
  line.wait_for(timeout=5000)
  box = line.bounding_box()
  if not box:
    raise AssertionError(f"Could not resolve bounding box for line: {text}")
  page.mouse.click(box["x"] + max(box["width"] - 8, 8), box["y"] + box["height"] / 2)
  page.wait_for_timeout(150)


def open_tree_document(page, name: str) -> None:
  node = page.locator("[data-tree-node='true']").filter(has_text=name).first
  node.wait_for(timeout=10000)
  node.click()
  page.wait_for_timeout(800)


def open_document_via_search(page, query: str) -> None:
  modifier = "Meta" if sys.platform == "darwin" else "Control"
  page.keyboard.press(f"{modifier}+p")
  search_input = page.locator("input[placeholder='문서 검색…']")
  search_input.wait_for(timeout=10000)
  search_input.fill(query)
  page.wait_for_timeout(600)
  page.keyboard.press("Enter")
  page.wait_for_timeout(900)


def assert_no_runtime_issues(issues: list[str], case_name: str) -> None:
  relevant = [issue for issue in issues if "favicon" not in issue.lower()]
  if relevant:
    raise AssertionError(f"[{case_name}] runtime issues detected: {relevant}")


def case_rich_preview_open(session: Session, suffix: str) -> None:
  doc_path = f"regression/rich-preview-{suffix}.md"
  upsert_document(
    session,
    doc_path,
    "\n".join([
      "# Rich Preview",
      "",
      "See [OpenAI](https://openai.com) and [Guide](guide/internal.md).",
      "",
      "| Name | Link |",
      "| --- | --- |",
      "| Alpha | [OpenAI](https://openai.com) |",
      "",
    ]),
  )
  upsert_document(session, "guide/internal.md", "# Internal Guide\n")

  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    page = create_page(context, session, doc_path)
    issues = collect_page_issues(page)
    page.wait_for_timeout(1200)

    table_widgets = page.locator(".cm-md-table-widget").count()
    link_widgets = page.locator(".cm-md-link-widget").count()
    body_text = page.locator("body").inner_text()
    browser.close()

  assert table_widgets >= 1, "[rich-preview-open] expected rendered table widget"
  assert link_widgets >= 2, "[rich-preview-open] expected rendered link widgets"
  assert "Rich Preview" in body_text
  assert_no_runtime_issues(issues, "rich-preview-open")


def case_outline_scroll(session: Session, suffix: str) -> None:
  filler = "\n".join(f"paragraph {index}" for index in range(40))
  doc_path = f"regression/outline-scroll-{suffix}.md"
  upsert_document(
    session,
    doc_path,
    "\n".join([
      "# Outline Scroll",
      "",
      "## Section Alpha",
      filler,
      "",
      "### Section Beta",
      filler,
      "",
      "#### Section Gamma",
      filler,
      "",
    ]),
  )

  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    page = create_page(context, session, doc_path)
    issues = collect_page_issues(page)
    page.locator(".docs-editor-outline__item").filter(has_text="Section Gamma").first.click()
    page.wait_for_function(
      """() => {
        const scroller = document.querySelector('.docs-editor-codemirror') || document.querySelector('.cm-scroller');
        return Boolean(scroller && scroller.scrollTop > 40);
      }""",
      timeout=3000,
    )
    active_text = page.locator(".docs-editor-outline__item[data-active='true'] .docs-editor-outline__text").inner_text()
    scroll = page.evaluate(
      """() => {
        const scroller = document.querySelector('.docs-editor-codemirror') || document.querySelector('.cm-scroller');
        return scroller ? scroller.scrollTop : 0;
      }"""
    )
    browser.close()

  assert "Section Gamma" in active_text, "[outline-scroll] expected clicked outline item to become active"
  assert scroll > 120, f"[outline-scroll] expected editor to scroll, got {scroll}"
  assert_no_runtime_issues(issues, "outline-scroll")


def case_hr_render(session: Session, suffix: str) -> None:
  doc_path = f"regression/hr-render-{suffix}.md"
  upsert_document(
    session,
    doc_path,
    "\n".join([
      "# Divider",
      "",
      "before",
      "",
      "---",
      "",
      "after",
    ]),
  )

  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = create_page(context, session, doc_path)
    issues = collect_page_issues(page)
    page.wait_for_timeout(500)
    hr_count = page.locator(".cm-md-hr-widget").count()
    visible_text = page.locator("body").inner_text()
    browser.close()

  assert hr_count >= 1, "[hr-render] expected rendered divider widget"
  assert "before" in visible_text and "after" in visible_text
  assert_no_runtime_issues(issues, "hr-render")


def case_mobile_draft_reload(session: Session, suffix: str) -> None:
  doc_path = f"regression/mobile-draft-{suffix}.md"
  marker = f"draft-{suffix}"
  upsert_document(
    session,
    doc_path,
    "\n".join([
      "# Mobile Draft",
      "",
      "persistent line",
      "",
      "tail",
    ]),
  )

  with sync_playwright() as p:
    iphone = p.devices["iPhone 13"]
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(**iphone)
    page = create_page(context, session, doc_path)
    issues = collect_page_issues(page)
    focus_line_end(page, "persistent line")
    page.keyboard.type(f" {marker}")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(1800)
    visible_text = page.locator("body").inner_text()
    browser.close()

  raw = get_document_raw(session, doc_path)
  assert marker in visible_text or marker in raw, "[mobile-draft-reload] expected edited content to survive reload"
  assert_no_runtime_issues(issues, "mobile-draft-reload")


def case_mobile_checklist_edit(session: Session, suffix: str) -> None:
  intro = [f"preface line {index}" for index in range(18)]
  outro = [f"tail line {index}" for index in range(18)]
  doc_path = f"regression/mobile-checklist-{suffix}.md"
  marker = f"ok-{suffix}"
  upsert_document(
    session,
    doc_path,
    "\n".join([
      "# Mobile Checklist",
      "",
      *intro,
      "",
      "- [ ] first",
      "- [ ] second",
      "",
      *outro,
      "",
    ]),
  )

  with sync_playwright() as p:
    iphone = p.devices["iPhone 13"]
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(**iphone)
    page = create_page(context, session, doc_path)
    issues = collect_page_issues(page)

    page.evaluate(
      """() => {
        const scroller = document.querySelector('.docs-editor-codemirror') || document.querySelector('.cm-scroller');
        if (scroller) scroller.scrollTop = 600;
      }"""
    )
    page.wait_for_timeout(100)
    before_scroll = editor_scroll_state(page)

    focus_line_end(page, "second")
    page.keyboard.press("Enter")
    page.wait_for_timeout(120)
    page.keyboard.type("abc")
    page.wait_for_timeout(120)
    page.keyboard.press("Backspace")
    page.keyboard.press("Backspace")
    page.keyboard.press("Backspace")
    page.wait_for_timeout(120)
    page.keyboard.type(marker)
    page.wait_for_timeout(500)

    after_scroll = editor_scroll_state(page)
    visible_text = page.locator("body").inner_text()
    browser.close()

  raw = get_document_raw(session, doc_path)
  expected_block = f"- [ ] second\n- [ ] {marker}"
  assert expected_block in raw, f"[mobile-checklist-edit] expected raw block missing:\n{raw}"
  assert marker in visible_text, "[mobile-checklist-edit] expected marker to remain visible after edit"
  before_top = before_scroll.get("scrollerTop")
  after_top = after_scroll.get("scrollerTop")
  if before_top is not None and after_top is not None and before_top > 200:
    assert after_top >= 80, (
      f"[mobile-checklist-edit] unexpected scroll jump to top: before={before_top}, after={after_top}"
    )
  assert_no_runtime_issues(issues, "mobile-checklist-edit")


def case_desktop_checklist_edit(session: Session, suffix: str) -> None:
  intro = [f"preface line {index}" for index in range(18)]
  outro = [f"tail line {index}" for index in range(18)]
  doc_path = f"regression/desktop-checklist-{suffix}.md"
  marker = f"desktop-{suffix}"
  upsert_document(
    session,
    doc_path,
    "\n".join([
      "# Desktop Checklist",
      "",
      *intro,
      "",
      "- [ ] first",
      "- [ ] second",
      "",
      *outro,
      "",
    ]),
  )

  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    page = create_page(context, session, doc_path)
    issues = collect_page_issues(page)

    page.evaluate(
      """() => {
        const scroller = document.querySelector('.docs-editor-codemirror') || document.querySelector('.cm-scroller');
        if (scroller) scroller.scrollTop = 600;
      }"""
    )
    page.wait_for_timeout(100)
    before_scroll = editor_scroll_state(page)

    focus_line_end(page, "second")
    page.keyboard.press("Enter")
    page.wait_for_timeout(120)
    page.keyboard.type("abc")
    page.wait_for_timeout(120)
    page.keyboard.press("Backspace")
    page.keyboard.press("Backspace")
    page.keyboard.press("Backspace")
    page.wait_for_timeout(120)
    page.keyboard.type(marker)
    page.wait_for_timeout(500)

    after_scroll = editor_scroll_state(page)
    visible_text = page.locator("body").inner_text()
    browser.close()

  raw = get_document_raw(session, doc_path)
  expected_block = f"- [ ] second\n- [ ] {marker}"
  assert expected_block in raw, f"[desktop-checklist-edit] expected raw block missing:\n{raw}"
  assert marker in visible_text, "[desktop-checklist-edit] expected marker to remain visible after edit"
  before_top = before_scroll.get("scrollerTop")
  after_top = after_scroll.get("scrollerTop")
  if before_top is not None and after_top is not None and before_top > 200:
    assert after_top >= 80, (
      f"[desktop-checklist-edit] unexpected scroll jump to top: before={before_top}, after={after_top}"
    )
  assert_no_runtime_issues(issues, "desktop-checklist-edit")


def case_desktop_multiline_delete(session: Session, suffix: str) -> None:
  doc_path = f"regression/desktop-multiline-delete-{suffix}.md"
  upsert_document(
    session,
    doc_path,
    "\n".join([
      "# Desktop Delete",
      "",
      "alpha line",
      "beta line",
      "gamma line",
      "delta line",
      "",
      "tail line",
      "",
    ]),
  )

  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    page = create_page(context, session, doc_path)
    issues = collect_page_issues(page)

    focus_line_end(page, "alpha line")
    page.keyboard.press("Home")
    page.keyboard.press("Shift+ArrowDown")
    page.keyboard.press("Shift+ArrowDown")
    page.keyboard.press("Shift+ArrowDown")
    page.wait_for_timeout(100)
    page.keyboard.press("Backspace")
    page.wait_for_timeout(500)

    visible_editor = page.locator(".cm-editor").is_visible()
    body_text = page.locator("body").inner_text()
    browser.close()

  raw = get_document_raw(session, doc_path)
  assert visible_editor, "[desktop-multiline-delete] expected editor to remain visible"
  assert "Desktop Delete" in body_text, "[desktop-multiline-delete] expected document title to remain rendered"
  assert "tail line" in body_text, "[desktop-multiline-delete] expected trailing content to remain visible"
  assert "alpha line" not in raw and "beta line" not in raw, (
    f"[desktop-multiline-delete] expected selected lines to be removed:\n{raw}"
  )
  assert_no_runtime_issues(issues, "desktop-multiline-delete")


def case_desktop_external_link_click(session: Session, suffix: str) -> None:
  doc_path = f"regression/desktop-external-link-{suffix}.md"
  upsert_document(
    session,
    doc_path,
    "\n".join([
      "# External Link",
      "",
      "Visit [OpenAI](https://openai.com) now.",
      "",
      "tail line",
      "",
    ]),
  )

  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    page = create_page(context, session, doc_path)
    issues = collect_page_issues(page)

    page.evaluate(
      """() => {
        window.__openedLinks = [];
        window.open = (...args) => {
          window.__openedLinks.push(args);
          return null;
        };
      }"""
    )
    page.locator(".cm-md-link-widget").filter(has_text="OpenAI").first.click()
    page.wait_for_timeout(250)

    opened = page.evaluate("() => window.__openedLinks")
    body_text = page.locator("body").inner_text()
    browser.close()

  assert opened and opened[0][0] == "https://openai.com", (
    f"[desktop-external-link-click] expected window.open to receive the external URL, got {opened}"
  )
  assert "tail line" in body_text, "[desktop-external-link-click] expected editor content to remain visible"
  assert_no_runtime_issues(issues, "desktop-external-link-click")


def case_desktop_task_toggle(session: Session, suffix: str) -> None:
  doc_path = f"regression/desktop-task-toggle-{suffix}.md"
  upsert_document(
    session,
    doc_path,
    "\n".join([
      "# Toggle Task",
      "",
      "- [ ] first task",
      "",
    ]),
  )

  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    page = create_page(context, session, doc_path)
    issues = collect_page_issues(page)
    focus_line_end(page, "Toggle Task")

    page.locator(".cm-md-task-toggle").first.wait_for(timeout=10000)
    page.locator(".cm-md-task-toggle").first.click()
    page.wait_for_timeout(500)
    checked_raw = get_document_raw(session, doc_path)

    focus_line_end(page, "Toggle Task")
    page.locator(".cm-md-task-toggle").first.wait_for(timeout=10000)
    page.locator(".cm-md-task-toggle").first.click()
    page.wait_for_timeout(500)
    unchecked_raw = get_document_raw(session, doc_path)
    browser.close()

  assert "- [x] first task" in checked_raw, (
    f"[desktop-task-toggle] expected first click to check task, got:\n{checked_raw}"
  )
  assert "- [ ] first task" in unchecked_raw, (
    f"[desktop-task-toggle] expected second click to uncheck task, got:\n{unchecked_raw}"
  )
  assert_no_runtime_issues(issues, "desktop-task-toggle")


def case_desktop_tabs_restore(session: Session, suffix: str) -> None:
  doc_a = f"regression/tabs-a-{suffix}.md"
  doc_b = f"regression/tabs-b-{suffix}.md"
  marker_a = f"A-{suffix}"
  marker_b = f"B-{suffix}"

  upsert_document(
    session,
    doc_a,
    "\n".join([
      "# Tab A",
      "",
      "alpha line",
      "",
    ]),
  )
  upsert_document(
    session,
    doc_b,
    "\n".join([
      "# Tab B",
      "",
      "beta line",
      "",
    ]),
  )

  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    page = create_page(context, session, doc_a)
    issues = collect_page_issues(page)

    focus_line_end(page, "alpha line")
    page.keyboard.type(f" {marker_a}")
    page.wait_for_timeout(200)

    open_document_via_search(page, doc_b.split("/")[-1])
    page.locator(f"[data-tab-activate='{doc_a}']").wait_for(timeout=10000)
    page.locator(f"[data-tab-activate='{doc_b}']").wait_for(timeout=10000)

    focus_line_end(page, "beta line")
    page.keyboard.type(f" {marker_b}")
    page.wait_for_timeout(200)

    page.locator(f"[data-tab-activate='{doc_a}']").click()
    page.wait_for_timeout(400)
    visible_a = page.locator("body").inner_text()

    page.locator(f"[data-tab-activate='{doc_b}']").click()
    page.wait_for_timeout(400)
    visible_b = page.locator("body").inner_text()

    browser.close()

  raw_a = get_document_raw(session, doc_a)
  raw_b = get_document_raw(session, doc_b)
  assert marker_a in raw_a, f"[desktop-tabs-restore] expected first tab edit in raw:\n{raw_a}"
  assert marker_b in raw_b, f"[desktop-tabs-restore] expected second tab edit in raw:\n{raw_b}"
  assert marker_a in visible_a, "[desktop-tabs-restore] expected first tab edit after switching back"
  assert marker_b in visible_b, "[desktop-tabs-restore] expected second tab edit after switching back"
  assert_no_runtime_issues(issues, "desktop-tabs-restore")


CASES: dict[str, Callable[[Session, str], None]] = {
  "rich-preview-open": case_rich_preview_open,
  "outline-scroll": case_outline_scroll,
  "hr-render": case_hr_render,
  "mobile-draft-reload": case_mobile_draft_reload,
  "mobile-checklist-edit": case_mobile_checklist_edit,
  "desktop-checklist-edit": case_desktop_checklist_edit,
  "desktop-task-toggle": case_desktop_task_toggle,
  "desktop-tabs-restore": case_desktop_tabs_restore,
  "desktop-multiline-delete": case_desktop_multiline_delete,
  "desktop-external-link-click": case_desktop_external_link_click,
}

DEFAULT_CASES = [
  "rich-preview-open",
  "outline-scroll",
  "hr-render",
  "desktop-checklist-edit",
  "desktop-tabs-restore",
  "desktop-multiline-delete",
  "desktop-external-link-click",
]


def main() -> int:
  parser = argparse.ArgumentParser(description="Foldmark Playwright regression suite")
  parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
  parser.add_argument("--username", default=DEFAULT_USERNAME)
  parser.add_argument("--password", default=DEFAULT_PASSWORD)
  parser.add_argument(
    "--cases",
    default="all",
    help="Comma-separated case names or 'all'. Available: " + ", ".join(CASES.keys()),
  )
  args = parser.parse_args()

  requested = DEFAULT_CASES if args.cases == "all" else [name.strip() for name in args.cases.split(",") if name.strip()]
  unknown = [name for name in requested if name not in CASES]
  if unknown:
    raise SystemExit(f"Unknown cases: {', '.join(unknown)}")

  session = login(args.base_url, args.username, args.password)
  suffix = str(int(time.time()))

  for name in requested:
    print(f"[regression] running {name}", flush=True)
    CASES[name](session, suffix)

  print("[regression] all requested cases passed", flush=True)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
