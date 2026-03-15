import os
from pathlib import Path
from time import time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright


BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:5173")
USERNAME = os.getenv("E2E_USERNAME", "admin")
PASSWORD = os.getenv("E2E_PASSWORD", "admin")
WORKSPACE_ROOT = os.getenv("E2E_WORKSPACE_ROOT", "/Users/taco/projects/docs-markdown-editor-data")


def wait_for_saved(page):
    page.get_by_text("저장됨").wait_for(timeout=10000)


def wait_for_modal_hidden(page, name: str):
    try:
        page.get_by_role("heading", name=name).wait_for(state="hidden", timeout=10000)
    except PlaywrightTimeoutError:
        print("body-text:", page.locator("body").inner_text()[:3000], flush=True)
        page.screenshot(path=str(Path("/tmp") / "docs-markdown-editor-modal-timeout.png"), full_page=True)
        raise


def tree_button(page, label: str):
    return page.locator('nav[role="tree"] [role="button"]').filter(has_text=label).first


def begin_drag(page, source, target):
    data_transfer = page.evaluate_handle("new DataTransfer()")
    source.dispatch_event("dragstart", {"dataTransfer": data_transfer})
    target.dispatch_event("dragenter", {"dataTransfer": data_transfer})
    target.dispatch_event("dragover", {"dataTransfer": data_transfer})
    return data_transfer


def finish_drag(source, target, data_transfer):
    target.dispatch_event("drop", {"dataTransfer": data_transfer})
    source.dispatch_event("dragend", {"dataTransfer": data_transfer})


def main():
    suffix = str(int(time()))
    folder_name = f"playwright-folder-{suffix}"
    doc_slug = f"playwright-smoke-{suffix}"
    renamed_doc_slug = f"{doc_slug}-renamed"
    nested_doc_slug = f"{doc_slug}-inside-folder"
    renamed_folder_name = f"{folder_name}-renamed"
    template_name = f"pw-template-{suffix}"
    template_doc_slug = f"template-smoke-{suffix}"

    def step(message: str):
        print(message, flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1080})
        page.set_default_timeout(10000)
        step("open app")
        page.goto(BASE_URL, wait_until="networkidle")

        if page.get_by_role("button", name="로그인").count():
            step("login")
            page.locator('input[type="text"]').fill(USERNAME)
            page.locator('input[type="password"]').fill(PASSWORD)
            page.get_by_role("button", name="로그인").click()
            page.wait_for_load_state("networkidle")

        step("wait explorer")
        page.get_by_text("문서", exact=True).wait_for(timeout=10000)
        page.get_by_text(f"워크스페이스 · {Path(WORKSPACE_ROOT).name}").wait_for(timeout=10000)

        step("sidebar resize")
        sidebar = page.locator("aside").first
        before_width = sidebar.bounding_box()["width"]
        handle = page.locator(".sidebar-resize-handle")
        handle_box = handle.bounding_box()
        page.mouse.move(handle_box["x"] + 2, handle_box["y"] + 12)
        page.mouse.down()
        page.mouse.move(handle_box["x"] + 64, handle_box["y"] + 12, steps=8)
        page.mouse.up()
        after_width = sidebar.bounding_box()["width"]
        assert after_width > before_width + 30

        step("create document")
        page.locator('aside button[title="새 문서"]').click()
        page.get_by_role("heading", name="새 문서").wait_for(timeout=5000)
        assert page.get_by_text("저장 위치").count() >= 1
        assert page.get_by_text("생성될 파일").count() >= 1
        page.get_by_placeholder("예: api-guide").fill(doc_slug)
        page.get_by_role("button", name="문서 생성").click()
        wait_for_modal_hidden(page, "새 문서")
        page.locator('nav[role="tree"]').get_by_text(f"{doc_slug}.md").wait_for(timeout=10000)

        editor = page.locator(".ProseMirror")
        assert page.locator(".docs-format-toolbar").count() == 1

        step("toolbar rename")
        page.locator("button[title='더블클릭해 파일 이름 변경']").dblclick()
        rename_input = page.locator("input").first
        rename_input.fill(renamed_doc_slug)
        rename_input.press("Enter")
        page.locator('nav[role="tree"]').get_by_text(f"{renamed_doc_slug}.md").wait_for(timeout=10000)
        doc_slug = renamed_doc_slug

        step("raw mode recovery")
        page.get_by_role("button", name="Raw").click()
        raw = page.locator(".raw-editor textarea")
        raw.wait_for(timeout=5000)
        raw.fill(":::note\nblocked\n:::\n")
        page.wait_for_timeout(250)
        assert page.get_by_role("button", name="편집").is_disabled()
        raw.fill("## Section Alpha\n\n### Section Beta\n\n#### Section Gamma\n\nParagraph body\n")
        wait_for_saved(page)
        edit_mode = page.get_by_role("button", name="편집")
        edit_mode.wait_for(state="visible", timeout=5000)
        assert not edit_mode.is_disabled()
        edit_mode.click()
        page.locator(".docs-editor-outline__item").filter(has_text="Section Alpha").wait_for(timeout=5000)
        page.locator(".docs-editor-outline__item").filter(has_text="Section Beta").wait_for(timeout=5000)
        page.locator(".docs-editor-outline__item").filter(has_text="Section Gamma").wait_for(timeout=5000)

        step("outline controls")
        page.get_by_role("button", name="아웃라인 접기").click()
        assert page.locator('.docs-editor-shell[data-outline-open="false"]').count() == 1
        page.get_by_role("button", name="아웃라인 펼치기").click()
        assert page.locator('.docs-editor-shell[data-outline-open="true"]').count() == 1
        editor.click()
        editor.press("Meta+A")
        editor.type("plain body only")
        wait_for_saved(page)
        assert page.locator(".docs-editor-outline__item").count() == 0
        assert page.locator(".docs-editor-outline__empty").count() == 0

        step("paragraph spacing")
        editor.click()
        editor.press("Meta+A")
        editor.type("line one")
        editor.press("Enter")
        editor.type("line two")
        wait_for_saved(page)
        paragraph_gap = page.locator(".ProseMirror").evaluate(
            """node => {
                const paragraphs = node.querySelectorAll('p');
                if (paragraphs.length < 2) return 999;
                const first = paragraphs[0].getBoundingClientRect();
                const second = paragraphs[1].getBoundingClientRect();
                return second.top - first.bottom;
            }"""
        )
        assert paragraph_gap < 12

        step("task shorthand")
        editor.click()
        editor.press("Meta+A")
        editor.type("-[ ]")
        editor.press("Space")
        editor.type("shorthand")
        wait_for_saved(page)
        page.get_by_role("button", name="Raw").click()
        raw.wait_for(timeout=5000)
        shorthand_raw = raw.input_value()
        assert "- [ ] shorthand" in shorthand_raw
        page.get_by_role("button", name="편집").click()

        step("backspace cursor stability")
        editor.click()
        editor.press("Meta+A")
        editor.type("alpha")
        editor.press("Enter")
        editor.type("middle")
        editor.press("Enter")
        editor.type("omega")
        wait_for_saved(page)
        middle = page.locator(".ProseMirror p").nth(1)
        middle.click(position={"x": 48, "y": 8})
        editor.press("Backspace")
        editor.press("Backspace")
        editor.press("Backspace")
        wait_for_saved(page)
        editor.type("Z")
        wait_for_saved(page)
        page.get_by_role("button", name="Raw").click()
        raw.wait_for(timeout=5000)
        cursor_raw = raw.input_value()
        assert "Z" in cursor_raw
        assert cursor_raw.index("Z") < cursor_raw.index("omega")
        assert not cursor_raw.rstrip().endswith("omegaZ")
        page.get_by_role("button", name="편집").click()

        step("nested list regression")
        editor.click()
        editor.press("Meta+A")
        editor.type("- parent")
        editor.press("Enter")
        editor.press("Tab")
        editor.type("child")
        editor.press("Enter")
        editor.type("sibling")
        wait_for_saved(page)

        page.get_by_role("button", name="Raw").click()
        raw.wait_for(timeout=5000)
        nested_raw = raw.input_value()
        assert "- parent" in nested_raw
        assert "  - child" in nested_raw
        assert "- sibling" in nested_raw

        page.get_by_role("button", name="편집").click()
        page.locator(".ProseMirror ul li").nth(2).wait_for(timeout=5000)
        list_style = page.locator(".ProseMirror > ul").evaluate("node => getComputedStyle(node).listStyleType")
        assert list_style != "none"
        list_gap = page.locator(".ProseMirror").evaluate(
            """node => {
                const items = node.querySelectorAll('li');
                if (items.length < 2) return 999;
                const first = items[0].getBoundingClientRect();
                const second = items[1].getBoundingClientRect();
                return second.top - first.bottom;
            }"""
        )
        assert list_gap < 10

        step("blank line preservation")
        editor.click()
        editor.press("Meta+A")
        editor.type("alpha")
        editor.press("Enter")
        editor.press("Enter")
        editor.type("beta")
        wait_for_saved(page)

        page.get_by_role("button", name="Raw").click()
        raw.wait_for(timeout=5000)
        raw_value = raw.input_value()
        assert "alpha" in raw_value
        assert "beta" in raw_value
        assert "\u00a0" in raw_value

        page.get_by_role("button", name="편집").click()
        page.locator(".ProseMirror p").nth(2).wait_for(timeout=5000)

        step("shortcut formatting")
        editor.click()
        editor.press("Meta+A")
        editor.press("Backspace")
        editor.press("Meta+B")
        editor.type("bold")
        editor.press("Meta+B")
        editor.type(" plain")
        wait_for_saved(page)
        page.get_by_role("button", name="Raw").click()
        raw.wait_for(timeout=5000)
        assert "**bold** plain" in raw.input_value()
        page.get_by_role("button", name="편집").click()

        step("slash commands")
        editor.click()
        editor.press("Meta+A")
        editor.type("/")
        heading_four_command = page.locator(".slash-menu button").filter(has_text="제목 4").first
        heading_four_command.wait_for(timeout=5000)
        menu_box = page.locator(".slash-menu").bounding_box()
        assert menu_box["height"] < 280
        assert page.locator(".slash-menu").evaluate("node => node.scrollHeight > node.clientHeight")
        first_item_height = page.locator(".slash-menu button").first.evaluate("node => node.getBoundingClientRect().height")
        assert first_item_height < 48
        page.keyboard.press("Escape")
        checklist_command = page.locator(".slash-menu button").filter(has_text="체크리스트").first
        editor.type("/")
        checklist_command.wait_for(timeout=5000)
        checklist_command.click()
        editor.type("task item")
        editor.press("Enter")
        editor.type("/")
        table_command = page.locator(".slash-menu button").filter(has_text="3x3 표 삽입").first
        table_command.wait_for(timeout=5000)
        table_command.click()
        page.get_by_role("toolbar", name="편집 도구").wait_for(timeout=5000)
        page.get_by_role("button", name="열 오른쪽 추가").click()
        page.get_by_role("button", name="행 아래 추가").click()
        wait_for_saved(page)
        page.get_by_role("button", name="Raw").click()
        raw.wait_for(timeout=5000)
        slash_raw = raw.input_value()
        assert "- [ ] task item" in slash_raw
        assert "| --- | --- | --- | --- |" in slash_raw
        assert slash_raw.count("|") > 20
        page.get_by_role("button", name="편집").click()

        step("create folder")
        page.locator('aside button[title="새 폴더"]').click()
        page.get_by_role("heading", name="새 폴더").wait_for(timeout=5000)
        assert page.get_by_text("저장 위치").count() >= 1
        page.mouse.click(20, 20)
        wait_for_modal_hidden(page, "새 폴더")
        page.locator('aside button[title="새 폴더"]').click()
        page.get_by_role("heading", name="새 폴더").wait_for(timeout=5000)
        page.get_by_placeholder("reference").fill(folder_name)
        page.get_by_role("button", name="폴더 생성").click()
        wait_for_modal_hidden(page, "새 폴더")
        page.locator('nav[role="tree"]').get_by_text(folder_name).wait_for(timeout=10000)

        step("rename folder")
        tree_button(page, folder_name).locator("span[title='더블클릭해 이름 변경']").dblclick()
        folder_input = page.locator('nav[role="tree"] input').first
        folder_input.fill(renamed_folder_name)
        folder_input.press("Enter")
        page.locator('nav[role="tree"]').get_by_text(renamed_folder_name).wait_for(timeout=10000)
        folder_name = renamed_folder_name

        step("create inside selected folder")
        tree_button(page, folder_name).click()
        page.locator('aside button[title="새 문서"]').click()
        page.get_by_role("heading", name="새 문서").wait_for(timeout=5000)
        page.locator("code").filter(has_text=folder_name).first.wait_for(timeout=5000)
        page.get_by_placeholder("예: api-guide").fill(nested_doc_slug)
        page.get_by_role("button", name="문서 생성").click()
        wait_for_modal_hidden(page, "새 문서")
        page.locator('nav[role="tree"]').get_by_text(f"{nested_doc_slug}.md").wait_for(timeout=10000)

        step("drag move")
        source = tree_button(page, f"{doc_slug}.md")
        target = tree_button(page, folder_name)
        data_transfer = begin_drag(page, source, target)
        target.locator(".tree-drop-indicator").filter(has_text=f"{folder_name}/{doc_slug}.md").wait_for(timeout=5000)
        finish_drag(source, target, data_transfer)
        wait_for_saved(page)
        page.get_by_role("button", name="Raw").click()
        raw.wait_for(timeout=5000)
        moved_raw = raw.input_value()
        assert "- [ ] task item" in moved_raw
        assert "| --- | --- | --- |" in moved_raw
        page.get_by_role("button", name="편집").click()

        step("template create")
        page.locator('aside button[title="새 문서"]').click()
        page.get_by_role("heading", name="새 문서").wait_for(timeout=5000)
        page.get_by_role("button", name="템플릿 관리").click()
        page.get_by_role("heading", name="템플릿 관리").wait_for(timeout=5000)
        page.get_by_role("button", name="새 템플릿").click()
        page.get_by_placeholder("meeting-note").fill(template_name)
        template_area = page.locator("textarea").nth(0)
        template_area.fill("---\ntitle: \"{{title}}\"\n---\n\n# {{title}}\n\n## Smoke\n")
        page.get_by_role("button", name="저장").click()
        page.get_by_role("button", name=template_name).wait_for(timeout=10000)
        page.get_by_role("button", name="×").last.click()
        wait_for_modal_hidden(page, "템플릿 관리")

        step("template document")
        page.get_by_placeholder("예: api-guide").fill(template_doc_slug)
        page.locator("select").select_option(template_name)
        page.get_by_role("button", name="문서 생성").click()
        wait_for_modal_hidden(page, "새 문서")
        page.locator('nav[role="tree"]').get_by_text(f"{template_doc_slug}.md").wait_for(timeout=10000)
        page.get_by_role("button", name="Raw").click()
        raw.wait_for(timeout=5000)
        assert "## Smoke" in raw.input_value()

        step("screenshot")
        page.screenshot(path=str(Path("/tmp") / "docs-markdown-editor-smoke.png"), full_page=True)
        step("done")
        browser.close()


if __name__ == "__main__":
    main()
