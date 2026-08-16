import { useEffect } from "react";
import { generateKeyBetween } from "fractional-indexing";
import { arrayMove } from "@dnd-kit/sortable";
import type { Store } from "tinybase/with-schemas";
import { keyForPosition } from "./reorder";
import { DEFAULT_LIST_ID, type Schemas } from "./schema";
import { newItemId, useStore, useTable } from "./store";

type ShoppingStore = Store<Schemas>;

export type ListSummary = {
  id: string;
  /** Absent on the default list and on rows the orphan sweep resurrected — render the app title. */
  name: string | undefined;
  position: string;
  createdAt: number;
  /** Unchecked items, the count worth acting on. Reads 0 until the first sync lands. */
  count: number;
};

type ListsTable = Record<string, { name?: string; position?: string; createdAt?: number }>;
type ItemsTable = Record<
  string,
  { listId?: string; name?: string; checked?: boolean; position?: string }
>;

/**
 * (position, createdAt, id). The migration and the orphan sweep deliberately write no position —
 * seeding one would out-clock a real reorder — so createdAt and the id keep those rows somewhere
 * deterministic until the first drag backfills them.
 */
const byRosterOrder = (a: ListSummary, b: ListSummary): number => {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * The roster the user sees, never empty. Pure, so the CRDT edge cases below are testable without
 * React or a live store.
 *
 * The default list is shown *virtually* while `lists` has no row for it: repair waits for the first
 * sync (writing before it resurrects lists a peer deleted on purpose), and until it runs the roster
 * would otherwise render empty, or the default list's items be unreachable.
 */
export const rosterFrom = ({
  lists,
  items,
}: {
  lists: ListsTable;
  items: ItemsTable;
}): ListSummary[] => {
  const counts = new Map<string, number>();
  const referenced = new Set<string>();
  Object.values(items).forEach((item) => {
    // Only complete rows count. A partial resurrected by a concurrent edit has no listId, and
    // setRow("lists", undefined, …) would mint a real list keyed "undefined".
    if (!item.listId || !item.name || !item.position) return;
    referenced.add(item.listId);
    if (!item.checked) counts.set(item.listId, (counts.get(item.listId) ?? 0) + 1);
  });

  const rows: ListSummary[] = Object.entries(lists).map(([id, row]) => ({
    id,
    name: row.name,
    position: row.position ?? "",
    createdAt: row.createdAt ?? 0,
    count: counts.get(id) ?? 0,
  }));
  if (!(DEFAULT_LIST_ID in lists) && (rows.length === 0 || referenced.has(DEFAULT_LIST_ID)))
    rows.push({
      id: DEFAULT_LIST_ID,
      name: undefined,
      position: "",
      createdAt: 0,
      count: counts.get(DEFAULT_LIST_ID) ?? 0,
    });
  return rows.sort(byRosterOrder);
};

const rosterOf = (store: ShoppingStore): ListSummary[] =>
  rosterFrom({ lists: store.getTable("lists"), items: store.getTable("items") });

export const useLists = (): ListSummary[] =>
  rosterFrom({ lists: useTable("lists"), items: useTable("items") });

/** True when `id` names a list the user can see, the still-virtual default list included. */
export const hasList = ({ store, id }: { store: ShoppingStore; id: string }): boolean =>
  rosterOf(store).some((l) => l.id === id);

/** Highest position in the roster, skipping the rows that have none (see byRosterOrder). */
const lastPosition = (store: ShoppingStore): string | null => {
  const positions = store
    .getRowIds("lists")
    .map((id) => store.getCell("lists", id, "position"))
    .filter((p): p is string => !!p);
  return positions.length ? positions.reduce((m, p) => (p > m ? p : m)) : null;
};

/** Appends a list and returns its id; null when the name is blank. */
export const addList = ({ store, name }: { store: ShoppingStore; name: string }): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const id = newItemId();
  store.setRow("lists", id, {
    name: trimmed,
    position: generateKeyBetween(lastPosition(store), null),
    createdAt: Date.now(),
  });
  return id;
};

export const renameList = ({
  store,
  id,
  name,
}: {
  store: ShoppingStore;
  id: string;
  name: string;
}): void => {
  const trimmed = name.trim();
  if (!trimmed) return; // a blank rename keeps the old name, as for items
  // May create the default list's row ahead of the migration: a rename is user intent and should win
  // LWW, unlike the migration, which must never write a name cell at all.
  if (id === DEFAULT_LIST_ID || store.hasRow("lists", id))
    store.setCell("lists", id, "name", trimmed);
};

/**
 * Hard delete, row and items in one transaction: split across two, a peer sees "list gone, items
 * present" as settled state and resurrects it. Refuses the last list — there is no zero-lists state.
 */
export const deleteList = ({ store, id }: { store: ShoppingStore; id: string }): boolean => {
  const roster = rosterOf(store);
  if (roster.length <= 1 || !roster.some((l) => l.id === id)) return false;
  store.transaction(() => {
    store.delRow("lists", id); // a no-op while the default list is still virtual
    store.getRowIds("items").forEach((item) => {
      if (store.getCell("items", item, "listId") === id) store.delRow("items", item);
    });
  });
  return true;
};

export const reorderLists = ({
  store,
  activeId,
  overId,
}: {
  store: ShoppingStore;
  activeId: string;
  overId: string;
}): void => {
  if (activeId === overId) return;
  const roster = rosterOf(store);
  const from = roster.findIndex((l) => l.id === activeId);
  const to = roster.findIndex((l) => l.id === overId);
  if (from < 0 || to < 0) return;
  const order = arrayMove(roster, from, to);
  // Migrated and resurrected rows have no position, and generateKeyBetween("", …) throws — caught,
  // so the drop would silently no-op. The first drag stamps the whole roster instead.
  if (order.some((l) => !l.position)) {
    store.transaction(() => {
      let prev: string | null = null;
      order.forEach((l) => {
        prev = generateKeyBetween(prev, null);
        store.setCell("lists", l.id, "position", prev);
      });
    });
    return;
  }
  const key = keyForPosition({
    order: order.map((l) => l.id),
    id: activeId,
    getPosition: (id) => store.getCell("lists", id, "position") ?? "",
  });
  if (key) store.setCell("lists", activeId, "position", key);
};

/**
 * Makes the pre-multi-list default list real. Writes `createdAt` only: a name or position cell would
 * carry a newer HLC than a rename or reorder made on another device last week and silently revert it
 * (per-cell LWW, no row tombstones).
 */
const migrateDefaultList = (store: ShoppingStore): void => {
  if (store.getRowCount("lists") > 0) return;
  store.setRow("lists", DEFAULT_LIST_ID, { createdAt: Date.now() });
};

/**
 * Gives orphaned items a list again: a peer can delete a list while this device adds to it offline,
 * and the item survives the merge pointing at nothing — invisible forever. Resurrected rows are
 * nameless, so they read as the default list until renamed (an accepted collision).
 */
const resurrectOrphans = (store: ShoppingStore): void => {
  const missing = new Set<string>();
  store.getRowIds("items").forEach((id) => {
    const { listId, name, position } = store.getRow("items", id);
    if (!listId || !name || !position) return; // partials aren't data (see rosterFrom)
    if (!store.hasRow("lists", listId)) missing.add(listId);
  });
  missing.forEach((id) => {
    store.setRow("lists", id, { createdAt: Date.now() });
  });
};

/**
 * Heals the roster once this device has actually seen the server: makes the default list real, and
 * gives orphaned items somewhere to live. Both write `lists` rows, so both wait for sync — before
 * it, an empty local replica is indistinguishable from a roster a peer emptied on purpose, and
 * writing would resurrect deleted lists on every device, forever.
 */
export const useRosterRepair = ({ synced }: { synced: boolean }): void => {
  const store = useStore();
  // Synchronizing with Effects, not the anti-pattern: the store is an external system, and a merge
  // can orphan items or empty the roster at any moment, so this subscribes for the session instead
  // of running once at boot (a one-shot leaves the app stuck at zero lists).
  // https://react.dev/learn/synchronizing-with-effects
  // oxlint-disable react-you-might-not-need-an-effect/no-external-store-subscription
  useEffect(() => {
    if (!store || !synced) return undefined;
    const repair = () => {
      migrateDefaultList(store);
      resurrectOrphans(store);
    };
    store.transaction(repair);
    // mutator: the repair writes, so it has to run inside the transaction it reacts to; both writes
    // are idempotent, so the loop settles after one pass.
    const listenerId = store.addTablesListener(repair, true);
    return () => {
      store.delListener(listenerId);
    };
  }, [store, synced]);
  // oxlint-enable react-you-might-not-need-an-effect/no-external-store-subscription
};

const LAST_LIST_KEY = "shopping:lastList";

/**
 * Which list this device was last on. Device-local on purpose, not a synced Value — the same seam as
 * the locale mirror, and two phones shouldn't yank each other between lists.
 */
export const readLastList = (): string | null => {
  try {
    return localStorage.getItem(LAST_LIST_KEY);
  } catch {
    return null;
  }
};

export const writeLastList = (id: string): void => {
  try {
    localStorage.setItem(LAST_LIST_KEY, id);
  } catch {}
};

export const clearLastList = (): void => {
  try {
    localStorage.removeItem(LAST_LIST_KEY);
  } catch {}
};
