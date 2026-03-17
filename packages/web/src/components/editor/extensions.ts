import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { common, createLowlight } from "lowlight";
import { promptForLink } from "./editor-utils";

const lowlight = createLowlight(common);

const ProductivityKeymap = Extension.create({
  name: "productivityKeymap",

  addKeyboardShortcuts() {
    return {
      "Mod-b": () => this.editor.commands.toggleBold(),
      "Mod-i": () => this.editor.commands.toggleItalic(),
      "Mod-Shift-x": () => this.editor.commands.toggleStrike(),
      "Mod-e": () => this.editor.commands.toggleCode(),
      "Mod-k": () => promptForLink(this.editor),
      "Mod-Alt-0": () => this.editor.commands.clearNodes(),
      "Mod-Alt-1": () => this.editor.commands.toggleHeading({ level: 1 }),
      "Mod-Alt-2": () => this.editor.commands.toggleHeading({ level: 2 }),
      "Mod-Alt-3": () => this.editor.commands.toggleHeading({ level: 3 }),
      "Mod-Alt-4": () => this.editor.commands.toggleHeading({ level: 4 }),
      "Mod-Shift-7": () => this.editor.commands.toggleOrderedList(),
      "Mod-Shift-8": () => this.editor.commands.toggleBulletList(),
      "Mod-Shift-9": () => this.editor.commands.toggleTaskList(),
      "Mod-Shift-h": () => this.editor.commands.toggleHighlight(),
      "Shift-Enter": () => this.editor.commands.setHardBreak(),

      // ── Backspace: Notion-style block demotion ──
      // Heading → paragraph when cursor is at position 0
      Backspace: () => {
        const { selection } = this.editor.state;
        if (!selection.empty) return false;

        const { $from } = selection;
        // Only act when cursor is at the very start of the textblock
        if ($from.parentOffset !== 0) return false;

        const node = $from.parent;

        // Heading at pos 0 → convert to paragraph (Notion / Google Docs behavior)
        if (node.type.name === "heading") {
          return this.editor.commands.setNode("paragraph");
        }

        // Empty task item at pos 0 → lift out of task list
        if (node.type.name === "paragraph" && $from.depth >= 2) {
          const grandparent = $from.node(-1);
          if (grandparent?.type.name === "taskItem") {
            // If the task item text is empty, lift entirely out of the list
            if (node.textContent.length === 0) {
              return this.editor.commands.liftListItem("taskItem");
            }
            // If there is text but cursor is at start, also lift
            return this.editor.commands.liftListItem("taskItem");
          }
        }

        return false;
      },
    };
  },
});

export function createEditorExtensions() {
  return [
    StarterKit.configure({
      codeBlock: false,
      horizontalRule: false,
    }),
    ProductivityKeymap,
    CodeBlockLowlight.configure({ lowlight }),
    HorizontalRule,
    Highlight.configure({ multicolor: true }),
    Placeholder.configure({
      placeholder: "'/' 를 입력하면 명령어 메뉴가 열립니다…",
    }),
    Link.configure({ openOnClick: false }),
    Image.configure({ inline: false, allowBase64: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}
