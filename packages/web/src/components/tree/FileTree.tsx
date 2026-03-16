import { useEffect } from "react";
import { useTreeStore } from "../../stores/tree.store";
import { TreeNodeItem } from "./TreeNode";

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
  const selectPath = useTreeStore((s) => s.selectPath);

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
    </nav>
  );
}
