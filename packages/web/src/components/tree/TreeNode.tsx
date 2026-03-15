import { useEffect, useRef, useState, type DragEvent } from "react";
import { useTreeStore } from "../../stores/tree.store";
import { useDocumentStore } from "../../stores/document.store";
import { useUIStore } from "../../stores/ui.store";
import type { TreeNode } from "../../api/client";

interface TreeNodeProps {
  node: TreeNode;
  depth: number;
  onCreateDocument: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
}

function parentDirectoryFromPath(path: string): string {
  const segments = path.split("/");
  segments.pop();
  return segments.join("/");
}

type DropMode = "inside" | "before" | "after";

function resolveDropIntent(
  sourcePath: string,
  target: TreeNode,
  event: DragEvent<HTMLDivElement>,
): { targetPath?: string; mode: DropMode } | null {
  if (!sourcePath || sourcePath === target.path) return null;

  const rect = event.currentTarget.getBoundingClientRect();
  const offsetY = event.clientY - rect.top;
  const ratio = rect.height > 0 ? offsetY / rect.height : 0.5;
  const targetParent = parentDirectoryFromPath(target.path);

  if (target.type === "directory" && ratio >= 0.25 && ratio <= 0.75) {
    if (sourcePath.startsWith(`${target.path}/`)) {
      return null;
    }
    return { targetPath: target.path, mode: "inside" };
  }

  if (ratio < 0.5) {
    return { targetPath: target.path, mode: "before" };
  }

  if (sourcePath === target.path || parentDirectoryFromPath(sourcePath) === targetParent && sourcePath === target.path) {
    return null;
  }

  return { targetPath: target.path, mode: "after" };
}

export function TreeNodeItem({ node, depth, onCreateDocument, onCreateFolder }: TreeNodeProps) {
  const expandedPaths = useTreeStore((s) => s.expandedPaths);
  const selectedPath = useTreeStore((s) => s.selectedPath);
  const toggleExpand = useTreeStore((s) => s.toggleExpand);
  const selectPath = useTreeStore((s) => s.selectPath);
  const repositionNode = useTreeStore((s) => s.repositionNode);
  const renameNode = useTreeStore((s) => s.renameNode);
  const deleteNode = useTreeStore((s) => s.deleteNode);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const showToast = useUIStore((s) => s.showToast);
  const [dropTarget, setDropTarget] = useState<{ path: string; mode: DropMode } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(node.name);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragDepthRef = useRef(0);

  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isDirectory = node.type === "directory";

  const isDropActive = dropTarget !== null;
  const dropTargetPath = dropTarget?.path ?? null;
  const dropMode = dropTarget?.mode ?? null;

  useEffect(() => {
    setDraftName(node.name);
    setEditingName(false);
  }, [node.name]);

  useEffect(() => () => {
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
    }
  }, []);

  const commitRename = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === node.name) {
      setDraftName(node.name);
      setEditingName(false);
      return;
    }
    try {
      await renameNode(node.path, trimmed, node.type);
      setEditingName(false);
    } catch {
      setDraftName(node.name);
      setEditingName(false);
      showToast("이름을 변경하지 못했습니다.", "error");
    }
  };

  const handleClick = () => {
    if (editingName) return;
    selectPath(node.path);
    if (isDirectory) {
      toggleExpand(node.path);
    } else {
      openDocument(node.path);
      if (window.matchMedia("(max-width: 767px)").matches) {
        setSidebarOpen(false);
      }
    }
  };

  return (
    <div role="treeitem" aria-expanded={isDirectory ? isExpanded : undefined}>
      <div
        role="button"
        tabIndex={0}
        data-tree-node="true"
        onClick={handleClick}
        onKeyDown={(event) => {
          if (editingName) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleClick();
          }
        }}
        className="relative w-full flex items-center gap-1 min-h-7 rounded-md px-2 py-1 text-left text-[13px] transition-colors group"
        style={{
          paddingLeft: `${depth * 14 + 8}px`,
          paddingBottom: isDropActive ? "2rem" : undefined,
          background: isDropActive
            ? "color-mix(in srgb, var(--color-accent) 20%, var(--color-surface-2))"
            : isSelected
              ? "var(--color-surface-3)"
              : "transparent",
          color: isSelected ? "var(--color-text-primary)" : "var(--color-text-secondary)",
          boxShadow: isDropActive
            ? "inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 85%, transparent)"
            : "none",
        }}
        draggable={!editingName}
        data-drop-mode={dropMode ?? undefined}
        onDragStart={(event) => {
          dragDepthRef.current = 0;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/docs-md-path", node.path);
          event.dataTransfer.setData("text/plain", node.path);
        }}
        onDragEnd={() => {
          if (expandTimerRef.current) {
            clearTimeout(expandTimerRef.current);
            expandTimerRef.current = null;
          }
          setDropTarget(null);
        }}
        onDragEnter={(event) => {
          const sourcePath = event.dataTransfer.getData("application/docs-md-path");
          const intent = resolveDropIntent(sourcePath, node, event);
          if (!intent) return;
          dragDepthRef.current += 1;
          setDropTarget({ path: intent.targetPath ?? "", mode: intent.mode });
        }}
        onDragOver={(event) => {
          const sourcePath = event.dataTransfer.getData("application/docs-md-path");
          const intent = resolveDropIntent(sourcePath, node, event);
          if (!intent) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setDropTarget({ path: intent.targetPath ?? "", mode: intent.mode });
          if (intent.mode === "inside" && isDirectory && !isExpanded && !expandTimerRef.current) {
            expandTimerRef.current = setTimeout(() => {
              toggleExpand(node.path);
              expandTimerRef.current = null;
            }, 450);
          }
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current > 0) return;
          if (expandTimerRef.current) {
            clearTimeout(expandTimerRef.current);
            expandTimerRef.current = null;
          }
          setDropTarget(null);
        }}
        onDrop={(event) => {
          const sourcePath = event.dataTransfer.getData("application/docs-md-path");
          const intent = resolveDropIntent(sourcePath, node, event);
          if (expandTimerRef.current) {
            clearTimeout(expandTimerRef.current);
            expandTimerRef.current = null;
          }
          setDropTarget(null);
          if (!sourcePath || !intent) return;
          event.preventDefault();
          event.stopPropagation();
          void repositionNode(sourcePath, {
            placement: intent.mode,
            targetPath: intent.targetPath,
          });
        }}
        onMouseEnter={(e) => {
          if (!isSelected && !isDropActive) e.currentTarget.style.background = "var(--color-surface-2)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected && !isDropActive) e.currentTarget.style.background = "transparent";
        }}
      >
        {/* Expand/Collapse chevron for directories */}
        {isDirectory ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="shrink-0 transition-transform duration-150"
            style={{
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              color: "var(--color-text-muted)",
            }}
          >
            <path d="M4.5 2.5L7.5 6L4.5 9.5" />
          </svg>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {isDirectory ? (
          <FolderIcon open={isExpanded} />
        ) : (
          <FileIcon name={node.name} />
        )}

        {/* Name */}
        <span className="min-w-0 flex-1">
          {editingName ? (
            <input
              value={draftName}
              autoFocus
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitRename();
                }
                if (event.key === "Escape") {
                  setDraftName(node.name);
                  setEditingName(false);
                }
              }}
              className="w-full rounded px-1 text-[13px] outline-none"
              style={{
                background: "var(--color-surface-3)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-active)",
              }}
            />
          ) : (
            <span
              className="block truncate"
              style={{ fontFamily: "var(--font-ui)" }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setEditingName(true);
              }}
              title="더블클릭해 이름 변경"
            >
              {node.name}
            </span>
          )}
        </span>
        {isDirectory ? (
          <div className="shrink-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--color-surface-4)] transition-colors"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onCreateDocument(node.path);
              }}
              title="새 문서"
              style={{ color: "var(--color-text-muted)" }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M8 3.5V12.5" />
                <path d="M3.5 8H12.5" />
              </svg>
            </button>
            <button
              type="button"
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--color-surface-4)] transition-colors"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onCreateFolder(node.path);
              }}
              title="새 폴더"
              style={{ color: "var(--color-text-muted)" }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 5.5H13.5V12H2.5V5.5Z" />
                <path d="M2.5 5.5V4.5C2.5 4 2.9 3.5 3.5 3.5H6L7.2 4.7H12.5C13.1 4.7 13.5 5.1 13.5 5.7" />
              </svg>
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--color-danger)_18%,var(--color-surface-4))]"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void deleteNode(node.path);
          }}
          title="삭제"
          style={{ color: "var(--color-text-muted)" }}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
        {dropTargetPath ? (
          <>
            {dropMode === "inside" ? (
              <>
                <span className="tree-drop-callout" data-drop-mode={dropMode ?? undefined}>
                  폴더 안으로 이동
                </span>
                <span className="tree-drop-pill" data-drop-mode={dropMode ?? undefined}>
                  {dropTargetPath}
                </span>
              </>
            ) : (
              <>
                <span className="tree-drop-line" data-drop-mode={dropMode ?? undefined} />
                <span className="tree-drop-pill" data-drop-mode={dropMode ?? undefined}>
                  {dropMode === "before" ? "이 앞에 배치" : "이 뒤에 배치"}
                </span>
              </>
            )}
          </>
        ) : null}
      </div>

      {/* Children */}
      {isDirectory && isExpanded && node.children && (
        <div className="animate-fade-in" role="group">
          {node.children.map((child) => (
              <TreeNodeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                onCreateDocument={onCreateDocument}
                onCreateFolder={onCreateFolder}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
      style={{ color: open ? "var(--color-accent)" : "var(--color-text-muted)" }}
    >
      {open ? (
        <path
          d="M2 4C2 3.45 2.45 3 3 3H6.5L8 4.5H13C13.55 4.5 14 4.95 14 5.5V6H3.5L2 12.5V4Z M3.5 6H14L12.5 12.5H2L3.5 6Z"
          fill="currentColor"
          opacity="0.7"
        />
      ) : (
        <path
          d="M2 4C2 3.45 2.45 3 3 3H6.5L8 4.5H13C13.55 4.5 14 4.95 14 5.5V12C14 12.55 13.55 13 13 13H3C2.45 13 2 12.55 2 12V4Z"
          fill="currentColor"
          opacity="0.5"
        />
      )}
    </svg>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  const isMd = ext === "md" || ext === "mdx";

  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
      style={{ color: isMd ? "var(--color-accent)" : "var(--color-text-muted)" }}
    >
      <path
        d="M4 2H10L13 5V13C13 13.55 12.55 14 12 14H4C3.45 14 3 13.55 3 13V3C3 2.45 3.45 2 4 2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <path d="M10 2V5H13" stroke="currentColor" strokeWidth="1.2" fill="none" />
      {isMd && (
        <text
          x="8"
          y="11.5"
          textAnchor="middle"
          fill="currentColor"
          fontSize="5"
          fontWeight="bold"
          fontFamily="var(--font-mono)"
        >
          M
        </text>
      )}
    </svg>
  );
}
