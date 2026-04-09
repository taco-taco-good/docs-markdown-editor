# Foldmark Design System

Foldmark should feel like one product, not a collection of separate screens.

The editor, sidebar, search, settings, auth, and dialogs should all read as the same workspace.

## Product character

- calm
- compact
- file-first
- dark-forward, but themeable
- keyboard-friendly

The UI should support long writing sessions. It should feel stable and quiet rather than decorative.

## Token layers

### Semantic color tokens

- `--color-surface-*`
- `--color-text-*`
- `--color-border*`
- `--color-accent*`
- `--color-danger`
- `--color-warning`
- `--color-success`
- `--color-info`

These tokens describe meaning, not individual screens.

### UI tokens

- `--radius-panel`
- `--radius-control`
- `--radius-pill`
- `--shadow-panel`
- `--shadow-floating`
- `--focus-ring`
- `--focus-ring-offset`
- `--overlay-backdrop`
- font size scale tokens in `globals.css`

Themes may change both color and UI tone. A theme is incomplete if it only swaps palette values.

## Core primitives

### Buttons

Use:

- `.ui-button`
- `.ui-button--solid`
- `.ui-button--primary`
- `.ui-button--ghost`
- `.ui-button--danger`
- `.ui-button--header`
- `.ui-icon-button`

Rules:

- hover, focus-visible, active, and disabled states must feel related
- icon-only buttons must have `aria-label`
- header actions may use denser spacing, but should still come from the same button family

### Fields

Use:

- `.ui-field`
- `.ui-label`
- `.ui-input`
- `.ui-select`
- `.ui-textarea`
- `.ui-description`

Rules:

- labels must bind with `htmlFor`
- inputs must declare `id` and `name`
- use `autocomplete` where browsers can help

### Dialogs

Use shared dialog structure:

- `.ui-dialog-backdrop`
- `.ui-dialog-panel`
- `.ui-dialog-header`
- `.ui-dialog-body`
- `.ui-dialog-footer`

Rules:

- every modal uses `role="dialog"` and `aria-modal="true"`
- every modal has an accessible title
- focus enters the dialog on open
- `Tab` stays trapped
- `Escape` closes
- focus returns to the previously focused element on close

## Editor-specific rules

- Markdown storage stays plain and portable
- visual rendering should never hide the fact that the source is markdown-backed
- selection, caret, and live preview behavior matter more than decorative styling
- code blocks, tables, tasks, links, and outline should look like one editor language

## Overlay language

Search, create flows, template management, and settings should all feel related.

That means:

- same backdrop logic
- same radius family
- same header spacing
- same footer action rhythm
- same focus ring rules

Do not invent a separate modal design for each screen.

## Accessibility baseline

- every interactive element exposes visible `:focus-visible`
- dialog flows are fully keyboard reachable
- labels are explicit
- color alone should not carry state meaning

## Browser chrome

Theme changes should also update:

- `theme-color`
- favicon / app icon
- `color-scheme`

The browser shell is part of the product surface, especially on mobile.
