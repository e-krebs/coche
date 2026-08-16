import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { generateKeyBetween } from "fractional-indexing";
import { arrayMove } from "@dnd-kit/sortable";
import { keyForPosition, sortedByPosition } from "client/store/reorder";
import { hasList } from "client/store/lists";
import { newItemId, useStore } from "client/store/store";
import { animate } from "./helpers";
import type { Editing, ItemView } from "./types";

/** Full row cells captured before a delete so an Undo toast can restore the item verbatim. */
const itemSchema = z.object({
  listId: z.string(),
  name: z.string(),
  quantity: z.number().optional(),
  checked: z.boolean(),
  position: z.string(),
  createdAt: z.number(),
});
type StoredItem = z.infer<typeof itemSchema>;

type Undo = { id: string; row: StoredItem } | null;

/**
 * Store mutations for the list, each fail-closed behind a `hasRow` guard so a cross-tab/CRDT delete
 * between render and action can't resurrect a row. Owns the Undo buffer for deletes.
 */
export const useListActions = ({
  listId,
  items,
  setEditing,
  restoreFocus,
}: {
  listId: string;
  items: ItemView[];
  setEditing: (e: Editing) => void;
  restoreFocus: (id: string | undefined) => void;
}) => {
  const store = useStore();
  const [undo, setUndo] = useState<Undo>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(undoTimer.current);
    },
    [],
  );

  const add = (name: string) => {
    if (!name || !store) return false;
    // Skip position-less rows. A concurrent edit to a deleted item resurrects it as a partial with
    // no position (see merge.test.ts), and generateKeyBetween("", null) throws — inside animate(),
    // so it would surface only as an unhandled rejection and this list would silently stop adding.
    const positions = store
      .getRowIds("items")
      .filter((id) => store.getCell("items", id, "listId") === listId)
      .map((id) => store.getCell("items", id, "position"))
      .filter((p): p is string => !!p);
    const lastPos = positions.length ? positions.reduce((m, p) => (p > m ? p : m)) : null;
    animate(() =>
      store.setRow("items", newItemId(), {
        listId,
        name,
        checked: false,
        position: generateKeyBetween(lastPos, null),
        createdAt: Date.now(),
      }),
    );
    return true;
  };

  const toggle = (id: string, isChecked: boolean) => {
    animate(() => {
      // setCell would recreate a row deleted between render and tap.
      if (store?.hasRow("items", id)) store.setCell("items", id, "checked", isChecked);
    });
  };
  const rename = (id: string, name: string) => {
    const trimmed = name.trim();
    // A blur firing after the row was deleted must not resurrect it.
    if (trimmed && store?.hasRow("items", id)) store.setCell("items", id, "name", trimmed);
  };
  const remove = (id: string) => {
    // A late commit timer must not capture an empty row Undo would restore as a ghost.
    if (!store?.hasRow("items", id)) return;
    const parsed = itemSchema.safeParse(store.getRow("items", id));
    if (!parsed.success) return;
    const row = parsed.data;
    const idx = items.findIndex((i) => i.id === id);
    const neighbor = items[idx + 1]?.id ?? items[idx - 1]?.id;
    animate(() => store.delRow("items", id));
    setEditing(null);
    setUndo({ id, row });
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => {
      setUndo(null);
    }, 5000);
    restoreFocus(neighbor);
  };
  const undoDelete = () => {
    window.clearTimeout(undoTimer.current);
    // Its list can be deleted inside the 5s window; restoring the row would mint a phantom list the
    // orphan sweep then resurrects nameless.
    if (store && undo && hasList({ store, id: undo.row.listId })) {
      animate(() => store.setRow("items", undo.id, undo.row));
      restoreFocus(undo.id);
    }
    setUndo(null);
  };
  const setQuantity = (id: string, quantity: number | null) => {
    if (!store?.hasRow("items", id)) return;
    if (quantity === null || Number.isNaN(quantity)) store.delCell("items", id, "quantity");
    else store.setCell("items", id, "quantity", Math.max(1, quantity));
  };
  const clearChecked = () => {
    animate(() =>
      store?.transaction(() => {
        store.getRowIds("items").forEach((id) => {
          if (store.getCell("items", id, "listId") !== listId) return;
          if (store.getCell("items", id, "checked")) store.delRow("items", id);
        });
      }),
    );
  };
  const reorder = ({ activeId, overId }: { activeId: string; overId: string }) => {
    if (!store || activeId === overId) return;
    // Scoped to this list so a foreign row can't become a drop neighbour: the key minted from it
    // sits inside another list's range, where the next drag there can collide with it.
    const ids = sortedByPosition(
      store.getRowIds("items").filter((id) => store.getCell("items", id, "listId") === listId),
      (id) => store.getCell("items", id, "position") ?? "",
    ).filter((id) => !store.getCell("items", id, "checked"));
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0) return;
    const order = arrayMove(ids, from, to);
    const key = keyForPosition({
      order,
      id: activeId,
      getPosition: (id) => store.getCell("items", id, "position") ?? "",
    });
    if (key) store.setCell("items", activeId, "position", key);
  };

  return { add, toggle, rename, remove, undoDelete, setQuantity, clearChecked, reorder, undo };
};
