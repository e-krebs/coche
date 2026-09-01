# Auth & sync

How identity is derived, how a device authenticates a WebSocket, how the Worker forwards to the EU
Durable Object, how offline identity works, and the CRDT merge semantics. The server side
(`/ws-ticket`, the WS handler, the Durable Object) lives under
[../../src/server/](../../src/server/) and is covered by the Worker test suite in
`src/server/__tests__/`.

> New to an acronym here? See the [glossary](../reference/glossary.md).

## `listId` derivation

`listId = HMAC(serverSecret, userId)` — server-derived, deterministic, not stored, not guessable.
There is no write to Clerk `publicMetadata`, no provisioning step, and no membership claim:
authorization is "the ticket was minted for *your* derived `listId`". A stored membership layer is
added only when shared lists land, without re-keying the Durable Object. See
[../adr/0006-deterministic-hmac-listid.md](../adr/0006-deterministic-hmac-listid.md).

This derived `listId` names the **sync unit** — one Durable Object and one local replica per user,
carrying *every* list that user owns — and not a list in the UI: the lists a user switches between
are rows in the local `lists` table, referenced by `items.listId`, a client-side value the server
never sees ([../reference/data-model.md](../reference/data-model.md),
[../adr/0013-multi-list-single-store.md](../adr/0013-multi-list-single-store.md)).

## `POST /ws-ticket` — one-time ticket flow

1. The client sends its Clerk JWT in the `Authorization` header (`Bearer <clerkJWT>`).
2. The Worker verifies the token with `verifyToken` against `authorizedParties` (the Pages
   origin(s)) plus the issuer, fail-closed on any mismatch.
3. It computes `listId = HMAC(serverSecret, sub)`.
4. It mints a signed, short-TTL (~30s), single-use ticket bound to that `listId`. The ticket's `jti`
   is burned in the target Durable Object (EU-pinned in production), so burn-state stays
   EU-resident.
5. It responds `{ listId, ticket }`.
6. CORS is an exact-match allowlist — the Worker never reflects an arbitrary `Origin`.

Keeping the live token and PII out of the ticket and the WS URL keeps that material out of
Cloudflare's request logs, which are processed outside the `eu` jurisdiction.

> `@clerk/backend@3`'s `verifyToken` resolves to the JWT claims **directly** and **throws** on an
> invalid token, despite its `{ data, errors }` return type.
> [../../src/server/clerk.ts](../../src/server/clerk.ts) reads `sub` inside a `try/catch` and
> handles both shapes; `src/server/__tests__/clerk.test.ts` guards it. Getting this wrong 401s every
> real token.

## WS connection & upgrade auth

The client connects `wss://…/list/<listId>?ticket=<t>`. Auth happens on `fetch`, before the upgrade
completes:

1. Validate the ticket in the Worker: `listId` match, unexpired. The **burn** (unused check +
   mark-used) happens in the target Durable Object (see [Durable Object](#durable-object)).
2. Check the `Origin` against an exact-match allowlist, fail-closed (localhost only behind a dev
   flag). The ticket — not `Origin` — is the primary defense against cross-site WebSocket hijacking;
   `Origin` is secondary.
3. Strip the ticket from the URL.
4. Forward via `resolveListStub(env, listId).fetch(strippedReq)`
   ([../../src/server/index.ts](../../src/server/index.ts)) — resolve the stub once and reuse it.

The forward is hand-rolled because TinyBase's `getWsServerDurableObjectFetch` helper takes only a
namespace string, does its own `idFromName`, and has no jurisdiction parameter, so it can't pin
`eu`. The Worker tests exercise the full path (ticket burn → strip → forward → 101 upgrade).

### EU jurisdiction pinning

`env.SHOPPING_LIST.jurisdiction('eu')` throws `"Jurisdiction restrictions are not implemented in
workerd."` under miniflare (local `wrangler dev` and the Worker tests alike) — it is not silently
ignored. Unhandled, it would break local dev and every Worker test.

`resolveListStub` gates on a `DEV` env var:

```ts
function resolveListStub(env: Env, listId: string): DurableObjectStub {
  const ns = env.SHOPPING_LIST;
  if (env.DEV === "true") return ns.get(ns.idFromName(listId));
  const eu = ns.jurisdiction("eu");
  return eu.get(eu.idFromName(listId));
}
```

- **Production (`DEV` unset):** always pins `jurisdiction('eu')`, never falls back to the plain
  namespace. If pinning ever failed, breaking the connection is preferred over storing data outside
  the EU — fail-loud for residency.
- **Local dev / tests (`DEV=true`):** uses the plain namespace, all workerd supports. Set in
  `vitest.config.ts` and the local `.dev.vars`.

`DEV` must stay unset in production. Because the pinned branch only runs once deployed, the
[deploy-time EU-placement gate](../how-to/deploy.md#deploy-time-eu-placement-gate) verifies actual
`eu` placement after deploy.

## Durable Object

`ShoppingListDurableObject extends WsServerDurableObject`
([../../src/server/durable-object.ts](../../src/server/durable-object.ts)), one instance per
`listId`, pinned to `jurisdiction('eu')` in production. It persists via
`createDurableObjectSqlStoragePersister` and is the server source of truth. Its `fetch` override
burns the ticket's `jti` into a `used_tickets` SQL table before delegating to `super.fetch`, so
burn-state is colocated with the data it protects, EU-resident.

## Reconnect / token handling

[../../src/client/store/sync.ts](../../src/client/store/sync.ts) (`useSync`) owns the socket
lifecycle rather than trusting TinyBase's built-in reconnect (which would replay a stale
URL/ticket). Every reconnect, including the first, calls `/ws-ticket` with a fresh Clerk JWT
(`getToken()`) to mint a fresh single-use ticket, then builds a new `WebSocket` +
`createWsSynchronizer`. A ticket is never replayed past its first connection attempt.

Every path into `offline` arms the next attempt, so the retry loop cannot die: the socket's `close`
event, a failed attempt, the browser `offline` event, and `connect()`'s own `navigator.onLine` check
all schedule one. The two kinds of wait are priced differently, because they cost different things.
A failed attempt reaches the Worker and mints a ticket, so consecutive failures back off
(`reconnectDelay` doubles `RECONNECT_DELAY_MS` = 3s up to a 30s cap, reset once a connection syncs).
Waiting for the network to return only re-reads `navigator.onLine`, so it polls flat at
`OFFLINE_POLL_MS` = 3s.

Recovery therefore doesn't hang on a single `online` event. That event still short-circuits the wait
(immediate, but skipped when a live socket is already open, so a spurious `online` doesn't tear down
a healthy connection) — it is an optimisation, not the mechanism. The distinction matters because a
socket whose network vanishes may never fire `close` at all: it lingers reading `OPEN`, which is
exactly the state that makes the `online` handler skip. The `offline` event's poll is then the only
thing still trying, and its `connect()` destroys the stale socket before re-ticketing. The price is
that a blip which leaves the socket genuinely alive still re-tickets once, three seconds later — a
network change that keeps a socket usable is rare enough to pay for zombie recovery.

A hidden tab mints no tickets: while `document.hidden`, an attempt is skipped and simply re-armed,
so the loop survives being backgrounded instead of relying on `visibilitychange` firing (that
listener only shortens the wait when the reader comes back). The check sits ahead of the teardown
`connect()` starts with, so a tick while hidden can never close a live socket, and it exempts each
effect run's first attempt — a tab that cold-boots in the background, or whose Clerk state resolves
while it sits there, still syncs.

Sync status:

| Status | Meaning |
|---|---|
| `disabled` | No `VITE_SYNC_URL` — local-only, sync never attempted |
| `offline` | `navigator.onLine` is false, or the last connect attempt failed |
| `connecting` | Fetching a ticket / opening the socket, or waiting out a retry (up to 30s) |
| `synced` | `WsSynchronizer.startSync()` resolved on an open socket |
| `signin-required` | `/ws-ticket` returned 401/403, or no Clerk token is available |

Two surfaces carry it, split by whether the reader has anything to do about it.

[../../src/client/components/SyncStatus.tsx](../../src/client/components/SyncStatus.tsx) is a badge
on the account avatar: a coloured dot for every status, plus the label as `sr-only` text and as an
out-of-flow pill on hover or keyboard focus. Neither the badge nor the pill occupies layout width —
an in-flow label resizes on every reconnect, which drags the centred list title sideways. `disabled`
draws as an opaque ring rather than a transparent outline, so it stays legible over an avatar and
stays distinguishable from `offline`'s solid grey by shape, not tone. `connecting` pulses (scale
only, no opacity) since a corner badge that translates reads as coming loose; under
`prefers-reduced-motion` it freezes mid-pulse rather than still, so its smaller size — not its hue
alone — is what separates it from `synced`. There is deliberately no live region: the status flips on
every socket reconnect, so announcing it would be chatter.

[../../src/client/components/SyncNotice.tsx](../../src/client/components/SyncNotice.tsx) names the
two states that need a response — `offline` and `signin-required` — in a strip inside the sticky
header, with a link to `/sign-in` when signed out. It renders in its own row below the search band,
outside the band that collapses on scroll, so it survives the collapse and never resizes a header
column. A 10px badge is the wrong instrument for something to act on, and hover is no channel on a
touch device. Appearing and disappearing does change the header's height, pushing the list down — an
accepted cost, since a state the reader has to act on earns the interruption, and the alternative is
reserving a row that is empty almost always.

## Offline identity

A cached `{userId}` in localStorage lets the app boot and work fully offline — the local store
renders independent of Clerk's readiness. The first-ever run still requires one online session
(nothing to cache yet). `clerk-js` is served same-origin from `/clerk-js/` — bundled from the
`@clerk/clerk-js` dependency at build and runtime-cached (StaleWhileRevalidate) by the service
worker — but session verification is impossible offline regardless, so the cached-identity gate,
not `clerk-js` caching, is what makes offline boot work. See
[../adr/0005-offline-cached-identity.md](../adr/0005-offline-cached-identity.md).

On Clerk init, if the confirmed `userId` differs from the cached one (or the user is signed out),
the app tears down the local store and cached identity *before* first render — the shared-device
safety mechanism. The cached store renders only when offline **and** the cached identity matches the
last-confirmed user.

The gate, `StoreProvider` and the single `useSync` call all mount in a pathless layout route above
the per-list routes. Switching lists only changes the URL below that boundary, so it can never
remount the gate or reopen the store — which would flash an empty list on every switch.

## CRDT merge semantics

`MergeableStore` merges per-cell by HLC (hybrid logical clock) timestamp: conflict-free, latest
write wins **per cell**. An HLC advances with the wall clock as well as with observed writes, so a
device can out-stamp a peer's edit it has never seen — which is why the rules below are about what
each write *touches*, not about who saw whom. The first three are asserted by
[merge.test.ts](../../src/client/store/__tests__/merge.test.ts); the list rules are asserted
indirectly, by [lists.test.tsx](../../src/client/store/__tests__/lists.test.tsx) pinning exactly
which cells each operation writes:

- **Delete-vs-concurrent-edit resurrection.** If one device deletes a row while another edits a cell
  on that row, the merge can partially resurrect it. Modelling delete as an explicit tombstone cell
  would avoid this if ever needed.
- **Checked flips back.** Two devices toggling `checked` concurrently settle on the later HLC, so an
  item can un-check itself from the user's point of view.
- **Quantity is LWW, not additive.** Two offline increments settle at the higher single value, not
  the sum — one write wins, nothing sums.
- **A nameless list row can't revert a rename.** The default-list migration writes `createdAt` and
  nothing else. A device migrating today after another device renamed that list last week writes no
  `name` cell, so it contributes nothing to compete with — and the rename stands. Had it written a
  name, its fresher HLC would win per-cell and the rename would silently vanish; that is precisely
  why the row is nameless, and why the migration leaves `position` absent too, against a reorder.
  The same rule shapes the first list drag: it stamps a position on the dragged row and on the rows
  that have none, and on **nothing else** — rewriting a settled position would revert a peer's
  reorder without ever having observed it.
- **"Synced" is not evidence of having received anything.** TinyBase resolves `startSync()` even when
  the initial content exchange times out, so a device can reach `synced` holding an empty replica.
  The migration therefore also requires items to exist: without them there is nothing to orphan, the
  virtual default row already stands in, and writing would resurrect a list a peer deleted on
  purpose — on every device, permanently.
- **Deleting a list vs. a concurrent add resurrects the list, nameless.** One device deletes a list
  while another, offline, adds an item to it. The item survives the merge carrying a `listId` that
  names no row, which would leave it invisible forever, so the client resurrects the missing `lists`
  row instead — with no `name`, since there is none to recover. The list reappears rather than the
  item disappearing, and it renders as the app title until renamed.

### Item ids are globally unique, not TinyBase row ids

`addRow` mints store-local sequential ids (`"0"`, `"1"`, …). Two offline replicas each adding their
first item both mint id `"0"`; on merge the per-cell CRDT treats them as the *same* row and merges
their cells, collapsing two distinct items into one — silent data loss.
[../../src/client/store/store.ts](../../src/client/store/store.ts) avoids this: `newItemId()`
returns `crypto.randomUUID()`, and rows are always created with `store.setRow(id, …)`, never
`addRow`. This also lets sort order be the tuple `(position, itemId)`: the row id works as a
tiebreaker precisely because it's globally unique. There is no separate `id` cell — the row id
doubles as the item's id.

Reorder ordering is a fractional index with the same `(position, itemId)` tiebreaker, which
converges deterministically even under concurrent-offline duplicate keys. Positions are only
comparable **within one list** — items against the items sharing their `listId`, lists against the
same user's other lists — so every reorder, append and bulk mutation computes its neighbours from
that one list's rows. Compared globally, a dragged row's neighbours can belong to another list
entirely and the drop lands at an arbitrary index once the view re-filters. See
[../adr/0007-fractional-index-reorder.md](../adr/0007-fractional-index-reorder.md).

### Local durability preserves CRDT metadata

The IndexedDB persister stores the full mergeable content — HLCs and tombstones, not just tabular
data ([../../src/client/store/persister.ts](../../src/client/store/persister.ts)). This is
load-bearing: TinyBase's built-in `createIndexedDbPersister` is StoreOnly, and with it a reload
re-stamps every cell "now"
and drops tombstones, so an offline edit → reload → sync would clobber a newer remote edit and
resurrect a deleted item. Two unit tests assert an HLC and a tombstone survive save → reload → merge
([../../src/client/store/__tests__/store.test.ts](../../src/client/store/__tests__/store.test.ts)).

## Limitations

- **No absolute socket re-auth cap.** A DO alarm bounds *idle* sockets: the Durable Object stores a
  per-socket `lastSeen` (stamped at connect, refreshed on each inbound message, hibernation-safe via
  `serializeAttachment`) and a coarse ~30-minute alarm closes any socket idle past the threshold
  with a normal close; the client reconnects with a fresh single-use ticket, so the drop is
  seamless. What's still absent is an *absolute*-lifetime cap that would force periodic re-auth
  regardless of activity — the revocation mechanism sharing will need. Auth happens once at WS
  upgrade, so an actively-used socket stays authorized on its original ticket, and revocation is
  only as fast as the next reconnect or the client next coming online. Sharing will need a stored
  membership roster *and* that absolute cap before revocation is meaningful. See
  [../adr/0010-do-idle-socket-alarm.md](../adr/0010-do-idle-socket-alarm.md).
- **Cross-tab sign-out doesn't actively tear down an offline peer tab.** Sign-out broadcasts to
  peers, but a peer only clears its identity cache; an *offline* peer can keep re-persisting the
  replica until it comes online, at which point it self-heals. A full fix means the broadcast
  actively deleting/navigating without wiping a still-valid session.
- **Local-first can't retract already-synced replicas.** Once a device has synced, removing a user's
  access doesn't delete their local copy — a property of local-first systems, relevant before
  sharing ships.
- **"The last list can't be deleted" is a client-side rule, not an invariant of the merge.** Each
  device refuses to delete its last remaining list, but two devices deleting two different lists
  concurrently still settle on an empty roster. It self-heals: an empty roster renders a virtual
  default list and re-runs the default-list migration, so no zero-lists state is ever reachable in
  the UI. Enforcing it in the CRDT would mean modelling the roster as something other than
  independent rows.
- **A resurrected list is indistinguishable from the default until renamed.** Both have no `name`
  cell, so both render as the app title. The alternative — writing a name when resurrecting — is the
  LWW hazard the nameless row exists to avoid, so this is an accepted quirk rather than a bug: a
  user who deleted a list and gets it back sees a second "Coche" and renames it.
- **A `/lists/<id>` link opened before the first sync is rewritten, not held.** `StoreProvider` gates
  on the local IndexedDB load only, so on a device with nothing cached the roster is just the virtual
  default list and an unknown id falls back to it — replacing the URL, so the link is gone from
  history. Narrow by construction (lists are per-user, so a link is only ever for the same user's
  other device, and a warm device resolves it), and the fix would mean holding the route in a pending
  state until sync lands — a loading state an offline-first app shouldn't have.
