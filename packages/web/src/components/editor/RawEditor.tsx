import { useRef, useCallback } from "react";
import { api } from "../../api/client";
import { useDocumentStore } from "../../stores/document.store";
import { useUIStore } from "../../stores/ui.store";

export function RawEditor() {
  const currentDoc = useDocumentStore((s) => s.currentDoc);
  const currentPath = useDocumentStore((s) => s.currentPath);
  const updateContent = useDocumentStore((s) => s.updateContent);
  const showToast = useUIStore((s) => s.showToast);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateContent(e.target.value);
    },
    [updateContent],
  );

  // Tab key inserts spaces
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const value = ta.value;
        ta.value = value.substring(0, start) + "  " + value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + 2;
        updateContent(ta.value);
      }
    },
    [updateContent],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLTextAreaElement>) => {
      const file = event.dataTransfer.files?.[0];
      if (!file || !currentPath || !textareaRef.current) return;

      event.preventDefault();
      try {
        const uploaded = await api.uploadAsset(currentPath, file);
        const ta = textareaRef.current;
        const insertion = `${uploaded.markdownLink}\n`;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + insertion + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + insertion.length;
        updateContent(ta.value);
      } catch (error) {
        console.error("Failed to upload asset:", error);
        showToast("파일 업로드에 실패했습니다. 형식과 용량을 확인해 주세요.", "error");
      }
    },
    [currentPath, showToast, updateContent],
  );

  return (
    <div className="raw-editor h-full">
      <textarea
        ref={textareaRef}
        value={currentDoc?.content ?? ""}
        onChange={handleChange}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
      />
    </div>
  );
}
