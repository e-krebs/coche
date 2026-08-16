import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { Provider, createShoppingStore } from "client/store/store";
import { sortedByPosition } from "client/store/reorder";
import { useListActions } from "client/components/ShoppingList/useListActions";
import type { ItemView } from "client/components/ShoppingList/types";

type Store = ReturnType<typeof createShoppingStore>;

const setup = (items: ItemView[] = []) => {
  const store = createShoppingStore();
  const setEditing = vi.fn();
  const restoreFocus = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(() => useListActions({ items, setEditing, restoreFocus }), {
    wrapper,
  });
  return { store, result, setEditing, restoreFocus };
};

const orderedNames = (store: Store) =>
  sortedByPosition(
    store.getRowIds("items"),
    (id) => store.getCell("items", id, "position") ?? "",
  ).map((id) => store.getCell("items", id, "name"));

const idByName = (store: Store, name: string) =>
  store.getRowIds("items").find((id) => store.getCell("items", id, "name") === name)!;

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
        useListActions({ items: [], setEditing: vi.fn(), restoreFocus: vi.fn() }),
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
      const { store, result, setEditing } = setup(items);
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
});
