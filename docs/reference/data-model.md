# Data model

Thin by design. The single source of truth for stored data is
[../../src/client/store/schema.ts](../../src/client/store/schema.ts) (TinyBase `TABLES_SCHEMA`);
this doc only records the entities and invariants that aren't obvious from the schema.

## Entities

**`lists`** (row id = `DEFAULT_LIST_ID`, the constant `"list"`)
- `name`
- `createdAt`

**`items`** (the row id doubles as the item's globally-unique id — no separate `id` cell)
- `listId` — local foreign key into `lists`, always `DEFAULT_LIST_ID` in v1
- `name`
- `quantity` — optional number
- `checked` — boolean, default `false`
- `position` — string, fractional index
- `createdAt`

Two distinct "list id" concepts share a name — don't conflate them:

- **Client-side `listId`** (`items.listId`): a purely local value, always `DEFAULT_LIST_ID = "list"`
  in v1. It exists so `items` already reference a list row, making multi-list support a matter of
  varying this value rather than a schema change.
- **Server-derived `listId`** (`HMAC(serverSecret, userId)`, see
  [auth-and-sync.md](../explanation/auth-and-sync.md#listid-derivation)): used only for the Durable
  Object name and the WS ticket. It's never stored in the local store and the client only needs it
  for the handshake.

## Invariants

- **Item ids are globally unique (`crypto.randomUUID()`), not TinyBase's auto-assigned row ids.**
  Auto-assigned ids collide across offline replicas and cause silent data loss; rows are created
  with `store.setRow(newItemId(), …)`, never `addRow`. This is also why sort order is `(position,
  itemId)`. Full explanation:
  [auth-and-sync.md](../explanation/auth-and-sync.md#item-ids-are-globally-unique-not-tinybase-row-ids).
- **`quantity` is optional and absent by default.** No quantity control shows until the user adds
  one; the schema has no `default`, so the cell is genuinely absent (not `0`/`null`) when unset. It
  is never a sort key — items don't reorder when quantity changes.
- **`position` is the reorder sort key** (fractional-index string via `generateKeyBetween`). Sort by
  the tuple `(position, itemId)` so concurrent-offline duplicate keys still converge. See
  [../adr/0007-fractional-index-reorder.md](../adr/0007-fractional-index-reorder.md).
- **The model is list-centric** (`items` reference `listId`) so multi-list and shared lists remain
  addable without a rewrite — v1 ships one list per user, but nothing about the shape assumes that.

## UI

[../../src/client/components/ShoppingList/index.tsx](../../src/client/components/ShoppingList/index.tsx)
presents `items` as **two lists**, not one with strikethrough rows: unchecked (drag-reorderable) and
checked (below, folded behind a collapsed "Checked (N)" disclosure via
[CheckedSection.tsx](../../src/client/components/ShoppingList/CheckedSection.tsx), with its own
"Clear checked" action that deletes every checked row in one transaction). Each row has inline
rename (tap the name), an optional quantity stepper (revealed by a `#` "Add quantity" button, hidden
until added), and delete. A search box filters the combined set to a flat, non-draggable list — the
"find an item and flip its checked state while shopping" flow, so you don't scroll a long list or
expand the checked section just to check something off.
