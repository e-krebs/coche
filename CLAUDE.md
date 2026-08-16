# Coche — agent instructions

Per-user, local-first shopping list (TanStack Router SPA + TinyBase CRDT + Cloudflare Worker/DO).
Documentation lives in [docs/](docs/) — [docs/README.md](docs/README.md) is the map;
[README.md](README.md) is the entry point.

## Conventions

Code style (comments, oxfmt/oxlint, path aliases), client styling (data-attr Tailwind variants,
motion tiers), and testing (Vitest, no-mocking policy, `ui` query objects) each have a dedicated
skill: [`code-style`](.claude/skills/code-style/SKILL.md),
[`styling`](.claude/skills/styling/SKILL.md), or [`testing`](.claude/skills/testing/SKILL.md). A
PreToolUse hook ([.claude/hooks/skill-nudge.ts](.claude/hooks/skill-nudge.ts)) nudges toward the
right one when editing a matching file. Load the skill for the full rules before writing or
reviewing that kind of change.

Build tooling is TypeScript too — [vite.config.ts](vite.config.ts), [scripts/](scripts/) and the hook
run on **Node 24** via native type stripping, so relative imports inside `scripts/` carry the `.ts`
extension and `yarn typecheck:node` is the gate. See
[docs/adr/0012-typescript-build-scripts.md](docs/adr/0012-typescript-build-scripts.md).

## Keep docs in sync with the code

`docs/` is a living deliverable, not a one-time writeup. When a change alters observable behavior, a
public interface, an invariant, or an operational fact, **update the affected doc in the same
change** — code that drifts its docs is incomplete. Writing conventions for the docs (quadrant
choice, voice, links/anchors, ADR format) live in the **`diataxis-docs` skill**
([.claude/skills/diataxis-docs/SKILL.md](.claude/skills/diataxis-docs/SKILL.md)).

Code touched → doc to check (update if the change is user- or reader-visible):

| Code area | Type | Doc to check |
|---|---|---|
| `src/client/store/schema.ts`, `store.ts`, `lists.ts`, `persister.ts`, `reorder.ts` | reference; explanation | [docs/reference/data-model.md](docs/reference/data-model.md); [docs/explanation/auth-and-sync.md](docs/explanation/auth-and-sync.md) (merge semantics / durability) |
| `src/client/store/sync.ts`, `syncStatus.ts`, `identity.ts`, `teardown.ts`, `StoreProvider.tsx`, `components/SyncStatus.tsx` | explanation | [docs/explanation/auth-and-sync.md](docs/explanation/auth-and-sync.md) (reconnect, sync status, offline identity, teardown) |
| `src/client/components/ShoppingList/**` (list UI, reorder, swipe/undo, focus) | explanation | [docs/explanation/architecture.md](docs/explanation/architecture.md) (Design & UX) |
| `src/client/components/*.tsx` (`ListView`, `ListPicker`, `ConfirmDialog`, `useOpenerFocus`) — roster UI, dialog focus contract | explanation | [docs/explanation/architecture.md](docs/explanation/architecture.md) (Design & UX, components) |
| Cross-cutting UX: theme (`styles.css`), motion, a11y | explanation | [docs/explanation/architecture.md](docs/explanation/architecture.md) (Design & UX) |
| `src/client/i18n/**`, `components/LanguageDialog.tsx` (incl. the `localeStore.ts` localStorage seam) | explanation | [docs/explanation/architecture.md](docs/explanation/architecture.md) (Design & UX) |
| `src/server/**` (Worker, Durable Object, ticket/clerk auth, EU forward) | explanation | [docs/explanation/auth-and-sync.md](docs/explanation/auth-and-sync.md); [docs/explanation/architecture.md](docs/explanation/architecture.md) (diagram, components) |
| `src/shared/**` (client↔server contract: `/ws-ticket` shape, WS URL) | explanation | [docs/explanation/auth-and-sync.md](docs/explanation/auth-and-sync.md) |
| `wrangler.toml`, env vars, `.github/workflows/**`, deploy scripts | how-to | [docs/how-to/deploy.md](docs/how-to/deploy.md) |
| Routing / SPA shell / Clerk wiring (`src/client/routes/**`, `src/client/router.tsx`) | explanation | [docs/explanation/architecture.md](docs/explanation/architecture.md) (components) |
| Lint/format/typecheck config (`.oxlintrc.json`, `.oxfmtrc.json`, `tsconfig*.json`, `.nvmrc`, pinned tool versions) | explanation | [docs/explanation/tooling.md](docs/explanation/tooling.md) |
| Test infrastructure (`vitest.config.ts`, `setup.ts`/`msw.ts`, Playwright configs, `e2e/**`) | reference | [docs/reference/testing.md](docs/reference/testing.md) |
| README's Status / Documentation sections | — | keep in step with `docs/` (don't let them contradict) |

A new architectural decision — or reversing an existing one — gets an ADR under
[docs/adr/](docs/adr/). Don't rewrite a superseded decision's history: add a new ADR that supersedes
it and mark the old one (see `0008` superseding `0007`).

When unsure whether a code change needs a doc edit, check the mapped doc and either update it or
confirm it still reads true — a two-minute check beats silent drift.
