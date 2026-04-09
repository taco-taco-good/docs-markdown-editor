# Foldmark

[한국어](./README.md)

Foldmark is a self-hosted Markdown workspace for a single person who wants to keep working directly on local files.

Your notes stay as `.md` files.  
Your workspace stays on disk.  
On the web, you get search, tabs, outline navigation, and a visual live-preview editor.

## What Foldmark is

Foldmark is a product that turns an ordinary Markdown folder into a focused web workspace.

It is built for situations like these:

- you already keep notes in local Markdown files and want a better interface
- you like rich editing, but do not want your content locked inside an app database
- you want a quiet personal workspace you can host yourself and keep for a long time

Foldmark is closer to a personal document workspace than a team collaboration platform.

## Why use Foldmark

- Your files stay portable.
  Documents are stored as normal Markdown files, and the workspace folder remains the source of truth.
- The web UI is actually useful.
  Quick open, tabs, outline, search, and live preview are available in one place.
- The format stays open.
  You can still use Git, backups, and other editors without conversion.
- It is easy to self-host.
  You can run it on a personal server or home server as your own writing space.

## Screenshots

### Workspace

![Foldmark workspace overview](docs/assets/readme/workspace-overview.png)

### Quick Open

![Foldmark quick open](docs/assets/readme/quick-open.png)

### Editor Detail

![Foldmark editor detail](docs/assets/readme/editor-detail.png)

## Core features

### Markdown-native editor

- visual editor that still stores plain Markdown
- live preview for checklists, tables, code blocks, and links
- outline navigation for long documents
- tab-based sessions that preserve context while moving across files

### Personal workspace

- local-folder file tree
- quick open and search
- internal document links and `@path` references
- templates and asset uploads

### Self-hosted operation

- local account authentication
- OIDC login
- Docker / Docker Compose deployment
- external file change detection

## Who it is for

- people who want to manage their own notes as Markdown files
- people building a personal wiki, research notebook, work log, or design archive
- people who want better UI without giving up file ownership

## Where data is stored

The model is simple:

- documents are `.md`
- assets are in `.assets/`
- app metadata is in `.docs/`

Example:

```text
workspace/
├── .assets/
├── .docs/
├── notes/
├── guides/
└── *.md
```

Foldmark does not trap documents inside a separate database. It adds a thin editing layer on top of your filesystem.

## Quick start for a deployed server

### 1. Install web dependencies

```bash
npm --prefix packages/web ci
```

### 2. Create the root `.env` file

```bash
cp deploy/env.template .env
```

Example:

```env
WORKSPACE_ROOT=/data
WORKSPACE_ROOT_HOST=/srv/foldmark-data
HOST=0.0.0.0
PORT=3001
WEB_PORT=5173
PUBLIC_HOST=docs.example.com
```

Important values:

- `WORKSPACE_ROOT`: workspace path used by the app
- `WORKSPACE_ROOT_HOST`: actual host directory
- `HOST`, `PORT`: bind address for the service
- `PUBLIC_HOST`: public hostname

### 3. Run on the deployment server

Single-port production-style run:

```bash
npm run serve
```

Example address:

```text
http://127.0.0.1:3001
```

### 4. Complete first-run authentication setup

On first launch, Foldmark shows a setup screen.

- create a local account
- or connect an OIDC provider

OIDC callback example:

```text
https://docs.example.com/auth/oidc/callback
```

## Docker deployment

Docker deployment files live in `deploy/docker`.

```bash
docker compose -f deploy/docker/compose.yml up -d --build
```

Main environment variables:

- `PORT`
- `HOST`
- `WORKSPACE_ROOT`
- `WORKSPACE_ROOT_HOST`
- `IMAGE_NAME` (optional)

Health check:

```bash
curl http://127.0.0.1:3001/api/health
```

## Tests

Base unit tests:

```bash
npm test
```

Browser-based editor regression:

```bash
npm run test:editor-regression -- --base-url http://127.0.0.1:3001 --username <user> --password <pass>
```

Mobile viewport regression:

```bash
npm run test:mobile-editor-regression -- --base-url http://127.0.0.1:3001 --username <user> --password <pass>
```

## Current scope

Implemented today:

- browse, open, and edit a local markdown workspace
- visual markdown editor
- file tree, search, tabs, outline, templates, asset uploads
- local auth and OIDC
- REST API + SSE-based external change handling

Not implemented yet:

- standalone CLI package
- MCP server
- Yjs/CRDT collaboration
- Git-based version history
