import type { ReactNode } from "react";

interface FormatAction {
  id: string;
  title: string;
  run: () => void;
  active: () => boolean;
}

interface SelectionToolbarProps {
  actions: FormatAction[];
  position: { top: number; left: number };
}

const icons: Record<string, ReactNode> = {
  bold: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    </svg>
  ),
  italic: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  ),
  strike: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4H9a3 3 0 0 0-3 3c0 1.4.8 2.4 2 3" />
      <path d="M12 12c3 1 5 2 5 4a3 3 0 0 1-3 3H8" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  ),
  code: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  link: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  bullet: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  task: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="M5 11l1.5 1.5L9.5 8" />
      <line x1="13" y1="8" x2="21" y2="8" />
      <rect x="3" y="14" width="6" height="6" rx="1" />
      <line x1="13" y1="17" x2="21" y2="17" />
    </svg>
  ),
  h2: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="M17 10a2 2 0 1 1 4 0c0 1.4-2 2.4-4 4h4" />
    </svg>
  ),
  h3: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="M17.5 10a1.5 1.5 0 0 1 3 0c0 .8-.7 1.3-1.5 1.5 .8.2 1.5.7 1.5 1.5a1.5 1.5 0 0 1-3 0" />
    </svg>
  ),
  quote: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
    </svg>
  ),
  highlight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
};

// Inline/mark actions vs block actions for visual grouping
const inlineGroup = new Set(["bold", "italic", "strike", "code", "highlight", "link"]);

export function SelectionToolbar({ actions, position }: SelectionToolbarProps) {
  const inlineActions = actions.filter((a) => inlineGroup.has(a.id));
  const blockActions = actions.filter((a) => !inlineGroup.has(a.id));

  return (
    <div
      className="docs-selection-toolbar"
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: "translate(-50%, -100%)",
      }}
      role="toolbar"
      aria-label="서식 도구"
    >
      {inlineActions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="docs-selection-toolbar__button"
          data-active={action.active() ? "true" : "false"}
          title={action.title}
          aria-label={action.title}
          aria-pressed={action.active()}
          onMouseDown={(event) => {
            event.preventDefault();
            action.run();
          }}
        >
          {icons[action.id] ?? action.title}
        </button>
      ))}

      {inlineActions.length > 0 && blockActions.length > 0 && (
        <span className="docs-selection-toolbar__sep" aria-hidden="true" />
      )}

      {blockActions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="docs-selection-toolbar__button"
          data-active={action.active() ? "true" : "false"}
          title={action.title}
          aria-label={action.title}
          aria-pressed={action.active()}
          onMouseDown={(event) => {
            event.preventDefault();
            action.run();
          }}
        >
          {icons[action.id] ?? action.title}
        </button>
      ))}
    </div>
  );
}
