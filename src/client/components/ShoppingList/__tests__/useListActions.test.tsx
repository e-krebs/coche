import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { Provider, createShoppingStore } from "client/store/store";
import { sortedByPosition } from "client/store/reorder";
import { DEFAULT_LIST_ID } from "client/store/schema";
import { hasList } from "client/store/lists";
import { useListActions } from "client/components/ShoppingList/useListActions";
import type { ItemView } from "client/components/ShoppingList/types";

type Store = ReturnType<typeof createShoppingStore>;

const setup = ({
  items = [],
  listId = DEFAULT_LIST_ID,
}: { items?: ItemView[]; listId?: string } = {}) => {
  const store = createShoppingStore();
  const setEditing = vi.fn();
  const restoreFocus = vi.fn();
  const announce = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(
    () => useListActions({ listId, items, setEditing, restoreFocus, announce }),
    { wrapper },
  );
  return { store, result, setEditing, restoreFocus, announce };
};

const orderedNames = (store: Store) =>
  sortedByPosition(
    store.getRowIds("items"),
    (id) => store.getCell("items", id, "position") ?? "",
  ).map((id) => store.getCell("items", id, "name"));

const idByName = (store: Store, name: string) =>
  store.getRowIds("items").find((id) => store.getCell("items", id, "name") === name)!;

/** A row belonging to a list other than the one under test. */
const seedForeign = ({
  store,
  name,
  position,
  checked = false,
}: {
  store: Store;
  name: string;
  position: string;
  checked?: boolean;
}) =>
  store.setRow("items", `other-${name}`, {
    listId: "other",
    name,
    checked,
    position,
    createdAt: 0,
  });

describe("useListActions", () => {
  describe("add", () => {
    it("appends an item and returns true", () => {
      const { store, result } = setup();
      let added: boolean | undefined;
      act(() => {
        added = result.current.add("Milk");
      });
      expect(added).toBe(true);
      expect(orderedNames(store)).toEqual(["Milk"]);
    });

    it("rejects an empty name", () => {
      const { store, result } = setup();
      let added: boolean | undefined;
      act(() => {
        added = result.current.add("");
      });
      expect(added).toBe(false);
      expect(store.getRowIds("items")).toHaveLength(0);
    });

    it("keeps insertion order by position", () => {
      const { store, result } = setup();
      act(() => {
        result.current.add("A");
        result.current.add("B");
        result.current.add("C");
      });
      expect(orderedNames(store)).toEqual(["A", "B", "C"]);
    });

    // generateKeyBetween("", null) throws, and add() runs inside animate() — so before the guard a
    // single position-less ghost made this list reject every further item, silently.
    it("still appends when a resurrected partial has no position", () => {
      const { store, result } = setup();
      store.setRow("items", "ghost", { checked: true });
      let added: boolean | undefined;
      act(() => {
        added = result.current.add("Milk");
      });
      expect(added).toBe(true);
      expect(store.getCell("items", idByName(store, "Milk"), "position")).toBe("a0");
    });

    it("returns false without a store (renders with no Provider)", () => {
      const { result } = renderHook(() =>
        useListActions({
          listId: DEFAULT_LIST_ID,
          items: [],
          setEditing: vi.fn(),
          restoreFocus: vi.fn(),
          announce: vi.fn(),
        }),
      );
      expect(result.current.add("Milk")).toBe(false);
    });
  });

  // The hasRow guards are the fail-closed invariant: a cross-tab / CRDT delete landing between
  // render and action must never resurrect the row (setCell would recreate it).
  describe("when the row was deleted between render and action", () => {
    it("does not resurrect it on toggle / rename / setQuantity", () => {
      const { store, result } = setup();
      act(() => {
        result.current.add("Milk");
      });
      const id = idByName(store, "Milk");
      store.delRow("items", id);

      act(() => {
        result.current.toggle(id, true);
        result.current.rename(id, "Cheese");
        result.current.setQuantity(id, 5);
      });
      expect(store.hasRow("items", id)).toBe(false);
    });

    // No phantom Undo — hasRow and the safeParse of the now-empty row both reject a gone row.
    it("is a no-op on remove (no Undo captured)", () => {
      const { store, result } = setup();
      act(() => {
        result.current.add("Milk");
      });
      const id = idByName(store, "Milk");
      store.delRow("items", id);
      act(() => {
        result.current.remove(id);
      });
      expect(result.current.undo).toBeNull();
    });
  });

  describe("remove then undo", () => {
    it("restores the full row verbatim", () => {
      const row = {
        listId: "list",
        name: "Eggs",
        quantity: 3,
        checked: true,
        position: "a0",
        createdAt: 42,
      };
      const items: ItemView[] = [{ id: "r1", name: "Eggs", checked: true, quantity: 3 }];
      const { store, result, setEditing } = setup({ items });
      store.setRow("items", "r1", row);

      act(() => {
        result.current.remove("r1");
      });
      expect(store.hasRow("items", "r1")).toBe(false);
      expect(result.current.undo).toEqual({ id: "r1", row });
      expect(setEditing).toHaveBeenCalledWith(null);

      act(() => {
        result.current.undoDelete();
      });
      expect(store.getRow("items", "r1")).toEqual(row);
      expect(result.current.undo).toBeNull();
    });
  });

  describe("setQuantity", () => {
    it("clamps to at least 1 and clears on null", () => {
      const { store, result } = setup();
      act(() => {
        result.current.add("Milk");
      });
      const id = idByName(store, "Milk");
      act(() => {
        result.current.setQuantity(id, 5);
      });
      expect(store.getCell("items", id, "quantity")).toBe(5);
      act(() => {
        result.current.setQuantity(id, 0);
      });
      expect(store.getCell("items", id, "quantity")).toBe(1);
      act(() => {
        result.current.setQuantity(id, null);
      });
      expect(store.getCell("items", id, "quantity")).toBeUndefined();
    });
  });

  describe("clearChecked", () => {
    it("removes only the checked rows", () => {
      const { store, result } = setup();
      act(() => {
        result.current.add("Apples");
        result.current.add("Bread");
      });
      const apples = idByName(store, "Apples");
      store.setCell("items", apples, "checked", true);
      act(() => {
        result.current.clearChecked();
      });
      expect(orderedNames(store)).toEqual(["Bread"]);
    });

    // The whole section goes with its last checked row, so there is no row to hand focus back to.
    it("hands focus back with no row to return to", () => {
      const { result, restoreFocus } = setup();
      act(() => {
        result.current.add("Apples");
      });
      act(() => {
        result.current.clearChecked();
      });
      expect(restoreFocus).toHaveBeenCalledWith();
    });

    // The section vanishes and focus jumps to the header, so the count explains both.
    it("announces how many went", () => {
      const { store, result, announce } = setup();
      act(() => {
        result.current.add("Apples");
        result.current.add("Bread");
      });
      store.setCell("items", idByName(store, "Apples"), "checked", true);
      act(() => {
        result.current.clearChecked();
      });
      expect(announce).toHaveBeenCalledWith("1 checked item removed.");
    });
  });

  describe("reorder", () => {
    it("repositions the dragged row after its target", () => {
      const { store, result } = setup();
      act(() => {
        result.current.add("A");
        result.current.add("B");
        result.current.add("C");
      });
      act(() => {
        result.current.reorder({ activeId: idByName(store, "A"), overId: idByName(store, "C") });
      });
      expect(orderedNames(store)).toEqual(["B", "C", "A"]);
    });

    it("is a no-op when dropped on itself", () => {
      const { store, result } = setup();
      act(() => {
        result.current.add("A");
        result.current.add("B");
      });
      const a = idByName(store, "A");
      const before = store.getCell("items", a, "position");
      act(() => {
        result.current.reorder({ activeId: a, overId: a });
      });
      expect(store.getCell("items", a, "position")).toBe(before);
    });
  });

  // Every mutation carries a listId predicate: one store holds every list, so an unscoped scan
  // reaches rows the user can't even see.
  describe("when another list holds items", () => {
    it("stamps the active list and appends against its own positions", () => {
      const { store, result } = setup();
      seedForeign({ store, name: "Nails", position: "z9" });
      act(() => {
        result.current.add("Milk");
      });
      const id = idByName(store, "Milk");
      expect(store.getCell("items", id, "listId")).toBe(DEFAULT_LIST_ID);
      expect(store.getCell("items", id, "position")).toBe("a0"); // not after the foreign "z9"
    });

    it("clears only the active list's checked items", () => {
      const { store, result } = setup();
      seedForeign({ store, name: "Nails", position: "a0", checked: true });
      act(() => {
        result.current.add("Milk");
      });
      store.setCell("items", idByName(store, "Milk"), "checked", true);
      act(() => {
        result.current.clearChecked();
      });
      expect(orderedNames(store)).toEqual(["Nails"]);
    });

    it("leaves foreign positions untouched on reorder", () => {
      const { store, result } = setup();
      seedForeign({ store, name: "Nails", position: "a0V" });
      act(() => {
        result.current.add("A");
        result.current.add("B");
      });
      act(() => {
        result.current.reorder({ activeId: idByName(store, "A"), overId: idByName(store, "B") });
      });
      expect(store.getCell("items", "other-Nails", "position")).toBe("a0V");
      expect(orderedNames(store).filter((n) => n !== "Nails")).toEqual(["B", "A"]);
    });
  });

  // Before the migration runs, the default list has no `lists` row and the roster only shows it while
  // items point at it — so emptying it would drop the list the user is standing on, taking the Undo
  // target with it. Acting on a list is evidence it exists, so every write materializes it first.
  describe("when the list has no row yet", () => {
    it("makes it real on add", () => {
      const { store, result } = setup();
      expect(store.hasRow("lists", DEFAULT_LIST_ID)).toBe(false);
      act(() => {
        result.current.add("Milk");
      });
      // createdAt only — a name or position cell here would out-clock a peer's rename or reorder.
      expect(Object.keys(store.getRow("lists", DEFAULT_LIST_ID))).toEqual(["createdAt"]);
    });

    it("keeps it in the roster after its last item is cleared", () => {
      const { store, result } = setup();
      act(() => {
        result.current.add("Milk");
      });
      store.delRow("lists", DEFAULT_LIST_ID); // back to virtual, as a pre-upgrade replica would be
      store.setCell("items", idByName(store, "Milk"), "checked", true);
      act(() => {
        result.current.clearChecked();
      });
      expect(store.getRowIds("items")).toEqual([]);
      expect(hasList({ store, id: DEFAULT_LIST_ID })).toBe(true);
    });

    it("keeps it in the roster after its last item is deleted, so Undo still works", () => {
      const row = {
        listId: DEFAULT_LIST_ID,
        name: "Eggs",
        checked: false,
        position: "a0",
        createdAt: 0,
      };
      const items: ItemView[] = [{ id: "r1", name: "Eggs", checked: false, quantity: undefined }];
      const { store, result } = setup({ items });
      store.setRow("items", "r1", row);

      act(() => {
        result.current.remove("r1");
      });
      expect(hasList({ store, id: DEFAULT_LIST_ID })).toBe(true);
      act(() => {
        result.current.undoDelete();
      });
      expect(store.getRow("items", "r1")).toEqual(row);
    });
  });

  // hasList counts the still-virtual default list, so Undo keeps working before the first sync.
  describe("when the item's list was deleted inside the Undo window", () => {
    it("drops the Undo instead of resurrecting a phantom list", () => {
      const row = {
        listId: "gone",
        name: "Nails",
        checked: false,
        position: "a0",
        createdAt: 0,
      };
      const items: ItemView[] = [{ id: "r1", name: "Nails", checked: false, quantity: undefined }];
      const { store, result } = setup({ items, listId: "gone" });
      store.setRow("lists", "gone", { name: "Hardware", createdAt: 0 });
      store.setRow("items", "r1", row);

      act(() => {
        result.current.remove("r1");
      });
      store.delRow("lists", "gone");
      act(() => {
        result.current.undoDelete();
      });
      expect(store.hasRow("items", "r1")).toBe(false);
      expect(store.hasRow("lists", "gone")).toBe(false); // no phantom list minted either
      expect(result.current.undo).toBeNull();
    });
  });
});
