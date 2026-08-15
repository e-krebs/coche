import { createMergeableStore } from "tinybase/with-schemas";
import * as UiReact from "tinybase/ui-react/with-schemas";
import { TABLES_SCHEMA, VALUES_SCHEMA, type Schemas } from "./schema";
import { createMergeableIndexedDbPersister } from "./persister";

// TinyBase's typed-API entry: the namespace cast their docs prescribe.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- docs-prescribed cast (see above)
const Ui = UiReact as UiReact.WithSchemas<Schemas>;

export const {
  Provider,
  useCreateMergeableStore,
  useCreatePersister,
  useStore,
  useTable,
  useValue,
} = Ui;

export { createMergeableIndexedDbPersister };

export const createShoppingStore = () =>
  createMergeableStore().setTablesSchema(TABLES_SCHEMA).setValuesSchema(VALUES_SCHEMA);

export const dbNameForUser = (userId: string) => `shopping-${userId}`;

/**
 * Globally-unique so two offline replicas never mint the same row id and merge into one cell-wise
 * conflict; getRandomValues fallback because randomUUID is secure-context-only
 * (e.g. http on a LAN IP).
 */
export const newItemId = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
