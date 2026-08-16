# Data model

Thin by design. The single source of truth for stored data is
[../../src/client/store/schema.ts](../../src/client/store/schema.ts) (TinyBase `TABLES_SCHEMA`);
this doc only records the entities and invariants that aren't obvious from the schema.

## Entities

**`lists`** (row ids vary; `DEFAULT_LIST_ID`, the constant `"list"`, is the id of the list every
account starts with)
- `name` — optional and absent by default; a row with no `name` renders the app title ("Coche")
- `position` — string, fractional index; set when a list is created, absent on the default and on
  resurrected rows until a reorder backfills it
- `createdAt`

**`items`** (the row id doubles as the item's globally-unique id — no separate `id` cell)
- `listId` — local foreign key into `lists`
- `name`
- `quantity` — optional number
- `checked` — boolean, default `false`
- `position` — string, fractional index
- `createdAt`

Two unrelated things are called "list id", and both now vary at runtime — conflating them costs real
bugs:

- **`items.listId`** — a row id in the local `lists` table. Client-side only: never sent to the
  server, never part of a ticket or a socket URL. It selects which list an item belongs to, and
  every read and mutation filters on it; items whose `listId` isn't the active list aren't rendered.
- **The derived `listId`** — `HMAC(serverSecret, userId)`, computed server-side on each request (see
  [auth-and-sync.md](../explanation/auth-and-sync.md#listid-derivation)). It names the **sync unit**:
  the Durable Object, the scope of the WS ticket, and the single IndexedDB replica
  `shopping-<userId>`. It is never stored in the local store; the client only needs it for the
  handshake.

One derived `listId` per user, holding every one of that user's `items.listId` values. See
[../adr/0013-multi-list-single-store.md](../adr/0013-multi-list-single-store.md).

## Invariants

- **Item ids are globally unique (`crypto.randomUUID()`), not TinyBase's auto-assigned row ids.**
  Auto-assigned ids collide across offline replicas and cause silent data loss; rows are created
  with `store.setRow(newItemId(), …)`, never `addRow`. This is also why sort order is `(position,
  itemId)`. Full explanation:
  [auth-and-sync.md](../explanation/auth-and-sync.md#item-ids-are-globally-unique-not-tinybase-row-ids).
- **`quantity` is optional and absent by default.** No quantity control shows until the user adds
  one; the schema has no `default`, so the cell is genuinely absent (not `0`/`null`) when unset. It
  is never a sort key — items don't reorder when quantity changes.
- **`position` is the reorder sort key** (fractional-index string via `generateKeyBetween`). Items
  sort by the tuple `(position, itemId)` and lists by `(position, createdAt, id)`, so concurrent
  duplicate keys — and lists with no `position` yet — still converge. See
  [../adr/0007-fractional-index-reorder.md](../adr/0007-fractional-index-reorder.md).
- **`position` is comparable only within one list, in both tables.** Item positions are meaningful
  against the other items of the same `listId`, list positions against the same user's other lists.
  Every mutation therefore carries a `listId` predicate: a key minted from a foreign neighbour lands
  inside another list's range, where that list's next drag can collide with it.
- **The roster is never empty.** A virtual default list stands in whenever `lists` has no row for it
  and either the table is empty or items still reference it. Repair — the default-list migration and
  the orphan sweep — waits for the first sync, so the virtual row is what the user sees until then.
  `/` always resolves, and an unknown list id redirects to the first list.
- **The last remaining list can't be deleted.** The rule is client-side, so concurrent deletes on
  two devices can still empty the roster; the invariant above is what heals it. See
  [auth-and-sync.md](../explanation/auth-and-sync.md#limitations).
- **Deleting a list is a hard delete of the list row and its items in one transaction.** No
  tombstone cell, no list-level undo. Split in two, a peer reads "list gone, items present" as
  settled state and resurrects the list.
- **An absent `lists.name` renders the app title, and the default-list migration never writes that
  cell.** Per-cell LWW means a name written on a fresh device would outrank an older rename made
  elsewhere. Same for `position` against an older reorder — the migration writes `createdAt` only. A
  *user's* rename is the exception and may create the row: it is intent, and should win LWW. See
  [../adr/0013-multi-list-single-store.md](../adr/0013-multi-list-single-store.md).
- **An `items.listId` naming no `lists` row resurrects that row, nameless.** Otherwise the item
  survives the merge and is invisible forever. Only complete `items` rows count as orphans — a
  partial resurrection has no `listId`, and `setRow("lists", undefined, …)` would mint a real list
  keyed `"undefined"`.
- **The model is list-centric** (`items` reference `listId`), so shared lists remain addable without
  a rewrite: the sync unit is per user today, and nothing about the row shape assumes that.

## UI

[../../src/client/components/ShoppingList/index.tsx](../../src/client/components/ShoppingList/index.tsx)
presents the active list's `items` as **two sections**, not one with strikethrough rows: unchecked
(drag-reorderable) and checked (below, folded behind a collapsed "Checked (N)" disclosure via
[CheckedSection.tsx](../../src/client/components/ShoppingList/CheckedSection.tsx), with its own
"Clear checked" action that deletes every checked row in one transaction). Each row has inline
rename (tap the name), an optional quantity stepper (revealed by a `#` "Add quantity" button, hidden
until added), and delete. A search box filters the combined set to a flat, non-draggable list — the
"find an item and flip its checked state while shopping" flow, so you don't scroll a long list or
expand the checked section just to check something off. Search covers the active list only.

The header title is the active list's name and doubles as the picker trigger: it opens a bottom
sheet listing every list with its unchecked count, and an edit mode for creating, renaming,
reordering and deleting lists. Switching writes the list id into the URL. See
[../explanation/architecture.md#design--ux](../explanation/architecture.md#design--ux).
