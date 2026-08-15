/** v1 is single-list; items still carry listId so multi-list slots in later without a re-key. */
export const DEFAULT_LIST_ID = "list";

export const TABLES_SCHEMA = {
  lists: {
    name: { type: "string" },
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
