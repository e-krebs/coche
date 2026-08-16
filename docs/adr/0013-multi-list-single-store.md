# 0013. Multiple lists in one store, one sync unit per user

## Status

Accepted. Supersedes no earlier ADR — 0003 and 0006 both describe the sync unit, which is still
exactly one per user.

## Context

The store has always carried a `lists` table and an `items.listId` foreign key, but has only ever
held one list's worth of data: every item gets the same constant `listId`, and nothing reads it.
Making lists first-class means deciding where a second list *lives* — in the same replica, or in one
of its own.

Two different things are called `listId`, and the decision only reads correctly once they're
separated:

- **`items.listId`** — a row id in the client's own `lists` table. Purely local, never sent
  anywhere, and the one that now varies.
- **The derived `listId`** — `HMAC(serverSecret, userId)`, computed by the Worker and used only to
  name the Durable Object and scope the WS ticket (see
  [../explanation/auth-and-sync.md#listid-derivation](../explanation/auth-and-sync.md#listid-derivation)).
  It names the **sync unit**: one replica, one IndexedDB database, one Durable Object per user.

[0003-do-per-listid.md](0003-do-per-listid.md) ("one owner per list") and
[0006-deterministic-hmac-listid.md](0006-deterministic-hmac-listid.md) ("one deterministic list per
user") both use `listId` in the second sense. Neither decision changes: there is still exactly one
sync unit per user, and it now carries every list that user owns.
[../reference/data-model.md](../reference/data-model.md) is canonical for the distinction.

## Decision

Multiple lists live in one store, keyed by the existing `items.listId`. `lists` rows become real and
gain a `position` cell; every item read and mutation carries a `listId` predicate. Switching lists
is a client-side filter — no request, no loading state, no store remount.

- **One store, not one per list.** Store-per-list (a Durable Object and an IndexedDB database each)
  was rejected: it re-keys the socket lifecycle in
  [../../src/client/store/sync.ts](../../src/client/store/sync.ts), weakens the single-database
  `deleteUserDatabase` guarantee that shared-device teardown rests on
  ([0005-offline-cached-identity.md](0005-offline-cached-identity.md)), and invents a "list not
  downloaded yet" state an offline-first app shouldn't have. It buys nothing a user can see at
  per-user scale. It is **not foreclosed**: item row ids are already global UUIDs, so moving one
  list's rows into their own store later is a pure row copy, not a re-key.
- **The default-list migration writes `createdAt` and nothing else — never `name`, never
  `position`.** Merges are per-cell LWW by HLC, so a fresh device writing either cell before its
  first sync stamps a *newer* timestamp than last week's rename or reorder on another device and
  silently reverts it. An absent cell competes with nothing. Reads fall back to the app title, so
  the upgrade is visually invisible: a list with no `name` renders "Coche". This mirrors
  `quantity`'s "absent cell = unset" ([../../src/client/store/schema.ts](../../src/client/store/schema.ts)).
- **The migration is gated on having synced at least once** — or on sync being disabled, where there
  is no replica to race. Ungated, a fresh device's empty IndexedDB resolves before the socket lands
  and the write resurrects a deleted default list on every new device, forever. Because a
  sync-enabled device that never reaches the network therefore never migrates, an empty roster
  renders a **virtual** default row instead: displayed, never written.
- **Lists are ordered by `(position, createdAt, id)`,** so rows with no `position` still order
  deterministically. The first drag backfills positions across the visible run rather than computing
  a key against an absent neighbour.
- **Delete is a hard delete of the list row and its items in one transaction,** behind a
  confirmation. Split across two transactions, a peer sees "list gone, items present" as settled
  state and resurrects the list. There is no list-level undo.
- **The last list can't be deleted,** and an empty roster re-runs the migration, so no zero-lists
  state is reachable: `/` always resolves and an unknown list id redirects to the first list.
- **An item whose `listId` names no `lists` row resurrects that row, nameless.** The alternative is
  an item that survives the merge but is invisible forever. Only *complete* rows count as orphans —
  a row missing cells is a partial resurrection, i.e. garbage, not a list.
- **The active list is URL state (`/lists/$listId`) plus a device-local last-used hint, not a synced
  value.** Which list you're looking at is a per-device view concern; syncing it would drag one
  device's navigation onto another. Same seam as the locale mirror in
  [../../src/client/i18n/localeStore.ts](../../src/client/i18n/localeStore.ts).
- **The list name is the header title and the picker trigger,** opening a bottom sheet forked from
  [../../src/client/components/LanguageDialog.tsx](../../src/client/components/LanguageDialog.tsx).
  The title band shrinks on scroll instead of collapsing to nothing, so the trigger stays reachable
  at any offset — the cost is a taller scrolled header. Alternatives rejected: **chips** as a third
  header band (permanent sticky chrome, and the active chip scrolls out of reach past ~6 lists); a
  **`/lists` roster screen** you drill into (introduces the app's first navigational chrome for a
  filter that costs nothing); **swipeable tabs** (pane-swipe is the same finger, direction and
  element as swipe-to-delete — shippable only by deleting swipe-to-delete); **all lists as stacked
  folds** on one scroll (the single add field has no unambiguous target list); a **left drawer**
  (dominated by the title trigger — same reachability defect, worse thumb reach); and switching
  inside the Clerk **`UserButton`** menu (account territory, and a hidden trigger for a daily
  action). Only the title trigger's chrome cost is O(1) in the number of lists.

## Consequences

- **The server, the sync protocol and the shared client↔server contract are untouched.** Lists are a
  client-side concern inside an existing sync unit; the Worker, the Durable Object and the WS ticket
  flow don't learn the concept, and per-test Clerk-user isolation in the sync e2e tier still holds.
- **Nameless rows are indistinguishable from each other.** The migrated default and any resurrected
  orphan both render the app title until renamed. Accepted quirk, not a bug — the alternative is
  writing a `name` cell, which is exactly the LWW hazard the migration exists to avoid.
- **Resurrection can ping-pong** between a device deleting a list and a peer re-adding to it. The
  sweep runs as a live store subscription rather than a boot one-shot (a merge applies as one
  transaction and fires listeners once, on fully-applied state), so the exchange is bounded rather
  than endless, and the app can't get stuck at zero lists.
- **The last-list rule is client-side only.** Two devices deleting different lists concurrently can
  still reach an empty roster; re-running the migration on empty is what makes that self-heal.
- **`position` is only comparable within one list, in both tables.** A global comparison picks
  foreign neighbours and lands a dragged row at an arbitrary index once the view re-filters, so
  every reorder, append and bulk mutation scopes to the current list.
- **The identity gate, `StoreProvider` and the single `useSync` call move into a pathless layout
  route** above the `$listId` boundary. Below it, every list switch would remount them and flash an
  empty store.
- **Per-device view state is now per-list.** Scroll offset is keyed by list id and restores on
  reload only; switching resets the query, any open editor, the checked fold and the scroll offset.
