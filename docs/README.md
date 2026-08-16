# Documentation

These docs follow the [Diátaxis](https://diataxis.fr) framework: two axes — action vs. cognition,
and acquisition vs. application of skill — cross to form four types (tutorials, how-to guides,
reference, explanation), each answering a different kind of question. Agent-facing writing
conventions for these docs live in the `diataxis-docs` skill
(`.claude/skills/diataxis-docs/SKILL.md`).

## Tutorials — learning

- [tutorials/getting-started.md](tutorials/getting-started.md) — clone the repo, get a Clerk key,
  run `yarn dev`, and see the first items persisted locally.

## How-to guides — tasks

- [how-to/deploy.md](how-to/deploy.md) — deploy the Cloudflare Pages site and Worker, run the DO
  migration, set up the custom subdomain, configure env/secrets and the Clerk dashboard, and wire
  CI.
- [how-to/run-the-tests.md](how-to/run-the-tests.md) — commands and setup for every test tier: unit,
  Worker, both Playwright tiers, typechecks, and lint.

## Reference — information

- [reference/data-model.md](reference/data-model.md) — entities and invariants, kept thin;
  `schema.ts` is the source of truth.
- [reference/glossary.md](reference/glossary.md) — acronyms and terms used across code and docs.
- [reference/testing.md](reference/testing.md) — catalog of the test infrastructure: Vitest
  projects, MSW, the DI seam, and the Playwright tiers.

## Explanation — understanding

- [explanation/architecture.md](explanation/architecture.md) — system diagram, components, and
  design & UX decisions.
- [explanation/auth-and-sync.md](explanation/auth-and-sync.md) — identity derivation, WS ticket
  flow, EU forward, offline identity, and CRDT merge semantics.
- [explanation/tooling.md](explanation/tooling.md) — why the oxc toolchain is set up the way it is.

## ADRs — decision records

Architecture decision records sit outside the four quadrants as their own recognized genre (see
[adr/0009-adopt-diataxis.md](adr/0009-adopt-diataxis.md)).

- [adr/0001-drop-tanstack-start.md](adr/0001-drop-tanstack-start.md) — Drop TanStack Start (SSR) for
  a static TanStack Router SPA
- [adr/0002-tinybase-crdt.md](adr/0002-tinybase-crdt.md) — TinyBase `MergeableStore` as the
  local-first CRDT engine
- [adr/0003-do-per-listid.md](adr/0003-do-per-listid.md) — One Durable Object per `listId`
- [adr/0004-eu-residency-cloudflare.md](adr/0004-eu-residency-cloudflare.md) — EU residency via
  Cloudflare Durable Object jurisdiction
- [adr/0005-offline-cached-identity.md](adr/0005-offline-cached-identity.md) — Trust a cached
  identity for offline boot
- [adr/0006-deterministic-hmac-listid.md](adr/0006-deterministic-hmac-listid.md) — Deterministic
  HMAC-derived `listId`, not stored membership
- [adr/0007-fractional-index-reorder.md](adr/0007-fractional-index-reorder.md) — Fractional-index
  reorder for drag-and-drop
- [adr/0008-dnd-kit-reorder.md](adr/0008-dnd-kit-reorder.md) — dnd-kit for drag reorder (superseding
  React Aria Components)
- [adr/0009-adopt-diataxis.md](adr/0009-adopt-diataxis.md) — Adopt Diátaxis for docs structure
- [adr/0010-do-idle-socket-alarm.md](adr/0010-do-idle-socket-alarm.md) — Idle-socket lifetime alarm
  on the Durable Object
- [adr/0011-deployment-identifiers-out-of-repo.md](adr/0011-deployment-identifiers-out-of-repo.md) —
  Deployment identifiers stay out of the repo; the production CSP is generated at build time
- [adr/0012-typescript-build-scripts.md](adr/0012-typescript-build-scripts.md) — TypeScript build
  scripts on a Node 24 baseline, executed by native type stripping
- [adr/0013-multi-list-single-store.md](adr/0013-multi-list-single-store.md) — Multiple lists in one
  store, one sync unit per user
- [adr/0014-jsx-a11y-lint-rules.md](adr/0014-jsx-a11y-lint-rules.md) — A curated jsx-a11y rule set,
  with three rules off
