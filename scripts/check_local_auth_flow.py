#!/usr/bin/env python3

import argparse
from playwright.sync_api import sync_playwright


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the local Foldmark auth flow in a browser.")
    parser.add_argument("--base-url", default="http://127.0.0.1:3001")
    args = parser.parse_args()

    username = "beta-user"
    password = "beta-pass-1234"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_default_timeout(10_000)

        print("Open app", flush=True)
        page.goto(args.base_url, wait_until="domcontentloaded")

        print("Choose local setup", flush=True)
        page.get_by_role("button", name="로컬 계정 생성").click()
        page.get_by_label("사용자 이름").fill(username)
        page.get_by_label("표시 이름").fill("Beta User")
        page.get_by_label("비밀번호", exact=True).fill(password)
        page.get_by_label("비밀번호 확인").fill(password)
        page.get_by_role("button", name="계정 생성").click()

        print("Wait for authenticated shell", flush=True)
        page.get_by_role("button", name="로그아웃").wait_for()
        if not page.get_by_text(username).is_visible():
            raise AssertionError("Expected the authenticated header to show the username")

        cookies = page.context.cookies()
        if not any(cookie["name"] == "session_id" for cookie in cookies):
            raise AssertionError("Expected a session cookie after local account setup")

        print("Reload authenticated session", flush=True)
        page.reload(wait_until="domcontentloaded")
        page.get_by_role("button", name="로그아웃").wait_for()

        print("Logout", flush=True)
        page.get_by_role("button", name="로그아웃").click()
        page.wait_for_load_state("domcontentloaded")
        page.get_by_role("button", name="로그인").wait_for()

        print("Reject wrong password", flush=True)
        page.get_by_label("Username").fill(username)
        page.get_by_label("Password").fill("wrong-password")
        page.get_by_role("button", name="로그인").click()
        page.get_by_text("아이디 또는 비밀번호가 올바르지 않습니다.").wait_for()

        print("Login again", flush=True)
        page.get_by_label("Password").fill(password)
        page.get_by_role("button", name="로그인").click()
        page.wait_for_load_state("domcontentloaded")
        page.get_by_role("button", name="로그아웃").wait_for()

        browser.close()

    print("Local auth flow passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
