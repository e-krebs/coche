# 0011. Deployment identifiers stay out of the repo

## Status

Accepted. Supersedes no earlier ADR: the previous "two committed, host-pinned CSP files" arrangement
was only ever described in [../how-to/deploy.md](../how-to/deploy.md), never decided in an ADR. The
dev policy ([../../csp/dev.headers](../../csp/dev.headers)) is unchanged and still committed.

## Context

The production Content-Security-Policy has to name concrete hosts — the Clerk Frontend API host and
the sync Worker host — because CSP has no notion of "whatever this deployment's backend is". The same
is true of the Worker's `ALLOWED_ORIGINS` / `CLERK_AUTHORIZED_PARTIES`, which exact-match the app's
own origin.

Committing those values pins the repository to one operator's domain, account subdomain, and Clerk
instance. For a public repository that publishes the owner's personal domain and account identifiers
to every reader and scraper, and a fork inherits values it cannot use.

The exposure is asymmetric rather than secret: the served response header, DNS, and the JS bundle all
reveal the same hosts to anyone who visits the site. What the repository controls is whether a reader
who never visits learns them, and whether a fork starts out misconfigured.

## Decision

Deployment-specific identifiers live in the deployment, never in tracked files.

- [../../csp/prod.headers.template](../../csp/prod.headers.template) is committed with `%FAPI_HOST%`
  and `%SYNC_HOST%` placeholders. [../../scripts/gen-headers.mjs](../../scripts/gen-headers.mjs)
  resolves them into `dist/_headers` after the bundle is written, so `yarn build` is
  `vite build && node scripts/gen-headers.mjs`.
- The Frontend API host is derived from `VITE_CLERK_PUBLISHABLE_KEY`, which encodes it, rather than
  configured separately — one value cannot drift from the other. The sync host comes from
  `VITE_SYNC_URL`; with it unset the Worker entries are dropped from `connect-src` entirely, matching
  the local-only build that `.env.sample` describes.
- `ALLOWED_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` are absent from
  [../../wrangler.toml](../../wrangler.toml) `[vars]` and set as Worker secrets in production.
  `wrangler dev` supplies them from `.dev.vars`; the sync e2e tier passes `--var`
  ([../../playwright.config.sync.ts](../../playwright.config.sync.ts)).
- `yarn check:csp` gains invariants for the split: the template must still contain both placeholders
  and its `/*` path rule, both policies must carry the same directive set, and a built `dist/` must
  contain a `dist/_headers` with no leftover tokens.

## Consequences

- A reader of the repository learns no **production** hostname, account subdomain, or Clerk instance.
  Two categories stay tracked on purpose: the Cloudflare resource names (`name = "coche-sync"`,
  `--project-name coche`), which a deploy has to address, and the Clerk **development** instance in
  [../../.env.e2e-sync](../../.env.e2e-sync), whose publishable key the sync e2e tier needs committed.
  A fork sets its own build env and Worker secrets, and edits those two resource names.
- A bare `vite build` produces **no** policy instead of a wrong one. This is the significant new
  failure mode, and it is why the generator is part of `build` and why `check:csp` fails on a `dist/`
  without `_headers`; CI runs both after building.
- The production policy is no longer readable from the repository. `csp/dev.headers` remains the
  reviewable copy of the same directive set, and `check:csp` enforces that the two agree structurally,
  share a header name, and that the template is enforcing unless `CSP_ALLOW_REPORT_ONLY=1` says
  otherwise.
- The Worker's allowed origins are no longer visible in version control. `wrangler secret list` shows
  the names, and a wrong value fails closed — the Worker rejects the origin with `403`. An *absent*
  one does not fail closed as gracefully: the origin check throws and `/ws-ticket` answers `500`,
  which is why the deploy job verifies the secrets exist before shipping.
