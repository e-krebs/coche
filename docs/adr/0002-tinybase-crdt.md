# 0002. TinyBase `MergeableStore` as the local-first CRDT engine

## Status

Accepted

## Context

The core requirement is full local-first behavior: offline read+write on any device, with changes
auto-merging across a user's devices without a central lock or manual conflict resolution. That
needs a CRDT-backed store on the client that persists locally (IndexedDB) and synchronizes over a
network transport when available.

## Decision

Use TinyBase's `MergeableStore`, pinned to `tinybase@^9`. It provides a schema-typed store with
per-cell CRDT merge (HLC-timestamped, conflict-free), an IndexedDB persister for offline storage,
and a WS synchronizer for network sync — covering the whole local-first stack with one dependency
rather than assembling CRDT + persistence + transport separately.

## Consequences

- Merge is per-cell latest-write-wins, not per-row or app-defined — with concrete documented
  behavior (delete-vs-edit resurrection, checked flip-back, quantity LWW). See
  [../explanation/auth-and-sync.md](../explanation/auth-and-sync.md#crdt-merge-semantics).
- [../../src/client/store/schema.ts](../../src/client/store/schema.ts) is the single source of
  truth for stored data shape.
- The `tinybase@^9` APIs used: `WsServerDurableObject`, `createDurableObjectSqlStoragePersister`,
  `createWsSynchronizer`, `createMergeableStore` (client via `tinybase/with-schemas`, server via
  `tinybase/mergeable-store`), and `createCustomPersister` — the built-in `createIndexedDbPersister`
  is StoreOnly, so the IndexedDB persister is hand-rolled on `createCustomPersister`
  ([../../src/client/store/persister.ts](../../src/client/store/persister.ts)). The typed
  `with-schemas` `ui-react` namespace-cast pattern (`UiReact as UiReact.WithSchemas<Schemas>`) is
  used in
  [../../src/client/store/store.ts](../../src/client/store/store.ts).
- Ties the server design to TinyBase's own DO helpers/synchronizer, which drives
  [0003](0003-do-per-listid.md)'s hand-rolled EU forward (the bundled helper can't pin
  jurisdiction).
- **`addRow` ids collide across offline replicas.** `addRow` mints store-local sequential ids
  (`"0"`, `"1"`, …) — two devices each adding their own first item offline both mint id `"0"`. On
  merge, the per-cell CRDT treats them as *one* row and merges their cells, collapsing two distinct
  items into one (real data loss, not a cosmetic glitch).
  [../../src/client/store/store.ts](../../src/client/store/store.ts)'s `newItemId()` returns `crypto.randomUUID()`
  instead, and items are created via `store.setRow(newItemId(), …)`, never `addRow`, so ids never
  collide regardless of how long two replicas stay offline. This is why sort order is the tuple
  `(position, itemId)` rather than any store-assigned ordering — the row id (globally unique)
  doubles as the item's id; there's no separate `id` schema cell. See
  [../explanation/auth-and-sync.md#crdt-merge-semantics](../explanation/auth-and-sync.md#crdt-merge-semantics) and
  [../reference/data-model.md](../reference/data-model.md).
