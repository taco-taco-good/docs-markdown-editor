# Foldmark

[한국어](./README.ko.md)

Foldmark is a self-hosted Markdown workspace for one person.

It turns an ordinary folder of `.md` files into a calm writing environment with tabs, quick open, outline navigation, and live preview editing, while keeping your notes as plain files on disk.

## The Problem Foldmark Solves

Personal notes often end up in one of these states:

- the files stay portable, but the writing experience feels raw and fragmented
- the editor feels polished, but the notes stop feeling like normal files you own
- the workspace gets harder to browse once documents, drafts, and references start piling up

Foldmark is built for that gap.

- your folder stays the source of truth
- Markdown stays the stored format
- the browser becomes the layer that makes the workspace calm, searchable, and pleasant to edit

This is not a team knowledge base. It is a personal workspace for someone who wants to keep owning their notes.

## What it feels like

- Quick to open
- Quiet to use
- File-based by default
- Visual when editing, plain when stored
- Simple to self-host

## Screenshots

### Workspace

![Foldmark workspace overview](docs/assets/readme/workspace-overview.png)

### Quick Open

![Foldmark quick open](docs/assets/readme/quick-open.png)

### Editor

![Foldmark editor detail](docs/assets/readme/editor-detail.png)

## Core features

### Markdown-first editor

- visual editor that still stores plain Markdown
- live preview for checklists, tables, code blocks, links, and dividers
- outline navigation for long documents
- multi-tab sessions that preserve context while moving across files

### Personal workspace tools

- local-folder file tree
- quick open and search
- internal document links and `@path` references
- templates and asset uploads

### Self-hosted operation

- local account authentication
- OIDC login
- Docker / Docker Compose deployment
- file-based storage with external change detection

## Who it is for

Foldmark is a good fit if you:

- already keep notes in Markdown files
- want a personal wiki, research notebook, work log, or design archive
- prefer local folders and Git-friendly files over closed document systems
- want a better interface without giving up portability

## How data stays yours

Foldmark keeps the model simple:

- documents are `.md`
- assets are stored in `.assets/`
- app metadata is stored in `.docs/`

Example:

```text
workspace/
├── .assets/
├── .docs/
├── notes/
├── guides/
└── *.md
```

That means Foldmark is not your source of truth. Your folder is.

## Deploy on your server

### 1. Install web dependencies

```bash
npm --prefix packages/web ci
```

### 2. Create the root `.env`

```bash
cp deploy/env.template .env
```

Example:

```env
WORKSPACE_ROOT=/data
WORKSPACE_ROOT_HOST=/srv/foldmark-data
HOST=0.0.0.0
PORT=3001
PUBLIC_HOST=docs.example.com
```

### 3. Run Foldmark

```bash
npm run serve
```

Then open:

```text
http://127.0.0.1:3001
```

On first launch, complete the setup flow and create a local account or connect an OIDC provider.

### Docker

```bash
docker compose --env-file .env -f deploy/docker/compose.yml up -d --build
```

The Docker path was verified against the current compose file with a separate deployment `.env` and bind-mounted workspace.
The compose configuration was validated against the current file with a separate deployment `.env` and a bind-mounted workspace path.

## License

MIT. See [LICENSE](./LICENSE).
