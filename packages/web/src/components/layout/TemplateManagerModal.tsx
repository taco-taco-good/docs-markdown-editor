import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TemplateMeta } from "../../api/client";
import { useDialog } from "../../hooks/useDialog";

const NEW_TEMPLATE_CONTENT = `---
title: "{{title}}"
date: "{{date}}"
---

# {{title}}

`;

export function TemplateManagerModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [content, setContent] = useState(NEW_TEMPLATE_CONTENT);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useDialog<HTMLDivElement>({ open, onClose, initialFocusRef: nameInputRef });

  const canDelete = useMemo(() => !isCreating && selectedName !== "default" && !!selectedName, [isCreating, selectedName]);

  const loadTemplateList = async (preferName?: string) => {
    setLoading(true);
    const items = await api.getTemplates();
    setTemplates(items);
    const nextName = preferName && items.some((item) => item.name === preferName)
      ? preferName
      : items[0]?.name ?? "";
    if (nextName) {
      const template = await api.getTemplate(nextName);
      setSelectedName(nextName);
      setDraftName(nextName);
      setContent(template.content);
      setIsCreating(false);
    } else {
      setSelectedName("");
      setDraftName("");
      setContent(NEW_TEMPLATE_CONTENT);
      setIsCreating(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    setError("");
    void loadTemplateList().catch(() => {
      setError("템플릿을 불러오지 못했습니다.");
      setLoading(false);
    });
  }, [open]);

  if (!open) return null;

  const handleSelect = async (name: string) => {
    setLoading(true);
    setError("");
    try {
      const template = await api.getTemplate(name);
      setSelectedName(name);
      setDraftName(name);
      setContent(template.content);
      setIsCreating(false);
    } catch {
      setError("템플릿을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const template = isCreating
        ? await api.createTemplate(draftName.trim(), content)
        : await api.updateTemplate(selectedName, content);
      await loadTemplateList(template.name);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "템플릿을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || !window.confirm(`템플릿 "${selectedName}"을 삭제하시겠습니까?`)) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.deleteTemplate(selectedName);
      await loadTemplateList();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "템플릿을 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui-dialog-backdrop z-[60]" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-manager-title"
        className="ui-dialog-panel w-full max-w-5xl animate-scale-in"
        data-dialog-tone="wide"
        tabIndex={-1}
      >
        <div className="ui-dialog-header">
          <div>
            <h2 id="template-manager-title" className="ui-dialog-heading">
              템플릿 관리
            </h2>
            <p className="ui-dialog-description">
              <code>{"{{title}}"}</code>, <code>{"{{author}}"}</code>, <code>{"{{date}}"}</code> 변수를 사용할 수 있습니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="ui-icon-button" aria-label="닫기">
            ×
          </button>
        </div>

        <div className="grid grid-cols-[220px_1fr] min-h-[520px]">
          <aside className="border-r p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
            <button
              type="button"
              onClick={() => {
                setIsCreating(true);
                setSelectedName("");
                setDraftName("");
                setContent(NEW_TEMPLATE_CONTENT);
                setError("");
              }}
              className="ui-button ui-button--solid w-full text-sm mb-3"
            >
              새 템플릿
            </button>

            <div className="space-y-1">
              {templates.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  onClick={() => void handleSelect(template.name)}
                  className="w-full px-3 py-2 rounded-xl text-left text-sm transition-colors"
                  style={{
                    background:
                      !isCreating && selectedName === template.name ? "var(--color-surface-4)" : "transparent",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {template.name}
                </button>
              ))}
            </div>
          </aside>

          <div className="p-5 space-y-4">
            <label className="ui-field">
              <span className="ui-label">
                Template Name
              </span>
              <input
                ref={nameInputRef}
                id="template-name"
                name="templateName"
                autoComplete="off"
                value={draftName}
                disabled={!isCreating}
                onChange={(event) => setDraftName(event.target.value.trim().replace(/\.md$/i, ""))}
                placeholder="meeting-note"
                className="ui-input text-sm"
                style={{
                  opacity: isCreating ? 1 : 0.7,
                }}
              />
            </label>

            <label className="ui-field">
              <span className="ui-label">
                Template Markdown
              </span>
              <textarea
                id="template-content"
                name="templateContent"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                spellCheck={false}
                className="ui-textarea w-full min-h-[320px] rounded-2xl text-sm resize-none"
                style={{
                  background: "var(--color-surface-0)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border)",
                  fontFamily: "var(--font-mono)",
                  lineHeight: 1.7,
                }}
              />
            </label>

            {error && (
              <p className="text-xs" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            )}

            <div className="flex items-center justify-between">
              <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {loading ? "불러오는 중…" : "저장하면 즉시 문서 생성 모달에서 사용할 수 있습니다."}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!canDelete || saving}
                  className="ui-button ui-button--danger text-sm"
                  style={{
                    opacity: !canDelete || saving ? 0.6 : 1,
                  }}
                >
                  삭제
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !draftName.trim() || !content.trim()}
                  className="ui-button ui-button--solid text-sm font-medium"
                >
                  {saving ? "저장 중…" : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
