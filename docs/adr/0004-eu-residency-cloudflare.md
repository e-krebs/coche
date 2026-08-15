# 0004. EU residency via Cloudflare Durable Object jurisdiction

## Status

Accepted

## Context

Data residency in the EU is a hard constraint. GitHub Pages (host for the main domain) can't run a
sync server at all, so some other host is needed regardless; Cloudflare offers Workers + Durable
Objects with a jurisdiction mechanism that pins a DO's storage to the EU without standing up
dedicated EU infrastructure.

## Decision

Pin every `ShoppingListDurableObject` to `jurisdiction('eu')` **in production**. This is the
mechanism for "data at rest in the EU," resolved once per request in the Worker (`resolveListStub`
in [../../src/server/index.ts](../../src/server/index.ts)) and reused for the forward,
never re-resolved on a second path.

## Consequences

- This is data-**at-rest** residency only. It does not mean data never leaves the EU, and it is not
  EU sovereignty. Full caveats in
  [../explanation/architecture.md](../explanation/architecture.md#eu-residency): transit through
  non-EU edge PoPs when a user travels, DO `id`s logged outside the jurisdiction, full local
  replicas on client devices wherever they physically are, Clerk identity data in the US, and DO
  SQLite being encrypted at rest (a security property, not a residency one).
- Per current Cloudflare docs, `jurisdiction('eu')` needs no paid entitlement (distinct from the
  Enterprise Data Localization Suite); this is unverified against the deployment account until
  deploy.
- True EU sovereignty (control over the operator, immunity to non-EU legal process) would require
  an EU-domiciled provider (e.g. OVH, Scaleway) instead of Cloudflare — explicitly out of scope, so
  the residency claim isn't overstated later.
- `jurisdiction('eu')` throws under local `wrangler dev`/miniflare (`"Jurisdiction restrictions are
  not implemented in workerd."`) rather than being ignored; unhandled it would break every local run
  and Worker test. So `resolveListStub` calls `jurisdiction('eu')` only when `DEV` is unset;
  production always pins `eu` and never falls back to the plain namespace (fail-loud for residency —
  a connection failure is preferred over storing data outside the EU). `DEV` must stay unset in
  production. Placement is only verifiable in production, hence the deploy-time gate in
  [../how-to/deploy.md](../how-to/deploy.md#deploy-time-eu-placement-gate). See
  [../explanation/auth-and-sync.md#eu-jurisdiction-pinning](../explanation/auth-and-sync.md#eu-jurisdiction-pinning).
