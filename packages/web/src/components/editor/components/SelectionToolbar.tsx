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

export function SelectionToolbar({ actions, position }: SelectionToolbarProps) {
  return (
    <div
      className="docs-selection-toolbar"
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="docs-selection-toolbar__button"
          data-active={action.active() ? "true" : "false"}
          onMouseDown={(event) => {
            event.preventDefault();
            action.run();
          }}
        >
          {action.title}
        </button>
      ))}
    </div>
  );
}
