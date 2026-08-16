# Deploy

Deploy two targets: the SPA to Cloudflare Pages, and the sync server to a Cloudflare Worker +
Durable Object. Keep the main domain on GitHub Pages — it's static-only and can't host the sync
server, so the sync side runs on Cloudflare instead.

No hostname, account subdomain, or Clerk instance appears in this repository — they are supplied at
deploy time (see
[../adr/0011-deployment-identifiers-out-of-repo.md](../adr/0011-deployment-identifiers-out-of-repo.md)).
Below, `<app-domain>` is the SPA's custom domain, `<sync-host>` the Worker's
`*.workers.dev` host, and `<pages-domain>` the Pages project's `*.pages.dev` domain — which Cloudflare
may suffix, so it need not match the project name.

## SPA → Cloudflare Pages

- Direct upload from a local build:
  ```sh
  VITE_CLERK_PUBLISHABLE_KEY=pk_live_… VITE_SYNC_URL=https://<sync-host> yarn build
  yarn deploy:spa
  ```
  `deploy:spa` runs the CSP and secret gates against the freshly built `dist/` before uploading —
  neither gate is part of `yarn build`, so calling `wrangler pages deploy` directly skips both.
  It passes `--branch main`, without which wrangler infers the branch from git state and a detached
  HEAD uploads a *preview* instead of the live site.
  `--force` is **required**: without it, `pages deploy` delegates to the newer Pages-on-Workers path,
  which picks up this repo's [../../wrangler.toml](../../wrangler.toml) (`main = src/server/index.ts`)
  and deploys the *sync server* under the Pages project's name instead of `dist/`.
- Git integration is an alternative: point the Pages project at the repo and let it run `yarn build`,
  which outputs to `dist/` (config in [../../vite.config.js](../../vite.config.js)).
- Keep the SPA fallback in place: `public/_redirects` contains `/* /index.html 200`, so client-side
  routing keeps working under Pages.
- clerk-js is served same-origin: `yarn build` bundles `@clerk/clerk-js` into `dist/clerk-js/` (no
  Clerk CDN, no env var). Deploy `dist/` as-is.
- Set the build-time public env in the Pages project settings: `VITE_CLERK_PUBLISHABLE_KEY` and
  `VITE_SYNC_URL` (the Worker base URL, `https://<sync-host>`; leave unset for local-only, no sync).
  See [../../.env.sample](../../.env.sample). A direct upload takes them from the shell environment of
  the `yarn build` that produced `dist/` instead. `VITE_CLERK_PUBLISHABLE_KEY` is **required** by the
  CSP generator, not just by the app — `yarn build` resolves the policy's Clerk host from it, and its
  Worker hosts from `VITE_SYNC_URL` when that one is set.
- **Content-Security-Policy**: `yarn build` resolves
  [../../csp/prod.headers.template](../../csp/prod.headers.template) into `dist/_headers`, which Pages
  serves; [../../csp/dev.headers](../../csp/dev.headers) mirrors the same policy for local `vite
  dev`/`vite preview`. Both ship **enforcing** (`Content-Security-Policy`, not Report-Only) —
  validated against a real sign-in, `UserButton`, and a live synced write with zero violations, both
  under `vite dev` (matching `ALLOWED_ORIGINS`) and the built `vite preview` output.
  No `'unsafe-eval'` is needed: zod v4's `eval`-availability probe is disabled via
  `configZod({ jitless: true })` in [../../src/client/zodConfig.ts](../../src/client/zodConfig.ts),
  imported first in [../../src/client/main.tsx](../../src/client/main.tsx) so it runs before any
  other module's zod schemas get a chance to trigger the probe. `yarn check:csp` — a separate gate,
  run by CI and by `yarn deploy:spa`, not by `yarn build` — fails when the two drift apart, and also
  fails outright when the template is Report-Only unless `CSP_ALLOW_REPORT_ONLY=1` is set, so a
  debugging flip cannot quietly become permanent.
  - The template's `%FAPI_HOST%` — used in `script-src`/`connect-src`/`form-action` — resolves to the
    Clerk Frontend API host decoded from `VITE_CLERK_PUBLISHABLE_KEY`, so the production instance's
    host follows the key automatically. `csp/dev.headers` allows `*.clerk.accounts.dev` instead, so a
    local `.env` holding a `pk_live_…` key fails `yarn check:csp` — keep the dev instance's
    `pk_test_…` there.
  - A bare `vite build` skips the generator and produces **no** policy. `yarn build` runs both, and
    `yarn check:csp` fails on a `dist/` whose `_headers` is missing or still holds a `%TOKEN%`.
  - No `report-to`/`report-uri` is configured — a drifted or newly-broken directive surfaces only
    when a user hits the broken feature, not proactively. Accepted trade-off for a project this
    size; revisit if the sync Worker ever grows a reporting endpoint.
  - **Smoke-test sign-in on `<app-domain>`**, not on a `pages.dev` URL: the policy enforces from the
    first request, and only the custom domain can complete a Clerk production sign-in. If a host turns
    out wrong, both files can flip to `Content-Security-Policy-Report-Only` as a stopgap — which then
    needs `CSP_ALLOW_REPORT_ONLY=1` to get past `check:csp`, deliberately, until the revert lands.

## Worker + Durable Object → `wrangler deploy`

- Run `yarn sync:deploy` (`wrangler deploy`) to deploy on `*.workers.dev` — this avoids moving the
  DNS zone.
- Keep `wrangler.toml`'s migration on `new_sqlite_classes` (see
  [../../wrangler.toml](../../wrangler.toml)):
  ```toml
  [[migrations]]
  tag = "v1"
  new_sqlite_classes = ["ShoppingListDurableObject"]
  ```
  Never switch to `new_classes`: KV-backed DO namespaces can't be created on the Free plan, break
  the SQL persister, and aren't convertible after the fact.
- Set the Worker secrets with `wrangler secret put` — never in the SPA bundle (full `Env` shape in
  [../../src/server/env.ts](../../src/server/env.ts)):
  - `LIST_ID_SECRET` — HMAC key for `listId` derivation
  - `TICKET_SECRET` — HMAC key for signing/verifying the single-use WS ticket
  - `CLERK_SECRET_KEY` — server-side Clerk token verification
- `ALLOWED_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` name the app's own origin, so they are **not** in
  `wrangler.toml`; set each to `https://<app-domain>` with `wrangler secret put` (a comma-separated
  list if ever more than one). `wrangler dev` reads them from `.dev.vars` and the sync e2e tier passes
  `--var` ([../../playwright.config.sync.ts](../../playwright.config.sync.ts)), so localhost belongs in
  neither the secret nor the committed config.
  - A binding name cannot be both a plain var and a secret. If an earlier deploy set these as
    `[vars]`, `wrangler secret put` fails with "already in use" — deploy the var-free config first so
    the plain vars are dropped, then set the secrets. Sync is down for the gap between the two: with
    the binding absent the origin check throws instead of returning `403`, so `/ws-ticket` answers
    `500`.
  - Do **not** add the `*.pages.dev` origin: a Clerk production instance is bound to its own domain,
    so sign-in cannot complete on a `pages.dev` host and sync depends on a signed-in user. A
    `pages.dev` URL therefore runs the SPA local-only — useful for checking the build and the CSP,
    not auth or sync.
- Leave `DEV` unset in `wrangler.toml` (set it to `"true"` only in `vitest.config.ts` and local
  `.dev.vars`). **It must stay unset in production**: it gates `jurisdiction('eu')` pinning (see
  [../explanation/auth-and-sync.md](../explanation/auth-and-sync.md#eu-jurisdiction-pinning)), and
  leaking `"true"` into production would land data outside the EU.

## Custom subdomain

Point `<app-domain>` at Cloudflare while keeping the apex on GitHub Pages:

- Add `CNAME <app-domain> → <pages-domain>` (proxied), then add it as a custom domain on the Pages
  project.
- Leave the apex DNS zone where it is — a subdomain CNAME needs no zone transfer, so the apex and
  `www` stay on GitHub Pages.

## Clerk dashboard

- Create a **production** instance and add `https://<app-domain>` to its allowed origins/redirects.
  Its DNS records (`clerk`, `accounts`, and the mail/DKIM CNAMEs) must be **DNS-only**, never proxied —
  Clerk terminates TLS itself, and a proxied record blocks its certificate issuance.
- Add the Worker's origin to the `authorizedParties` used by `verifyToken` in `/ws-ticket`.

## Deploy-time EU-placement gate

`jurisdiction('eu')` throws under miniflare rather than being ignored, so the Worker calls it only
when `DEV` is unset (see
[../explanation/auth-and-sync.md](../explanation/auth-and-sync.md#eu-jurisdiction-pinning)). That
makes production the first place the `eu`-pinned path actually runs. Before calling a deploy done,
check both:

1. Confirm `DEV` is **not** set in the deployed Worker — `wrangler secret list` shows no `DEV`, and
   `wrangler.toml` never sets it.
2. Confirm the `eu` branch is the one running: with `DEV` unset, `resolveListStub` resolves every
   stub through `ns.jurisdiction('eu')`, and a Durable Object never changes location after creation.

Cloudflare exposes no dashboard readout, API, or analytics dimension for an existing object's
jurisdiction — the only direct signal is `ctx.id.jurisdiction`, readable **inside** the object. The
two checks above are therefore the evidence available without adding a debug endpoint.

## Env & secrets

| Var | Where | Notes |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Pages build env | client-side, public; also resolves the CSP's FAPI host |
| `VITE_SYNC_URL` | Pages build env | public; also resolves the CSP's sync host; unset → local-only, sync disabled |
| `LIST_ID_SECRET` | Worker secret | HMAC key for `listId` derivation; losing it orphans every existing list |
| `TICKET_SECRET` | Worker secret | HMAC key for WS tickets |
| `CLERK_SECRET_KEY` | Worker secret | server-side Clerk token verification |
| `ALLOWED_ORIGINS`, `CLERK_AUTHORIZED_PARTIES` | Worker secret | `https://<app-domain>`; kept out of `wrangler.toml` |
| `DEV` | `vitest.config.ts` / `.dev.vars` only | must be unset in production — gates `jurisdiction('eu')` pinning |

Keep `CLERK_SECRET_KEY` on the Worker only — it must never appear in the SPA env. Run
`yarn check:secrets` to grep `dist/` for secret values; it fails if any `VITE_*SECRET*` var is set.
CI runs it after the build ([../../.github/workflows/ci.yml](../../.github/workflows/ci.yml)).

## CI

`main` is protected: direct pushes are rejected, so changes land through a pull request whose
`verify`, `e2e` and `e2e-sync` checks pass, on a branch up to date with `main`. Merging is what pushes
`main` — and therefore what deploys. Force-pushes and deletions are refused, history stays linear, and
the rules apply to admins too, so a hotfix also goes through a PR.

[../../.github/workflows/ci.yml](../../.github/workflows/ci.yml) runs on push and PR:

- Every job starts from the shared
  [../../.github/actions/setup/action.yml](../../.github/actions/setup/action.yml) composite action:
  Node 22, corepack, and a `node_modules` cache keyed on `yarn.lock` — a hit skips
  `yarn install --immutable` outright. Both caches use exact-match keys with no `restore-keys`,
  because a partial hit is a tree that disagrees with the lockfile.
  - `node_modules` rather than Yarn's archive cache: caching the archives skips only Yarn's fetch
    step, leaving its resolution and link steps to run anyway — which together cost more than the
    fetch. The key covers `package.json` and `.yarnrc.yml` alongside `yarn.lock`, since skipping the
    install also skips `--immutable`'s drift guard, and `runner.arch` because the cached tree holds
    prebuilt native binaries.
  - The two e2e tiers pass `playwright: "true"`, adding a `~/.cache/ms-playwright` cache keyed on the
    installed `@playwright/test` version. A hit runs nothing further: `playwright install-deps` is
    apt, and apt costs more than the browser download it would replace, while the runner image
    already ships Chromium's libraries. The `needs-apt` input forces it back on if an image ever
    drops one.
  - Actions scopes a cache to the branch that wrote it plus that branch's base, so the first run on a
    new branch installs cold and populates its own entry — and only if that run is green, since the
    save step is skipped on failure. Timings settle from the second passing run on.
- **verify** — `lint` (oxlint, including type-aware rules via `oxlint-tsgolint`), `format:check`
  (oxfmt), `typecheck` (client, Worker, both e2e tiers), `test` (client + Worker), the build, the CSP
  gate, and the secret gate.
- **e2e** — the hermetic local-only Playwright tier (no secrets needed).
- **e2e-sync** — the sync Playwright tier; skips unless `CLERK_SECRET_KEY` is set as a repo secret
  (so it no-ops cleanly on forks). The publishable key is public and committed in `.env.e2e-sync`.
- **deploy** — pushes to `main` only, after all three of the above pass. Builds the SPA and re-runs
  the CSP and secret gates against *that* build (verify's runs on a placeholder key) before deploying
  anything, confirms all five Worker secrets exist, then deploys the Worker, then uploads `dist/` with
  `--branch main` so it lands as a production deployment. Finally it **verifies the live pair**: the
  app domain returns `200` with a `Content-Security-Policy` header, and the Worker answers `204` to
  the app origin and `403` to a bogus one. Skips unless `CLOUDFLARE_API_TOKEN` is set, so forks and
  PRs no-op — but fails fast if the token is set while `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SYNC_URL`
  or `APP_URL` isn't, since that combination would ship a local-only policy.
- Gating before either deploy keeps a bad commit out of production; only an infrastructure failure
  between the two deploys can still leave them out of step, and the verification step names which
  half. A workflow-level `concurrency` group runs one workflow per ref — cancelling a branch's
  predecessor, never `main`, so a deploy is never killed mid-flight — and the job additionally holds a
  `deploy-production` group.

### Repo secrets the deploy job needs

| Secret | Notes |
|---|---|
| `CLOUDFLARE_API_TOKEN` | scope it to Workers + Pages edit; also the job's on/off switch |
| `CLOUDFLARE_ACCOUNT_ID` | avoids depending on the token resolving to exactly one account |
| `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SYNC_URL` | public values, held as **secrets** so Actions masks them in the logs of a public repo — `wrangler` prints the deployed hosts otherwise |
| `APP_URL` | `https://<app-domain>`; the post-deploy verification's target |
| `PAGES_DOMAIN` | `<pages-domain>`; never read — declared only so Actions masks the `*.pages.dev` URL `wrangler pages deploy` prints |
| `CLERK_SECRET_KEY` | the dev instance's `sk_test_…`, gating the `e2e-sync` tier — must match the publishable key committed in `.env.e2e-sync` |
