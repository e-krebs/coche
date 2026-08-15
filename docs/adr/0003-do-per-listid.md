# 0003. One Durable Object per `listId`

## Status

Accepted

## Context

The server-side source of truth for a list needs a single point of serialization for merges and
persistence, pinned to the EU for data residency. Cloudflare Durable Objects provide
single-instance-per-id semantics and jurisdiction pinning, which map directly onto "one durable,
EU-resident owner per list."

## Decision

One Durable Object instance per `listId`, class `ShoppingListDurableObject extends
WsServerDurableObject` ([../../src/server/durable-object.ts](../../src/server/durable-object.ts)),
resolved in production via `env.SHOPPING_LIST.jurisdiction('eu').get(idFromName(listId))`,
persisting through `createDurableObjectSqlStoragePersister`. The DO is reached only through a
hand-rolled forward in the Worker's `fetch` handler (`resolveListStub` in
[../../src/server/index.ts](../../src/server/index.ts)) — not TinyBase's bundled
`getWsServerDurableObjectFetch` helper, which does its own `idFromName` with no jurisdiction
parameter and so can't pin `eu`.

## Consequences

- The hand-rolled EU forward is exercised end-to-end by the Worker test suite (ticket burn → strip →
  forward → 101 upgrade): the DO syncs correctly when reached via the manually-resolved stub.
- The migration in `wrangler.toml` is `new_sqlite_classes`, not `new_classes` — see
  [../how-to/deploy.md](../how-to/deploy.md).
- `jurisdiction('eu')` throws under workerd/miniflare (`"Jurisdiction restrictions are not
  implemented in workerd."`) rather than being ignored, so `resolveListStub` calls it only when the
  `DEV` env var is unset (production); local dev and tests use the plain namespace. The forward
  mechanics are test-covered, but the `eu`-pinned branch is only genuinely exercised once deployed —
  see [../explanation/auth-and-sync.md#eu-jurisdiction-pinning](../explanation/auth-and-sync.md#eu-jurisdiction-pinning) and
  the [deploy-time gate](../how-to/deploy.md#deploy-time-eu-placement-gate).
- Per-`listId` DOs mean a future "shared list" feature needs no re-keying: the DO identity
  (`listId`) stays stable; only the authorization layer above it grows a membership concept. See
  [0006-deterministic-hmac-listid.md](0006-deterministic-hmac-listid.md).
- Ticket burn-state (the `used_tickets` SQL table, written in the DO's own `fetch` override) is
  colocated with the data it protects, EU-resident. A DO alarm bounds idle socket lifetime
  (idle-only; no absolute re-auth cap yet) — see
  [0010-do-idle-socket-alarm.md](0010-do-idle-socket-alarm.md) and
  [../explanation/auth-and-sync.md#limitations](../explanation/auth-and-sync.md#limitations).
