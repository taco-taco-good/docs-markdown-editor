import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass

from playwright.sync_api import sync_playwright


DEFAULT_BASE_URL = "http://127.0.0.1:3001"
DEFAULT_USERNAME = "admin"
DEFAULT_PASSWORD = "admin"
DEFAULT_ITERATIONS = 5


@dataclass
class Session:
  base_url: str
  cookie: str


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


def build_initial_markdown() -> str:
  intro = [f"preface line {index}" for index in range(18)]
  outro = [f"tail line {index}" for index in range(18)]
  lines = [
    "# Mobile Checklist Regression",
    "",
    *intro,
    "",
    "- [ ] first",
    "- [ ] second",
    "",
    *outro,
    "",
  ]
  return "\n".join(lines)


def wait_for_saved(page) -> None:
  page.wait_for_timeout(900)


def editor_scroll_state(page) -> dict:
  return page.evaluate(
    """() => {
      const scroller = document.querySelector('.cm-scroller');
      return {
        windowY: window.scrollY,
        scrollerTop: scroller ? scroller.scrollTop : null,
      };
    }"""
  )


def open_document(page, base_url: str, cookie: str, doc_path: str) -> None:
  page.context.add_cookies([{
    "name": "session_id",
    "value": cookie,
    "url": base_url,
    "httpOnly": True,
    "sameSite": "Lax",
  }])
  page.add_init_script(f"localStorage.setItem('docs-md-last-path', {json.dumps(doc_path)})")
  page.goto(base_url, wait_until="domcontentloaded")
  page.wait_for_timeout(1800)
  page.locator(".cm-editor").wait_for(timeout=10000)


def focus_task_line_end(page, text: str) -> None:
  line = page.locator(".cm-line").filter(has_text=text).first
  line.wait_for(timeout=5000)
  box = line.bounding_box()
  if not box:
    raise AssertionError(f"Could not resolve bounding box for line: {text}")
  page.mouse.click(box["x"] + max(box["width"] - 8, 8), box["y"] + (box["height"] / 2))
  page.wait_for_timeout(120)


def run_iteration(session: Session, doc_path: str, expected_marker: str, iteration: int) -> None:
  encoded_path = urllib.parse.quote(doc_path, safe="")
  initial_markdown = build_initial_markdown()
  request_json(session, f"/api/docs/{encoded_path}", method="PUT", payload={"content": initial_markdown})

  with sync_playwright() as p:
    iphone = p.devices["iPhone 13"]
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(**iphone)
    page = context.new_page()

    open_document(page, session.base_url, session.cookie, doc_path)

    page.evaluate(
      """() => {
        const scroller = document.querySelector('.cm-scroller');
        if (scroller) scroller.scrollTop = 600;
      }"""
    )
    page.wait_for_timeout(100)
    before_scroll = editor_scroll_state(page)

    focus_task_line_end(page, "second")
    page.keyboard.press("Enter")
    page.wait_for_timeout(120)
    page.keyboard.type("abc")
    page.wait_for_timeout(120)
    page.keyboard.press("Backspace")
    page.keyboard.press("Backspace")
    page.keyboard.press("Backspace")
    page.wait_for_timeout(120)
    page.keyboard.type(expected_marker)
    wait_for_saved(page)

    after_scroll = editor_scroll_state(page)
    document = request_json(session, f"/api/docs/{encoded_path}")
    browser.close()

  expected_block = f"- [ ] second\n- [ ] {expected_marker}"
  if expected_block not in document["raw"]:
    raise AssertionError(
      f"[iteration {iteration}] checklist regression detected\n"
      f"expected block: {expected_block!r}\n"
      f"actual raw:\n{document['raw']}"
    )

  before_top = before_scroll.get("scrollerTop")
  after_top = after_scroll.get("scrollerTop")
  if before_top is not None and after_top is not None and before_top > 200 and after_top < 80:
    raise AssertionError(
      f"[iteration {iteration}] editor scroll jumped to top unexpectedly: before={before_top}, after={after_top}"
    )


def main() -> int:
  parser = argparse.ArgumentParser(description="Mobile checklist editor regression runner")
  parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
  parser.add_argument("--username", default=DEFAULT_USERNAME)
  parser.add_argument("--password", default=DEFAULT_PASSWORD)
  parser.add_argument("--iterations", type=int, default=DEFAULT_ITERATIONS)
  parser.add_argument("--doc-prefix", default="regression/mobile-checklist")
  args = parser.parse_args()

  session = login(args.base_url, args.username, args.password)
  started_at = int(time.time())

  for iteration in range(1, args.iterations + 1):
    doc_path = f"{args.doc_prefix}-{started_at}-{iteration}.md"
    marker = f"ok-{iteration}"
    print(f"[mobile-regression] iteration {iteration}/{args.iterations}: {doc_path}", flush=True)
    run_iteration(session, doc_path, marker, iteration)

  print("[mobile-regression] all iterations passed", flush=True)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
