import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type TemplateMeta } from "../../api/client";
import { useTreeStore } from "../../stores/tree.store";
import { useDocumentStore } from "../../stores/document.store";
import { TemplateManagerModal } from "./TemplateManagerModal";

function normalizeFileName(name: string): string {
  return name
    .trim()
    .normalize("NFC")
    .replace(/[\\/]/g, "-")
    .replace(/[^\p{Letter}\p{Number}\s._-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CreateDocumentModal({
  open,
  onClose,
  parentDirectoryOverride,
}: {
  open: boolean;
  onClose: () => void;
  parentDirectoryOverride?: string;
}) {
  const openDocument = useDocumentStore((s) => s.openDocument);
  const selectPath = useTreeStore((s) => s.selectPath);
  const createFile = useTreeStore((s) => s.createFile);
  const [fileName, setFileName] = useState("");
  const [template, setTemplate] = useState("default");
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);

  const loadTemplates = async () => {
    const items = await api.getTemplates();
    setTemplates(items);
    setTemplate((current) => {
      if (items.some((item) => item.name === current)) return current;
      if (items.some((item) => item.name === "default")) return "default";
      return items[0]?.name ?? "";
    });
  };

  useEffect(() => {
    if (!open) return;

    setFileName("");
    setError("");

    let cancelled = false;
    loadTemplates().catch(() => {
      if (!cancelled) {
        setTemplates([]);
        setError("템플릿 목록을 불러오지 못했습니다.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const parentDirectory = useMemo(() => parentDirectoryOverride ?? "", [parentDirectoryOverride]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!fileName.trim()) {
        throw new Error("파일 이름을 입력하세요.");
      }
      const normalizedName = normalizeFileName(fileName);
      if (!normalizedName) {
        throw new Error("파일 이름을 다시 확인해주세요.");
      }
      const fileBaseName = normalizedName.endsWith(".md") ? normalizedName : `${normalizedName}.md`;
      const createdPath = await createFile(parentDirectory, fileBaseName, {
        template: template || undefined,
      });
      selectPath(createdPath);
      await openDocument(createdPath);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "문서를 생성하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: "rgba(9, 11, 17, 0.78)" }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="w-full max-w-xl rounded-2xl border shadow-2xl animate-slide-up"
          style={{
            background: "var(--color-surface-1)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
            <div>
              <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
                새 문서
              </h2>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                파일 이름과 템플릿만 정하면 새 마크다운 파일을 만듭니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg transition-colors"
              style={{ color: "var(--color-text-muted)" }}
            >
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
                이 위치에 새 문서를 바로 생성합니다.
              </p>
            </div>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--color-text-tertiary)" }}>
                문서 이름
              </span>
              <input
                value={fileName}
                onChange={(event) => setFileName(event.target.value.replace(/\.md$/i, ""))}
                placeholder="예: api-guide"
                required
                className="w-full h-11 px-3 rounded-xl text-sm outline-none"
                style={{
                  background: "var(--color-surface-3)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border)",
                }}
              />
            </label>

            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--color-text-tertiary)" }}>
                  템플릿
                </span>
                <select
                  value={template}
                  onChange={(event) => setTemplate(event.target.value)}
                  className="w-full h-11 px-3 rounded-xl text-sm outline-none"
                  style={{
                    background: "var(--color-surface-3)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {templates.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setManageTemplatesOpen(true)}
                className="h-11 px-3 rounded-xl text-sm"
                style={{
                  background: "var(--color-surface-3)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border)",
                }}
              >
                템플릿 관리
              </button>
            </div>

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
                {loading ? "생성 중…" : "문서 생성"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <TemplateManagerModal
        open={manageTemplatesOpen}
        onClose={() => setManageTemplatesOpen(false)}
        onChanged={() => {
          void loadTemplates();
        }}
      />
    </>
  );
}
