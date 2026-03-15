import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTreeStore } from "../../stores/tree.store";

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
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(9, 11, 17, 0.78)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl animate-slide-up"
        style={{
          background: "var(--color-surface-1)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
              새 폴더
            </h2>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
              선택한 위치에 새 폴더를 만듭니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg" style={{ color: "var(--color-text-muted)" }}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div
            className="rounded-xl px-3 py-3 text-sm"
            style={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
            >
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

          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--color-text-tertiary)" }}>
              폴더 이름
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="reference"
              required
              className="w-full h-11 px-3 rounded-xl text-sm outline-none"
              style={{
                background: "var(--color-surface-3)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border)",
              }}
            />
          </label>

          {error && (
            <p className="text-xs" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-10 rounded-xl text-sm"
              style={{
                background: "var(--color-surface-3)",
                color: "var(--color-text-secondary)",
              }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 h-10 rounded-xl text-sm font-medium"
              style={{
                background: "var(--color-accent)",
                color: "#111318",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "생성 중…" : "폴더 생성"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
