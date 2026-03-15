import { useEffect, useState } from "react";
import { useTreeStore } from "../../stores/tree.store";
import { TreeNodeItem } from "./TreeNode";

function buildRootTargetLabel(from: string): string {
  const segments = from.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? from;
}

export function FileTree({
  onCreateDocument,
  onCreateFolder,
}: {
  onCreateDocument: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
}) {
  const nodes = useTreeStore((s) => s.nodes);
  const loading = useTreeStore((s) => s.loading);
  const loadTree = useTreeStore((s) => s.loadTree);
  const repositionNode = useTreeStore((s) => s.repositionNode);
  const selectPath = useTreeStore((s) => s.selectPath);
  const [rootDropTarget, setRootDropTarget] = useState<string | null>(null);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  if (loading && nodes.length === 0) {
    return (
      <div className="px-3 py-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-6 rounded mb-1 animate-pulse"
            style={{
              background: "var(--color-surface-3)",
              width: `${60 + Math.random() * 30}%`,
              animationDelay: `${i * 80}ms`,
            }}
          />
        ))}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="px-3 py-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
        문서가 없습니다
      </div>
    );
  }

  return (
    <nav
      className="px-1 min-h-full flex flex-col"
      role="tree"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          selectPath("");
        }
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("application/docs-md-path")) return;
        event.preventDefault();
        const from = event.dataTransfer.getData("application/docs-md-path");
        setRootDropTarget(from ? buildRootTargetLabel(from) : null);
      }}
      onDragLeave={() => {
        setRootDropTarget(null);
      }}
      onDrop={(event) => {
        const from = event.dataTransfer.getData("application/docs-md-path");
        setRootDropTarget(null);
        if (!from) return;
        event.preventDefault();
        void repositionNode(from, { placement: "root" });
      }}
    >
      <div className="shrink-0">
        {nodes.map((node) => (
          <TreeNodeItem
            key={node.path}
            node={node}
            depth={0}
            onCreateDocument={onCreateDocument}
            onCreateFolder={onCreateFolder}
          />
        ))}
      </div>
      <div
        className="flex-1 min-h-[6rem] mt-2 rounded-md"
        onClick={() => selectPath("")}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("application/docs-md-path")) return;
          event.preventDefault();
          const from = event.dataTransfer.getData("application/docs-md-path");
          setRootDropTarget(from ? buildRootTargetLabel(from) : null);
        }}
        onDragLeave={() => setRootDropTarget(null)}
        onDrop={(event) => {
          const from = event.dataTransfer.getData("application/docs-md-path");
          setRootDropTarget(null);
          if (!from) return;
          event.preventDefault();
          void repositionNode(from, { placement: "root" });
        }}
        style={{
          background: "transparent",
          border: rootDropTarget ? "1px dashed color-mix(in srgb, var(--color-accent) 70%, transparent)" : "1px dashed transparent",
        }}
      >
        {rootDropTarget ? (
          <div className="tree-root-drop-indicator">
            이동 위치: /{rootDropTarget}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
