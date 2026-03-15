import type { Editor as TiptapEditor } from "@tiptap/core";
import { promptForLink } from "./editor-utils";

export interface SlashCommand {
  id: string;
  title: string;
  description: string;
  keywords?: string[];
  shortcut?: string;
  run: (editor: TiptapEditor) => void;
}

export function getSlashQuery(editor: TiptapEditor): {
  query: string;
  from: number;
  to: number;
} | null {
  const { state } = editor;
  const { empty, $from } = state.selection;
  if (!empty) return null;
  if ($from.parent.type.name === "codeBlock") return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
  const match = /(?:^|\s)\/([a-z0-9-]*)$/i.exec(textBefore);
  if (!match) return null;

  return {
    query: match[1].toLowerCase(),
    from: $from.pos - match[0].length + match[0].indexOf("/"),
    to: $from.pos,
  };
}

export function slashCommands(): SlashCommand[] {
  return [
    {
      id: "paragraph",
      title: "본문",
      description: "일반 문단으로 전환",
      shortcut: "Mod-Alt-0",
      keywords: ["text", "paragraph", "normal"],
      run: (editor) => {
        editor.chain().focus().clearNodes().run();
      },
    },
    {
      id: "heading-1",
      title: "제목 1",
      description: "가장 큰 섹션 제목",
      shortcut: "Mod-Alt-1",
      keywords: ["h1", "title"],
      run: (editor) => {
        editor.chain().focus().toggleHeading({ level: 1 }).run();
      },
    },
    {
      id: "heading-2",
      title: "제목 2",
      description: "중간 섹션 제목",
      shortcut: "Mod-Alt-2",
      keywords: ["h2", "section"],
      run: (editor) => {
        editor.chain().focus().toggleHeading({ level: 2 }).run();
      },
    },
    {
      id: "heading-3",
      title: "제목 3",
      description: "작은 섹션 제목",
      shortcut: "Mod-Alt-3",
      keywords: ["h3", "subsection"],
      run: (editor) => {
        editor.chain().focus().toggleHeading({ level: 3 }).run();
      },
    },
    {
      id: "heading-4",
      title: "제목 4",
      description: "세부 섹션 제목",
      shortcut: "Mod-Alt-4",
      keywords: ["h4", "detail"],
      run: (editor) => {
        editor.chain().focus().toggleHeading({ level: 4 }).run();
      },
    },
    {
      id: "bullet-list",
      title: "불릿 목록",
      description: "점 목록 생성",
      shortcut: "Mod-Shift-8",
      keywords: ["list", "unordered", "bullet"],
      run: (editor) => {
        editor.chain().focus().toggleBulletList().run();
      },
    },
    {
      id: "ordered-list",
      title: "번호 목록",
      description: "순서가 있는 목록",
      shortcut: "Mod-Shift-7",
      keywords: ["numbered", "ordered"],
      run: (editor) => {
        editor.chain().focus().toggleOrderedList().run();
      },
    },
    {
      id: "task-list",
      title: "체크리스트",
      description: "할 일 목록 생성",
      shortcut: "Mod-Shift-9",
      keywords: ["todo", "task", "checkbox"],
      run: (editor) => {
        editor.chain().focus().toggleTaskList().run();
      },
    },
    {
      id: "blockquote",
      title: "인용문",
      description: "blockquote 블록 생성",
      keywords: ["quote"],
      run: (editor) => {
        editor.chain().focus().toggleBlockquote().run();
      },
    },
    {
      id: "code-block",
      title: "코드 블록",
      description: "``` fenced code block",
      keywords: ["code", "snippet"],
      run: (editor) => {
        editor.chain().focus().toggleCodeBlock().run();
      },
    },
    {
      id: "table",
      title: "표",
      description: "3x3 표 삽입",
      keywords: ["table", "grid"],
      run: (editor) => {
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    },
    {
      id: "link",
      title: "링크",
      description: "선택 영역에 링크 삽입",
      shortcut: "Mod-k",
      keywords: ["url", "anchor"],
      run: (editor) => {
        promptForLink(editor);
      },
    },
    {
      id: "highlight",
      title: "하이라이트",
      description: "선택 영역 강조",
      shortcut: "Mod-Shift-h",
      keywords: ["mark", "emphasis"],
      run: (editor) => {
        editor.chain().focus().toggleHighlight().run();
      },
    },
    {
      id: "divider",
      title: "구분선",
      description: "수평선 삽입",
      keywords: ["hr", "separator"],
      run: (editor) => {
        editor.chain().focus().setHorizontalRule().run();
      },
    },
  ];
}

export function filterSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  return commands.filter((command) => {
    const text = `${command.title} ${command.description} ${command.id} ${command.shortcut ?? ""} ${(command.keywords ?? []).join(" ")}`.toLowerCase();
    return text.includes(query);
  });
}
