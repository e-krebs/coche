# Coche

Per-user, local-first shopping list. Offline read+write on every device, auto-merge across a
user's devices, data-at-rest in the EU. Personal project.

- Frontend: static SPA — TanStack Router + React 19 + Vite + Tailwind, Clerk for auth.
- Local store: TinyBase `MergeableStore` (CRDT) + IndexedDB persistence.
- Sync: Cloudflare Worker + Durable Object, pinned to the `eu` jurisdiction in production.
- Deploy target: Cloudflare Pages (SPA) + Cloudflare Worker (sync server).

## Status

Built and tested: SPA shell, local store, list UI (multiple lists behind a bottom-sheet picker —
create, rename, reorder, delete — unchecked/checked sections, search, rename, quantity, dnd-kit
drag-reorder, light/dark theme, motion, scroll restoration), sync server + WS ticket auth,
sign-out teardown, PWA/offline shell. Covered by client tests (Vitest/jsdom) and Worker tests
(`@cloudflare/vitest-pool-workers`/miniflare), plus two Playwright e2e tiers. Deployed: the SPA on
Cloudflare Pages behind a custom domain, the sync Worker on `*.workers.dev` with its Durable Object
pinned to the `eu` jurisdiction, and a Clerk production instance — see
[docs/how-to/deploy.md](docs/how-to/deploy.md). The DO bounds idle WebSocket lifetime with a
per-socket alarm. CI has a deploy job for pushes to `main`; it stays skipped until the Cloudflare
repo secrets are set, so deploys are manual until then. Deferred (not v1-blocking): an absolute
socket re-auth cap (idle-only alarm is built).

## Quickstart

```sh
yarn                 # install (Yarn 4)
cp .env.sample .env  # set VITE_CLERK_PUBLISHABLE_KEY (pk_test_…)
yarn dev             # SPA, http://localhost:3000
yarn sync:dev        # optional: sync Worker (wrangler dev), http://localhost:8787
```

First time? Follow the tutorial:
[docs/tutorials/getting-started.md](docs/tutorials/getting-started.md).

## Documentation

[docs/README.md](docs/README.md) is the map. The docs follow [Diátaxis](https://diataxis.fr/):

- [docs/tutorials/](docs/tutorials/) — learning: get the app running locally.
- [docs/how-to/](docs/how-to/) — tasks: deploy, run the tests.
- [docs/reference/](docs/reference/) — facts: data model, glossary, test infrastructure.
- [docs/explanation/](docs/explanation/) — understanding: architecture, auth & sync, tooling.
- [docs/adr/](docs/adr/) — architecture decision records.

## Testing & checks

```sh
yarn test           # client (Vitest, jsdom)
yarn test:worker    # sync server (Vitest, @cloudflare/vitest-pool-workers)
yarn typecheck && yarn typecheck:worker
yarn lint && yarn format:check
```

All the recipes (e2e tiers, every typecheck):
[docs/how-to/run-the-tests.md](docs/how-to/run-the-tests.md).
