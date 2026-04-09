import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTreeStore } from "../../stores/tree.store";
import { useDialog } from "../../hooks/useDialog";

export function CreateFolderModal({
  open,
  onClose,
  parentDirectoryOverride,
}: {
  open: boolean;
  onClose: () => void;
  parentDirectoryOverride?: string;
}) {
  const createFolder = useTreeStore((s) => s.createFolder);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useDialog<HTMLDivElement>({ open, onClose, initialFocusRef: nameInputRef });

  useEffect(() => {
    if (!open) return;
    setName("");
    setError("");
  }, [open]);

  const parentDirectory = useMemo(() => parentDirectoryOverride ?? "", [parentDirectoryOverride]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!name.trim()) {
        throw new Error("폴더 이름을 입력하세요.");
      }
      await createFolder(parentDirectory, name.trim());
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "폴더를 생성하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="ui-dialog-backdrop z-50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-folder-title"
        className="ui-dialog-panel w-full max-w-md animate-slide-up"
        tabIndex={-1}
      >
        <div className="ui-dialog-header">
          <div>
            <h2 id="create-folder-title" className="ui-dialog-heading">
              새 폴더
            </h2>
            <p className="ui-dialog-description">
              선택한 위치에 새 폴더를 만듭니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="ui-icon-button" aria-label="닫기">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="ui-dialog-body">
          <div className="ui-card rounded-[calc(var(--radius-control)+4px)] px-3 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--color-text-tertiary)" }}>
              저장 위치
            </div>
            <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
              {parentDirectory || "/"}
            </code>
            <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
              이 위치에 새 폴더를 바로 생성합니다.
            </p>
          </div>

          <label className="ui-field">
            <span className="ui-label">
              폴더 이름
            </span>
            <input
              ref={nameInputRef}
              id="create-folder-name"
              name="folderName"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="reference"
              required
              className="ui-input text-sm"
            />
          </label>

          {error && (
            <p className="text-xs" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          <div className="ui-dialog-footer pt-1 px-0 pb-0">
            <button
              type="button"
              onClick={onClose}
              className="ui-button text-sm"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="ui-button ui-button--solid text-sm font-medium"
            >
              {loading ? "생성 중…" : "폴더 생성"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
