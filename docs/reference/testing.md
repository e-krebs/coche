# Testing

Catalog of the test infrastructure — what exists and where. Conventions for writing tests
(parametrized `setup()`, the no-mocking policy, the `ui` query-object pattern) live in
[CLAUDE.md](../../CLAUDE.md), not here. For commands to run any of this, see
[../how-to/run-the-tests.md](../how-to/run-the-tests.md).

## Vitest

[../../vitest.config.ts](../../vitest.config.ts) defines two Vitest projects:

| Project  | Runtime                                                   | Scope         |
| -------- | ---------------------------------------------------------- | ------------- |
| `client` | jsdom                                                       | `src/client`  |
| `server` | `@cloudflare/vitest-pool-workers` (miniflare, Worker bindings) | `src/server` |

Vitest runs in mode `test`, so Vite loads [../../.env.test](../../.env.test). It is committed and
holds a placeholder publishable key: [../../src/client/env.ts](../../src/client/env.ts) throws on a
missing one, so without it the suite would pass only on a machine that happens to have a local
`.env`, and fail on a fresh clone and in CI.

### `client` project

Tests render with **@testing-library/react** and **user-event**. Global setup file:
[../../src/client/__tests__/setup.ts](../../src/client/__tests__/setup.ts) — imports
`fake-indexeddb/auto` (so `indexedDB` exists under jsdom) and `@testing-library/jest-dom/vitest`
(custom matchers), then:

- `beforeAll` starts the shared MSW server (see below) with `onUnhandledRequest: "error"`.
- The global `afterEach` — the repo's single cross-cutting teardown, so individual test files carry
  no lifecycle hooks — unmounts the render tree (RTL `cleanup()`), resets MSW's per-test handlers,
  clears `localStorage` and `sessionStorage`, replaces `globalThis.indexedDB` with a fresh
  `IDBFactory`, and resets `navigator.onLine` to `true`.
- `afterAll` closes the MSW server.

**Network mocking — MSW.** [../../src/client/__tests__/msw.ts](../../src/client/__tests__/msw.ts)
exports `server`, a shared `msw/node` `setupServer()` instance with no default handlers; tests add
per-case handlers via `server.use(...)`. It's started, reset, and closed globally by `setup.ts`
above, so no test file manages its own MSW lifecycle.

**Dependency-injection seam — identity.**
[../../src/client/store/identity.ts](../../src/client/store/identity.ts) splits the offline-identity
gate into a pure part and a Clerk-bound wrapper:

- `useIdentityFrom(auth)` — takes the Clerk auth snapshot (`isLoaded`, `isSignedIn`, `userId`) as a
  parameter instead of calling `useAuth()` itself, so the resolution and cache-sync logic is
  exercised with plain values.
- `useIdentity()` — the production entry point, `useIdentityFrom(useAuth())`.
- `readCachedUserId`, `writeCachedUserId`, `clearCachedUserId` — the `localStorage` cache helpers,
  also exported for direct use in test setup/assertions.
- `IdentityStatus` and `Identity` are exported types; the auth-snapshot parameter type is internal
  (tests recover it via `Parameters<typeof useIdentityFrom>[0]`).

Covered by
[../../src/client/store/__tests__/identity.test.ts](../../src/client/store/__tests__/identity.test.ts).

### `server` project

Runs under `@cloudflare/vitest-pool-workers`, wired to the project's own
[../../wrangler.toml](../../wrangler.toml). `vitest.config.ts` supplies test-only miniflare
bindings — `CLERK_SECRET_KEY`, `LIST_ID_SECRET`, `TICKET_SECRET`, `ALLOWED_ORIGINS`,
`CLERK_AUTHORIZED_PARTIES`, and `DEV: "true"` — so Worker tests run without touching real secrets or
the `eu` jurisdiction (see [../explanation/auth-and-sync.md](../explanation/auth-and-sync.md)).
[../../src/server/__tests__/env.d.ts](../../src/server/__tests__/env.d.ts) is ambient types only: it
bridges the Worker's hand-rolled `Env` into `cloudflare:test`'s global `Cloudflare.Env` for
type-checking, not a test suite itself.

### Co-located suites

- [../../src/client/__tests__/](../../src/client/__tests__/) — the global setup and shared MSW
  server above; not a suite itself.
- [../../src/client/components/__tests__/](../../src/client/components/__tests__/) — the list picker
  (pick, create, rename, delete-behind-confirmation, the dialog's focus contract, Tab containment and
  Escape's precedence), the language dialog (radio roving, opener restore including a destroyed
  opener), and the sync indicator, whose suite pins that it is *not* a live region.
- [../../src/client/components/ShoppingList/__tests__/](../../src/client/components/ShoppingList/__tests__/)
  — shopping-list components and hooks.
- [../../src/client/i18n/__tests__/](../../src/client/i18n/__tests__/) — i18n resources/lookup.
- [../../src/client/store/__tests__/](../../src/client/store/__tests__/) — store, sync, CRDT merge,
  reorder, teardown, identity, and the lists roster (virtual default row, the gated default-list
  migration, orphan resurrection).
- [../../src/server/__tests__/](../../src/server/__tests__/) — Worker/DO auth, Clerk verification,
  and request handling.

## Playwright

Two independent tiers exercise the app in a real browser. For why they're split this way (hermetic
vs. real-Clerk trade-off), see
[../explanation/architecture.md#test-coverage](../explanation/architecture.md#test-coverage).

### Local tier — `e2e/local/`

- Config: [../../playwright.config.ts](../../playwright.config.ts) — `testDir: "./e2e/local"`,
  `fullyParallel: true`, 2 retries in CI. `webServer` runs a production build + preview
  (`yarn build:e2e && yarn preview`) rather than the dev server, so the PWA service worker the
  offline spec depends on is active. Run `offline.spec.ts` **first** after any routing change: it
  reloads a deep `/lists/<id>` URL the service worker never precached, which only works because
  `navigateFallback` has no denylist. The mode-specific build scripts exist because `yarn build`
  chains the CSP generator after `vite build`, so a trailing `--mode` would reach the generator
  instead of Vite.
- Hermetic by design: [../../e2e/local/fixtures.ts](../../e2e/local/fixtures.ts) extends `context`
  to seed `localStorage["shopping:userId"]` with a fixed test user via `addInitScript`, and to abort
  every non-localhost request via `context.route` — the app boots offline-only, with no sync Worker
  and no reachable Clerk.
- Env: [../../.env.e2e](../../.env.e2e) sets `VITE_SYNC_URL` empty (sync disabled) and a well-formed
  Clerk publishable key whose Frontend API host is unreachable, so `clerk-js` loads same-origin but
  can't reach the FAPI — Clerk never initializes and the seeded cached identity drives the app.
- The fixtures module also exports the DOM helpers shared across local specs: `field`, `checkbox`,
  `row`, `gotoApp`, `addItem`, `uncheckedNames`, `waitForServiceWorker`, `waitForDragShift`, plus
  the list-picker helpers — `switchList` (the header title, matched by `[data-list-trigger]` because
  its accessible name is the active list's name), `sheet`, `pickList`, and `createList`.
  `uncheckedNames` takes the first `ul` that isn't `[data-checked-list]`: the unchecked section
  renders no `ul` at all when empty, so a bare `.first()` would silently return the *checked* names.
- **`keyboard.spec.ts` and `motion.spec.ts` are the browser-only tier of the accessibility coverage.**
  Three things are not computable in jsdom, so they can only be asserted here: `inert` (jsdom reflects
  the attribute but implements none of its behaviour), sequential focus navigation with a real tab
  order, and `:focus-visible` plus the `ring-*` box-shadow it reveals — the unit config sets
  `css: false`, so a Tailwind class never becomes a computed style there. The division of labour is:
  the unit tier asserts where focus *lands* (`toHaveFocus`), this tier asserts what the browser does
  with it. `motion.spec.ts` emulates the preference in-test with
  `page.emulateMedia({ reducedMotion: "reduce" })` rather than adding a second Playwright project, so
  the config stays one project and `fullyParallel` still applies.
- **`a11y.spec.ts`** runs `@axe-core/playwright` over nine DOM states — empty list, populated list,
  the checked group collapsed and expanded, search results, no-match search, the picker in pick and
  edit mode, and the delete confirmation — against the `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` tags. It emulates reduced
  motion so each surface is fully painted when measured, and filters the two rules the whole-row drag
  activator trips (`nested-interactive`, `list`) **per node** rather than per scan, so a new violation
  of either elsewhere on the same screen still fails. `color-contrast` is never disabled. The language
  chooser is out of reach here, because Clerk never initializes in the hermetic tier — see
  [../adr/0015-axe-e2e-gate.md](../adr/0015-axe-e2e-gate.md).
- Arrow-driven keyboard reorder stays out of this tier (see the note in
  [../../e2e/local/reorder.spec.ts](../../e2e/local/reorder.spec.ts)); the lift-then-Escape case here
  presses no arrow, so it has none of that timing sensitivity.
- Type-checked independently via [../../e2e/local/tsconfig.json](../../e2e/local/tsconfig.json).

### Sync tier — `e2e/sync/`

- Config: [../../playwright.config.sync.ts](../../playwright.config.sync.ts) — `testDir:
  "./e2e/sync"`, serial (`fullyParallel: false`, `workers: 1`, since every test shares one
  `wrangler dev` process and one real Clerk instance), `globalSetup:
  "./e2e/sync/global-setup.ts"`. `webServer` runs two processes: `wrangler dev` (port 8787,
  `DEV=true`, origin allowlisted to the preview build, state persisted under
  `.wrangler/e2e-state`) and a production build + preview (port 5200).
- [../../e2e/sync/global-setup.ts](../../e2e/sync/global-setup.ts) calls `clerkSetup()` from
  `@clerk/testing/playwright`, which puts a Clerk Testing Token (bypasses bot detection) in
  `process.env` for every Playwright worker to inherit.
- [../../e2e/sync/fixtures.ts](../../e2e/sync/fixtures.ts) provisions an isolated Clerk user per
  test: the `makeUser` fixture creates a `+clerk_test@example.com`-tagged user via `@clerk/backend`
  and deletes it in teardown — a fresh user means a fresh HMAC `listId` and a clean Durable Object
  per test (see [../explanation/auth-and-sync.md](../explanation/auth-and-sync.md)). `signIn`
  authenticates via a backend-minted ticket, with no sign-in form. `hasReplica` checks whether the
  `shopping-<userId>` IndexedDB replica exists. The module re-exports the local tier's DOM helpers
  from `../local/fixtures`.
- Env: the real `CLERK_SECRET_KEY` comes from a gitignored `.dev.vars` locally or the
  `CLERK_SECRET_KEY` repo secret in CI; [../../.env.e2e-sync](../../.env.e2e-sync) commits the
  matching public `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_SYNC_URL=http://localhost:8787`.
- Type-checked independently via [../../e2e/sync/tsconfig.json](../../e2e/sync/tsconfig.json).

## CI

[../../.github/workflows/ci.yml](../../.github/workflows/ci.yml) runs the Vitest projects and both
Playwright tiers as separate jobs, alongside lint/format/typecheck/build — the sync tier's job skips
cleanly when the `CLERK_SECRET_KEY` repo secret isn't set. Full breakdown:
[../how-to/deploy.md#ci](../how-to/deploy.md#ci).
