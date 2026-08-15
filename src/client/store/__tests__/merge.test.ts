import { describe, expect, it } from "vitest";
import { generateKeyBetween } from "fractional-indexing";
import { createShoppingStore } from "client/store/store";
import { sortedByPosition } from "client/store/reorder";
import { DEFAULT_LIST_ID } from "client/store/schema";

// v1 CRDT merge semantics (docs/explanation/auth-and-sync.md). merge is bidirectional, so each
// case asserts the surprise and that replicas converge; for a deterministic winner one device
// merges first so its next write has a strictly higher HLC.

type Store = ReturnType<typeof createShoppingStore>;

const seedItem = ({
  store,
  id,
  name,
  position,
  extra = {},
}: {
  store: Store;
  id: string;
  name: string;
  position: string;
  extra?: object;
}) =>
  store.setRow("items", id, {
    listId: DEFAULT_LIST_ID,
    name,
    checked: false,
    position,
    createdAt: 0,
    ...extra,
  });

const order = (store: Store): (string | undefined)[] =>
  sortedByPosition(
    store.getRowIds("items"),
    (id) => store.getCell("items", id, "position") ?? "",
  ).map((id) => store.getCell("items", id, "name"));

describe("merge", () => {
  describe("when a later edit lands on a row another device deleted", () => {
    it("resurrects the row as a partial", () => {
      const a = createShoppingStore();
      const b = createShoppingStore();
      seedItem({ store: a, id: "x", name: "Milk", position: generateKeyBetween(null, null) });
      a.merge(b);

      a.delRow("items", "x");
      a.merge(b); // b observes the delete, so its clock now exceeds the delete's HLC
      // a strictly-later edit wins (no tombstone in v1)
      b.setCell("items", "x", "name", "Milk Deluxe");
      a.merge(b);

      // Resurrected as a partial: the edited cell returns, the delete's other cells stay gone.
      expect(a.hasRow("items", "x")).toBe(true);
      expect(a.getCell("items", "x", "name")).toBe("Milk Deluxe");
      expect(a.getCell("items", "x", "position")).toBeUndefined();
      expect(a.getRowIds("items")).toEqual(b.getRowIds("items"));
      expect(b.getCell("items", "x", "name")).toBe("Milk Deluxe");
    });
  });

  describe("when a later write on another device wins", () => {
    it("flips checked back (LWW)", () => {
      const a = createShoppingStore();
      const b = createShoppingStore();
      seedItem({ store: a, id: "x", name: "Eggs", position: generateKeyBetween(null, null) });
      a.merge(b);

      a.setCell("items", "x", "checked", true);
      a.merge(b); // b observes checked=true, so its clock now exceeds a's write
      b.setCell("items", "x", "checked", false); // strictly later, so wins
      a.merge(b);

      expect(a.getCell("items", "x", "checked")).toBe(false);
      expect(b.getCell("items", "x", "checked")).toBe(false);
    });
  });

  describe("when two devices increment the same cell offline", () => {
    it("merges to a single value, not their sum (LWW, not additive)", () => {
      const a = createShoppingStore();
      const b = createShoppingStore();
      seedItem({
        store: a,
        id: "x",
        name: "Apples",
        position: generateKeyBetween(null, null),
        extra: { quantity: 1 },
      });
      a.merge(b);

      a.setCell("items", "x", "quantity", 2); // each device increments 1 -> 2 offline
      b.setCell("items", "x", "quantity", 2);
      a.merge(b);

      expect(a.getCell("items", "x", "quantity")).toBe(2); // additive would be 3
      expect(b.getCell("items", "x", "quantity")).toBe(2);
    });
  });

  describe("when offline reorders diverge", () => {
    it("converges to one deterministic order", () => {
      const a = createShoppingStore();
      const b = createShoppingStore();
      const px = generateKeyBetween(null, null);
      const py = generateKeyBetween(px, null);
      const pz = generateKeyBetween(py, null);
      seedItem({ store: a, id: "x", name: "X", position: px });
      seedItem({ store: a, id: "y", name: "Y", position: py });
      seedItem({ store: a, id: "z", name: "Z", position: pz });
      a.merge(b);

      a.setCell("items", "z", "position", generateKeyBetween(null, px)); // Z to the front
      b.setCell("items", "x", "position", generateKeyBetween(pz, null)); // X to the back
      a.merge(b);

      expect(order(a)).toEqual(["Z", "Y", "X"]);
      expect(order(b)).toEqual(["Z", "Y", "X"]);
    });
  });
});
