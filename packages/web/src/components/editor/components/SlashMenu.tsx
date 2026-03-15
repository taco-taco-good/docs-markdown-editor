import { useRef, useEffect } from "react";
import type { SlashCommand } from "../slash-commands";

interface SlashMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  position: { top: number; left: number };
  onSelect: (command: SlashCommand) => void;
}

export function SlashMenu({ commands, selectedIndex, position, onSelect }: SlashMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const activeItem = menuRef.current?.querySelector<HTMLElement>(
      `[data-slash-index="${selectedIndex}"]`,
    );
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, commands.length]);

  return (
    <div
      ref={menuRef}
      className="slash-menu slash-menu--floating"
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {commands.map((command, index) => (
        <button
          key={command.id}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(command);
          }}
          className="slash-menu__item"
          data-slash-index={index}
          data-active={index === selectedIndex ? "true" : "false"}
        >
          <span className="slash-menu__line">
            <span className="slash-menu__title">{command.title}</span>
            <span className="slash-menu__description">{command.description}</span>
            {command.shortcut ? (
              <small className="slash-menu__shortcut">{command.shortcut}</small>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
