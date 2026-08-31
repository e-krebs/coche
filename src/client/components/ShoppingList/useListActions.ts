import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { generateKeyBetween } from "fractional-indexing";
import { arrayMove } from "@dnd-kit/sortable";
import { keyForPosition, sortedByPosition } from "client/store/reorder";
import { ensureList, hasList } from "client/store/lists";
import { newItemId, useStore } from "client/store/store";
import { useTranslation } from "client/i18n/useTranslation";
import { animate } from "./helpers";
import type { Editing, ItemView, RestoreFocus } from "./types";

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

// Long enough to reach by keyboard: the snackbar is last in the DOM, so it is several Tab presses
// away, and the delete has just moved focus to a neighbouring row.
const UNDO_MS = 10_000;

/**
 * Store mutations for the list, each fail-closed behind a `hasRow` guard so a cross-tab/CRDT delete
 * between render and action can't resurrect a row. Owns the Undo buffer for deletes.
 */
export const useListActions = ({
  listId,
  items,
  searching,
  setEditing,
  restoreFocus,
  announce,
}: {
  listId: string;
  items: ItemView[];
  /** A filtered view is on screen, so the rendered rows are neither `items` nor in its order. */
  searching: boolean;
  setEditing: (e: Editing) => void;
  restoreFocus: RestoreFocus;
  announce: (message: string) => void;
}) => {
  const store = useStore();
  const t = useTranslation();
  const [undo, setUndo] = useState<Undo>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(undoTimer.current);
    },
    [],
  );

  const startUndoTimer = () => {
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => {
      setUndo(null);
      // The snackbar may be holding focus as it expires; restoreFocus is a no-op unless it dropped.
      restoreFocus();
    }, UNDO_MS);
  };
  // Hovering or focusing the snackbar means the user is still deciding.
  const pauseUndo = () => {
    window.clearTimeout(undoTimer.current);
  };
  const resumeUndo = () => {
    if (undo) startUndoTimer();
  };

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
    animate(() => {
      store.transaction(() => {
        // The list may be virtual, or deleted by a peer between render and submit. Either way the
        // item needs somewhere to live — dropping what the user typed is the worse outcome.
        ensureList({ store, id: listId });
        store.setRow("items", newItemId(), {
          listId,
          name,
          checked: false,
          position: generateKeyBetween(lastPos, null),
          createdAt: Date.now(),
        });
      });
    });
    return true;
  };

  const toggle = (id: string, isChecked: boolean) => {
    const name = items.find((i) => i.id === id)?.name;
    // Checking unmounts the row into the checked section — collapsed and inert in the common case —
    // taking the focused button with it. The next unchecked row slides into the vacated slot, so Space
    // walks straight down the list, and the row above is the target when there is none below.
    const nextUnchecked = () => {
      const unchecked = items.filter((i) => !i.checked);
      const idx = unchecked.findIndex((i) => i.id === id);
      // Absent means a peer checked it first: fail closed rather than aim at unchecked[0].
      return idx < 0 ? undefined : (unchecked[idx + 1]?.id ?? unchecked[idx - 1]?.id);
    };
    // Neither the unchecked list nor a filtered one loses the row: unchecking remounts it further
    // down, and a filter matches on the name rather than the checked flag, so the row only re-sorts.
    // Either way it stays its own target — and the rendered order in a filtered view is not this one.
    const target = isChecked && !searching ? nextUnchecked() : id;
    animate(
      () => {
        // setCell would recreate a row deleted between render and tap.
        if (!store?.hasRow("items", id)) return;
        store.setCell("items", id, "checked", isChecked);
        // Announced only where the button dies: it carries aria-pressed, so wherever the row survives
        // — unchecking, or a filtered view — the flip is spoken twice. Inside the guard so a row a
        // peer deleted in the view transition's frame isn't reported as checked off.
        if (isChecked && !searching && name) announce(t("checkedOff", { name }));
      },
      () => {
        restoreFocus({ id: target, control: "check" });
      },
    );
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
    animate(
      () => {
        store.transaction(() => {
          // Removing the last item would otherwise drop a still-virtual list out of the roster, taking
          // the Undo target with it.
          ensureList({ store, id: row.listId });
          store.delRow("items", id);
        });
      },
      () => {
        restoreFocus({ id: neighbor });
      },
    );
    setEditing(null);
    setUndo({ id, row });
    startUndoTimer();
    announce(t("deletedUndo", { name: row.name }));
  };
  const undoDelete = () => {
    window.clearTimeout(undoTimer.current);
    // Its list can be deleted inside the Undo window; restoring the row would mint a phantom list the
    // orphan sweep then resurrects nameless.
    if (store && undo && hasList({ store, id: undo.row.listId })) {
      animate(
        () => store.setRow("items", undo.id, undo.row),
        () => {
          restoreFocus({ id: undo.id });
        },
      );
    }
    setUndo(null);
  };
  const setQuantity = (id: string, quantity: number | null) => {
    if (!store?.hasRow("items", id)) return;
    if (quantity === null || Number.isNaN(quantity)) store.delCell("items", id, "quantity");
    else store.setCell("items", id, "quantity", Math.max(1, quantity));
  };
  const clearChecked = () => {
    if (!store) return;
    // Resolved before the mutation, not counted during it: animate() may defer the callback to a view
    // transition, so anything tallied inside would still read zero by the time we announce.
    const clearing = store
      .getRowIds("items")
      .filter(
        (id) =>
          store.getCell("items", id, "listId") === listId && store.getCell("items", id, "checked"),
      );
    // The section unmounts with its last checked row, taking the focused Clear button with it.
    animate(
      () => {
        store.transaction(() => {
          ensureList({ store, id: listId }); // clearing everything must not drop a virtual list
          clearing.forEach((id) => {
            // Re-read: a peer can uncheck a row between the resolve above and this mutation, and
            // clearing what is now unchecked is data loss.
            if (store.getCell("items", id, "checked")) store.delRow("items", id);
          });
        });
      },
      () => {
        restoreFocus();
      },
    );
    announce(t("clearedChecked", { count: clearing.length }));
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

  return {
    add,
    toggle,
    rename,
    remove,
    undoDelete,
    setQuantity,
    clearChecked,
    reorder,
    undo,
    pauseUndo,
    resumeUndo,
  };
};
