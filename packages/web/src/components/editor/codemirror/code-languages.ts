import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";

export const codeLanguages = [
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["javascript", "js", "jsx", "typescript", "ts", "tsx", "ecmascript", "node", "mjs", "cjs"],
    extensions: ["js", "jsx", "ts", "tsx", "mjs", "cjs"],
    load: async () => {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ jsx: true, typescript: true });
    },
  }),
  LanguageDescription.of({
    name: "JSON",
    alias: ["json", "jsonc"],
    extensions: ["json"],
    load: async () => {
      const { json } = await import("@codemirror/lang-json");
      return json();
    },
  }),
  LanguageDescription.of({
    name: "HTML",
    alias: ["html", "htm"],
    extensions: ["html", "htm"],
    load: async () => {
      const { html } = await import("@codemirror/lang-html");
      return html();
    },
  }),
  LanguageDescription.of({
    name: "CSS",
    alias: ["css", "scss", "sass", "less"],
    extensions: ["css", "scss", "sass", "less"],
    load: async () => {
      const { css } = await import("@codemirror/lang-css");
      return css();
    },
  }),
  LanguageDescription.of({
    name: "Python",
    alias: ["python", "py"],
    extensions: ["py"],
    load: async () => {
      const { python } = await import("@codemirror/lang-python");
      return python();
    },
  }),
  LanguageDescription.of({
    name: "SQL",
    alias: ["sql", "sqlite", "postgresql", "postgres", "mysql"],
    extensions: ["sql"],
    load: async () => {
      const { sql } = await import("@codemirror/lang-sql");
      return sql();
    },
  }),
  LanguageDescription.of({
    name: "YAML",
    alias: ["yaml", "yml"],
    extensions: ["yaml", "yml"],
    load: async () => {
      const { yaml } = await import("@codemirror/lang-yaml");
      return yaml();
    },
  }),
  LanguageDescription.of({
    name: "XML",
    alias: ["xml", "svg"],
    extensions: ["xml", "svg"],
    load: async () => {
      const { xml } = await import("@codemirror/lang-xml");
      return xml();
    },
  }),
  LanguageDescription.of({
    name: "C",
    alias: ["c", "h", "cpp", "c++", "cc", "cxx", "hpp"],
    extensions: ["c", "h", "cpp", "cc", "cxx", "hpp"],
    load: async () => {
      const { cpp } = await import("@codemirror/lang-cpp");
      return cpp();
    },
  }),
  LanguageDescription.of({
    name: "Go",
    alias: ["go", "golang"],
    extensions: ["go"],
    load: async () => {
      const { go } = await import("@codemirror/lang-go");
      return go();
    },
  }),
  LanguageDescription.of({
    name: "Rust",
    alias: ["rust", "rs"],
    extensions: ["rs"],
    load: async () => {
      const { rust } = await import("@codemirror/lang-rust");
      return rust();
    },
  }),
  LanguageDescription.of({
    name: "Shell",
    alias: ["bash", "sh", "shell", "zsh"],
    extensions: ["sh"],
    load: async () => {
      const { shell } = await import("@codemirror/legacy-modes/mode/shell");
      return new LanguageSupport(StreamLanguage.define(shell));
    },
  }),
] as const;

export function supportsCodeLanguage(name: string): boolean {
  return LanguageDescription.matchLanguageName(codeLanguages, name) !== null;
}
