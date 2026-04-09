# Editor Architecture

This document describes the current Foldmark editor, not an old planned editor.

## Current model

Foldmark uses a markdown-backed editor.

- the source of truth is a markdown string
- the editing engine is CodeMirror 6
- visual rendering is layered on top with decorations and widgets
- saving writes markdown back to disk

There is no separate rich-text document model that becomes canonical.

## Main layers

### 1. Document sessions

Managed in [`document.store.ts`](../packages/web/src/stores/document.store.ts).

This layer owns:

- current document path
- current raw markdown
- dirty state
- save status
- revision
- pending remote updates
- per-document selection and scroll snapshots

It also manages:

- autosave
- conflict handling
- local draft recovery
- external file updates

### 2. Tab sessions

Managed in [`tab.store.ts`](../packages/web/src/stores/tab.store.ts).

This layer owns:

- open tabs
- active tab
- pinned state
- tab ordering
- restored tabs after reload

Foldmark keeps one active editor view and swaps document sessions, instead of keeping a live CodeMirror instance per tab.

### 3. Editor engine

The active editor is [`MarkdownSourceEditor.tsx`](../packages/web/src/components/editor/MarkdownSourceEditor.tsx).

It creates a single CodeMirror view and connects it to the active document session.

This layer owns:

- current buffer
- selection
- viewport
- composition state
- floating toolbar placement
- outline jump behavior

### 4. Visual markdown layer

The rendering rules live under [`packages/web/src/components/editor/codemirror`](../packages/web/src/components/editor/codemirror).

Important files:

- `extensions.ts`
- `live-preview.ts`
- `commands.ts`
- `stability.ts`
- `table-render.ts`
- `table-editing.ts`
- `code-blocks.ts`
- `navigation.ts`

This layer is responsible for:

- live preview
- link widgets
- task toggles
- table rendering
- code block behavior
- markdown transforms triggered by toolbar and keyboard commands

## Save flow

1. User edits markdown in CodeMirror.
2. The editor updates the active document session.
3. The session becomes dirty.
4. Autosave schedules a write.
5. The server writes markdown to disk.
6. If the revision changed externally, the client resolves conflict or reloads.

Important rule:

- visual rendering may fail
- markdown storage must still remain correct

## Interaction stability rules

The editor deliberately separates rendering from editing safety.

Current rules include:

- active line fallback when needed for stability
- composition-aware behavior
- custom markdown commands for lists, tasks, links, headings, and code blocks
- explicit save coordination to avoid self-conflicting saves

This is why Foldmark can stay markdown-backed while still feeling visual.

## Server interaction

The editor talks to the file-backed server through:

- `GET /api/docs/:path`
- `PUT /api/docs/:path`
- `PATCH /api/docs/:path`
- SSE-based external change notifications

Server behavior is file-first:

- documents are read from disk
- updates are written back to disk
- search and tree views are rebuilt from the workspace

## What the editor is not

Foldmark is not:

- a ProseMirror / Tiptap rich-text-first editor
- a database-first note system
- a collaborative CRDT editor today

It is a markdown-first personal workspace with a visual editing layer.
