# Release Strategy

Foldmark uses a lightweight release flow.

The goal is simple:

- keep `develop` moving
- keep `main` deployable
- give each release a short stabilization window
- avoid shipping editor regressions that damage trust

## Branch model

- `develop`
  Integration branch for day-to-day work.

- `main`
  Deployment branch.

- `feature/*`, `bugfix/*`, `docs/*`
  Normal short-lived branches targeting `develop`.

- `release/<version>`
  Short-lived stabilization branch created from `develop` before a release.

- `hotfix/<version>`
  Emergency fixes created from `main`.

## Release flow

1. Merge normal work into `develop`
2. When the next cut is ready, create `release/x.y.z`
3. Stabilize only on the release branch
4. Merge `release/x.y.z` into `main`
5. Tag `vX.Y.Z`
6. Merge the same release branch back into `develop`

## What is allowed on a release branch

Allowed:

- bug fixes
- regression fixes
- documentation corrections
- deployment fixes
- version / release metadata updates

Not allowed:

- new features
- broad refactors
- design rewrites unrelated to release blockers

## Versioning

Use semantic versioning.

- `0.1.0`
  first public beta-quality release
- `0.1.1`
  patch release for bug fixes only
- `0.2.0`
  feature release with stable user-facing improvements

Before `1.0.0`, velocity still matters, but user trust matters more for editor and storage behavior.

## Release gates

A release should not ship if any of these remain open:

- markdown corruption or data loss
- broken save flow or repeated save conflicts
- auth/login failure for normal setup paths
- document open failure
- broken editor input for common typing paths
- high-risk security issue
- deployment path clearly broken

In other words:

- open **P0**: never release
- open **P1**: normally do not release
- open **P2/P3**: may release if the core flow is still trustworthy

## Bug policy

Do not gate releases on bug count alone.

What matters is:

- severity
- concentration in core flows
- confidence in workarounds
- whether users can still trust the product

## Practical triage rule

Classify bugs like this:

- `P0`
  data loss, document corruption, auth lockout, app unusable
- `P1`
  major editor regression, common flow broken, deploy path broken
- `P2`
  important but non-blocking behavior issue with workaround
- `P3`
  polish, visual inconsistency, minor annoyance

Before releasing, re-triage open bugs into:

- release blockers
- next patch
- backlog

Ship only if blockers are clear and closed.

## Recommended rhythm

For Foldmark’s current stage:

- feature work on `develop`
- short stabilization window on `release/*`
- small patch releases when editor or deployment regressions appear

This is better than waiting too long for a “perfect” release, but it still protects the product from obvious trust-breaking bugs.
