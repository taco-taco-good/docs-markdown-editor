import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, type TemplateMeta } from "../../api/client";
import { useTreeStore } from "../../stores/tree.store";
import { useDocumentStore } from "../../stores/document.store";
import { TemplateManagerModal } from "./TemplateManagerModal";
import { useDialog } from "../../hooks/useDialog";

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
  const nameInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useDialog<HTMLDivElement>({ open, onClose, initialFocusRef: nameInputRef });

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
        className="ui-dialog-backdrop z-50"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-document-title"
          className="ui-dialog-panel w-full max-w-xl animate-slide-up"
          tabIndex={-1}
        >
          <div className="ui-dialog-header">
            <div>
              <h2 id="create-document-title" className="ui-dialog-heading">
                새 문서
              </h2>
              <p className="ui-dialog-description">
                파일 이름과 템플릿만 정하면 새 마크다운 파일을 만듭니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ui-icon-button"
              aria-label="닫기"
            >
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
                이 위치에 새 문서를 바로 생성합니다.
              </p>
            </div>

            <label className="ui-field">
              <span className="ui-label">
                문서 이름
              </span>
              <input
                ref={nameInputRef}
                id="create-document-name"
                name="documentName"
                autoComplete="off"
                value={fileName}
                onChange={(event) => setFileName(event.target.value.replace(/\.md$/i, ""))}
                placeholder="예: api-guide"
                required
                className="ui-input text-sm"
              />
            </label>

            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <label className="ui-field">
                <span className="ui-label">
                  템플릿
                </span>
                <select
                  id="create-document-template"
                  name="documentTemplate"
                  value={template}
                  onChange={(event) => setTemplate(event.target.value)}
                  className="ui-select text-sm"
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
                className="ui-button text-sm"
              >
                템플릿 관리
              </button>
            </div>

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
