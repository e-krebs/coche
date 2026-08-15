# 0007. Fractional-index reorder for drag-and-drop

## Status

Accepted

## Context

v1 needs drag reorder (mobile-first) that (a) doesn't rewrite every row's order on a single move,
and (b) still converges deterministically when two devices reorder concurrently while offline, given
the CRDT's per-cell LWW merge (see
[../explanation/auth-and-sync.md](../explanation/auth-and-sync.md#crdt-merge-semantics)).

## Decision

Each item carries a `position` — a string fractional index. On reorder, set
`position = generateKeyBetween(prev, next)` (from the `fractional-indexing` package). Sort items by
the tuple `(position, itemId)`, not `position` alone, so that if two offline devices independently
generate the same index for two different items, the `itemId` tiebreaker still produces a stable
order after merge. The `(position, itemId)` order is applied **in userland** by `sortedByPosition`
in [../../src/client/store/reorder.ts](../../src/client/store/reorder.ts) — not via TinyBase's
`getSortedRowIds`/`useSortedRowIds`, whose default sorter compares only the cell value and can't
tiebreak on rowId (tied positions would fall back to each replica's insertion order, i.e.
non-convergently). New keys come from `keyForPosition` (same file), which returns `null` instead of
throwing if two neighbours' positions have collided. Wired into drag/drop in
[../../src/client/components/ShoppingList/index.tsx](../../src/client/components/ShoppingList/index.tsx).

## Consequences

- Moving one item is a single-cell write (`position` on that row), not an O(n) rewrite — cheap under
  the per-cell merge model.
- Concurrent-offline reorders can still produce a final order neither device "intended" (this falls
  out of per-cell LWW, same family as checked-flip-back/quantity-LWW) — but it's guaranteed
  deterministic and collision-free given the `(position, itemId)` tiebreaker, which depends on item
  ids being globally unique (see [0002-tinybase-crdt.md](0002-tinybase-crdt.md)).
- Reorder UI is implemented with **dnd-kit** (see
  [0008-dnd-kit-reorder.md](0008-dnd-kit-reorder.md)). Drag applies to the unchecked list only;
  checked items and search results render as plain, non-sortable rows. The
  `position`/`keyForPosition` math here is independent of the drag library.
- `fractional-indexing` (rocicorp) `^4.0.0` is the package imported (not the near-namesake
  `jittered-fractional-indexing`). `fractional-indexing-jittered` (Meerhof) isn't used — the
  `(position, itemId)` tiebreaker alone is sufficient for deterministic convergence.
