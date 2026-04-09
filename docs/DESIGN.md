# Foldmark Design System

## Core Principle

Foldmark is not a theme picker around one static UI. The product should feel like one coherent markdown workspace whose tokens, overlays, fields, and interaction states move together.

## Token Layers

### Semantic colors

- `--color-surface-*`: workspace and panel surfaces
- `--color-text-*`: hierarchy of text contrast
- `--color-accent*`: primary action and active state
- `--color-border*`: resting and active boundaries
- `--color-danger`, `--color-warning`, `--color-success`, `--color-info`: status semantics

### UI semantics

- `--radius-panel`, `--radius-control`, `--radius-pill`
- `--shadow-panel`, `--shadow-floating`
- `--focus-ring`, `--focus-ring-offset`
- `--overlay-backdrop`

Themes may customize both color and UI semantics. A theme is incomplete if it only swaps palette values.

## Primitive Components

### Dialogs

Use shared dialog primitives for all overlays:

- `.ui-dialog-backdrop`
- `.ui-dialog-panel`
- `.ui-dialog-header`
- `.ui-dialog-body`
- `.ui-dialog-footer`

Rules:

- Every modal uses `role="dialog"` and `aria-modal="true"`
- Every modal has an accessible title via `aria-labelledby`
- Focus enters the dialog on open
- `Tab` is trapped within the dialog
- `Escape` closes the dialog
- Focus returns to the previously focused element on close

### Fields

Use shared field primitives for all forms:

- `.ui-field`
- `.ui-label`
- `.ui-input`
- `.ui-select`
- `.ui-textarea`
- `.ui-description`

Rules:

- Labels must bind via `htmlFor` and `id`
- Inputs must declare `name`
- Inputs should provide `autocomplete` when the browser can help

### Buttons

Use shared button primitives:

- `.ui-button`
- `.ui-button--primary`
- `.ui-button--solid`
- `.ui-button--danger`
- `.ui-button--ghost`
- `.ui-icon-button`

Rules:

- Hover, focus-visible, disabled, and pressed states must read as one system
- Icon-only actions must have `aria-label`

## Overlay Language

Search, settings, create flows, and template management should feel like one family:

- same backdrop treatment
- same panel radius and shadow
- same header spacing
- same close affordance
- same focus behavior

Avoid inventing a new card or modal style per screen.

## Accessibility Baseline

- Buttons, links, fields, and custom interactive elements must expose visible `:focus-visible`
- Dialogs must be keyboard reachable and dismissible
- Form labels must be explicit, not visual-only

## Browser Chrome

Theme changes should also update:

- `<meta name="theme-color">`
- favicon
- apple touch icon
- `color-scheme`

The browser shell is part of the product surface.
