# Git Workflow

Foldmark uses a simple branch model.

## Main branches

- `main`
  Production-ready branch.

- `develop`
  Active integration branch for ongoing work.

## Release branches

Foldmark uses release branches before shipping to `main`.

- `release/<version>`
  short stabilization branch created from `develop`

Use release branches to:

- fix regressions
- verify deployment
- confirm docs and release notes

Do not use release branches for new feature work.

## Working branches

Use short-lived branches from `develop` for normal work:

- `feature/<name>`
- `bugfix/<name>`
- `docs/<name>`

Use `main` only for true production hotfixes when needed.

## Commit style

Use Conventional Commit style where practical:

```text
type(scope): summary
```

Examples:

- `feat(editor): add multi-tab sessions`
- `fix(tabs): sync sidebar selection on tab change`
- `docs(readme): rewrite product overview`

Preferred types:

- `feat`
- `fix`
- `docs`
- `refactor`
- `test`
- `chore`

## Merge rules

- keep commits focused
- avoid mixing unrelated refactors and feature work
- merge into `develop` first
- promote to `main` only when the result is deployment-ready

For actual release criteria and bug gating, see [RELEASE.md](./RELEASE.md).

## Practical rule

If a document, test, or implementation note no longer matches the current code, update it in the same branch as the code change or delete it.

Outdated documentation should not be preserved as if it were current truth.
