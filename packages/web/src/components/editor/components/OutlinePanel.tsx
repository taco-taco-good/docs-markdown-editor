import type { OutlineItem } from "../outline";

interface OutlinePanelProps {
  items: OutlineItem[];
  activeId: string | null;
  isOpen: boolean;
  onItemClick: (item: OutlineItem) => void;
}

export function OutlinePanel({ items, activeId, isOpen, onItemClick }: OutlinePanelProps) {
  return (
    <aside
      className="docs-editor-outline-panel"
      data-open={isOpen ? "true" : "false"}
      data-empty={items.length === 0 ? "true" : "false"}
      aria-label="문서 개요"
    >
      {isOpen ? (
        <div className="docs-editor-outline__inner">
          <div className="docs-editor-outline__header">
            <span className="docs-editor-outline__label">개요</span>
            {items.length > 0 ? (
              <span className="docs-editor-outline__meta">{items.length}</span>
            ) : null}
          </div>
          {items.length > 0 ? (
            <div className="docs-editor-outline__list">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="docs-editor-outline__item"
                  data-level={item.level}
                  data-active={item.id === activeId ? "true" : "false"}
                  onClick={() => onItemClick(item)}
                >
                  <span className="docs-editor-outline__text">{item.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
