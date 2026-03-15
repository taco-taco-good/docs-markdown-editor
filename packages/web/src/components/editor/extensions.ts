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
