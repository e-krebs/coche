/**
 * The list every pre-multi-list item points at. Its `lists` row only appears once the migration
 * writes one, so reads must fall back to the app title rather than assume the row exists.
 */
export const DEFAULT_LIST_ID = "list";

export const TABLES_SCHEMA = {
  lists: {
    name: { type: "string" }, // no default => absent means the default list (or a resurrected one)
    position: { type: "string" }, // fractional index; absent on migrated and resurrected rows
    createdAt: { type: "number" },
  },
  items: {
    listId: { type: "string" },
    name: { type: "string" },
    quantity: { type: "number" }, // no default => cell absent when unset
    checked: { type: "boolean", default: false },
    position: { type: "string" }, // fractional index
    createdAt: { type: "number" },
  },
} as const;

export const VALUES_SCHEMA = {
  // UI language, synced across devices; absent => follow the browser.
  locale: { type: "string" },
} as const;

export type Schemas = [typeof TABLES_SCHEMA, typeof VALUES_SCHEMA];
