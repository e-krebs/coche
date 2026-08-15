# Run the tests

Recipes for running each test and check tier locally. For what each tier actually covers and how
the infrastructure is wired, see [../reference/testing.md](../reference/testing.md).

## Run client unit tests

```sh
yarn test
```

Runs the Vitest `client` project (jsdom) once. Needs nothing beyond `yarn install` — network is
mocked with MSW and IndexedDB is faked with `fake-indexeddb`, so it never touches a real backend.

To re-run on file changes:

```sh
yarn test:watch
```

This runs plain `vitest` with no `--project` filter, so it watches both the `client` and `server`
projects together.

## Run Worker tests

```sh
yarn test:worker
```

Runs the Vitest `server` project against `@cloudflare/vitest-pool-workers` (miniflare). All secrets
(`CLERK_SECRET_KEY`, `LIST_ID_SECRET`, `TICKET_SECRET`, …) are dummy values baked into
[../../vitest.config.ts](../../vitest.config.ts), so this needs no `.dev.vars` or other local setup.

## Type-check

```sh
yarn typecheck          # src/client + src/shared, under the browser lib
yarn typecheck:worker   # src/server, under the Worker's no-DOM lib (its own tsconfig)
yarn typecheck:e2e      # e2e/local
yarn typecheck:e2e:sync # e2e/sync (also picks up e2e/local/fixtures.ts, which it imports)
```

Run all four before pushing — each checks a different tsconfig, so passing one doesn't imply the
others pass.

## Lint and format

```sh
yarn lint          # oxlint, whole repo
yarn format:check  # oxfmt --check, whole repo
```

To auto-fix instead of just checking:

```sh
yarn fix
```

This runs `oxlint --fix` then `oxfmt .` — in that order, since lint fixes (e.g. Tailwind class
sorting) can change formatting.

## Run the local e2e tier

```sh
yarn test:e2e
```

Runs Playwright against [../../e2e/local/](../../e2e/local/). This is hermetic: the config's
`webServer` builds the app (`yarn build --mode e2e`, loading [../../.env.e2e](../../.env.e2e)) and
serves it with `yarn preview`, so the run always exercises a fresh production build — a production
build is required because the offline spec needs the PWA service worker, which the dev server
doesn't register. `.env.e2e` sets `VITE_SYNC_URL` empty (sync disabled) and a well-formed but
unreachable Clerk publishable key; each test's fixtures
([../../e2e/local/fixtures.ts](../../e2e/local/fixtures.ts)) seed a cached identity in
`localStorage` and block all non-localhost network, so Clerk's script never loads and no real
account or secret is needed. Outside CI, Playwright reuses an already-running server on port 5199
instead of rebuilding.

## Run the sync e2e tier

```sh
yarn test:e2e:sync
```

Runs Playwright against [../../e2e/sync/](../../e2e/sync/) with a real Clerk dev instance and a
local `wrangler dev` Worker — set both up before running:

1. Create a `.dev.vars` file (gitignored) at the repo root with:
   ```
   CLERK_SECRET_KEY=sk_test_...
   LIST_ID_SECRET=<any string>
   TICKET_SECRET=<any string>
   DEV=true
   ALLOWED_ORIGINS=http://localhost:3000
   CLERK_AUTHORIZED_PARTIES=http://localhost:3000
   ```
   The two origin entries are what `yarn sync:dev` reads: `wrangler.toml` deliberately carries no
   origins (see [../adr/0011-deployment-identifiers-out-of-repo.md](../adr/0011-deployment-identifiers-out-of-repo.md)),
   and this tier overrides them with `--var` anyway — so without them here, only local `wrangler dev`
   against `vite dev` breaks, and it breaks with a `500`.
   `CLERK_SECRET_KEY` must match the Clerk dev instance whose publishable key is committed in
   [../../.env.e2e-sync](../../.env.e2e-sync) — the publishable key is public and safe to commit,
   but the secret key is not, so it never lives in a tracked file.
2. Nothing else to provision: [../../e2e/sync/fixtures.ts](../../e2e/sync/fixtures.ts) creates and
   deletes throwaway Clerk users per test via the backend API, and
   [../../e2e/sync/global-setup.ts](../../e2e/sync/global-setup.ts) fetches a Clerk testing token
   automatically.

The config's `webServer` starts both a `wrangler dev` Worker on port 8787 (local DO state persisted
under `.wrangler/e2e-state`) and a preview build of the app (`--mode e2e-sync`) on port 5200, and
runs specs serially against them — a single wrangler dev instance and shared Clerk instance, so
tests don't race each other. Outside CI, both servers are reused if already running.

## CI

CI runs these same commands on every push and PR; see [deploy.md](deploy.md#ci) for what runs and
how the sync e2e tier is secret-gated on forks.
