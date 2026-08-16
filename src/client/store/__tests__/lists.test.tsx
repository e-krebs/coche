import { type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { Provider, createShoppingStore } from "client/store/store";
import { DEFAULT_LIST_ID } from "client/store/schema";
import {
  addList,
  deleteList,
  hasList,
  renameList,
  reorderLists,
  rosterFrom,
  useRosterRepair,
} from "client/store/lists";

type Store = ReturnType<typeof createShoppingStore>;

const item = ({
  listId = DEFAULT_LIST_ID,
  name = "Milk",
  position = "a0",
  checked = false,
}: { listId?: string; name?: string; position?: string; checked?: boolean } = {}) => ({
  listId,
  name,
  position,
  checked,
  createdAt: 0,
});

type Tables = Parameters<Store["setTables"]>[0];

const seed = ({
  lists = {},
  items = {},
}: { lists?: Tables["lists"]; items?: Tables["items"] } = {}) => {
  const store = createShoppingStore();
  store.setTables({ lists, items });
  return store;
};

const rosterOf = (store: Store) =>
  rosterFrom({ lists: store.getTable("lists"), items: store.getTable("items") });

const ids = (store: Store) => rosterOf(store).map((l) => l.id);

const repair = ({ store, synced }: { store: Store; synced: boolean }) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(
    () => {
      useRosterRepair({ synced });
    },
    { wrapper },
  );
};

describe("rosterFrom", () => {
  // Repair waits for the first sync, so until then the default list has to be shown without a row —
  // otherwise a fresh device renders zero lists, or hides the items it already has.
  describe("while the default list has no row", () => {
    it("stands one in for an empty roster, nameless", () => {
      expect(rosterOf(seed())).toEqual([
        { id: DEFAULT_LIST_ID, name: undefined, position: "", createdAt: 0, count: 0, total: 0 },
      ]);
    });

    it("stands one in alongside real lists while items still point at it", () => {
      const store = seed({
        lists: { garden: { name: "Garden", position: "a0", createdAt: 1 } },
        items: { x: item() },
      });
      expect(ids(store)).toEqual([DEFAULT_LIST_ID, "garden"]);
    });

    it("omits it once nothing references it and other lists exist", () => {
      const store = seed({
        lists: { garden: { name: "Garden", position: "a0", createdAt: 1 } },
        items: { x: item({ listId: "garden" }) },
      });
      expect(ids(store)).toEqual(["garden"]);
    });

    it("does not duplicate a real row", () => {
      const store = seed({ lists: { [DEFAULT_LIST_ID]: { createdAt: 7 } }, items: { x: item() } });
      expect(ids(store)).toEqual([DEFAULT_LIST_ID]);
    });
  });

  it("counts unchecked items only, ignoring resurrected partials", () => {
    const store = seed({
      items: {
        a: item({ name: "A" }),
        b: item({ name: "B", position: "a1" }),
        c: item({ name: "C", position: "a2", checked: true }),
        ghost: { name: "D" }, // no listId, no position: a partial, not data
      },
    });
    expect(rosterOf(store)[0].count).toBe(2);
  });

  // Migrated and resurrected rows carry no position on purpose, so the tail of the order has to be
  // deterministic without one.
  it("orders by position, then createdAt, then id", () => {
    const store = seed({
      lists: {
        positioned: { name: "P", position: "a0", createdAt: 9 },
        older: { name: "O", createdAt: 1 },
        zz: { name: "Z", createdAt: 5 },
        aa: { name: "A", createdAt: 5 },
      },
    });
    expect(ids(store)).toEqual(["older", "aa", "zz", "positioned"]);
  });
});

describe("hasList", () => {
  it("accepts the still-virtual default list and rejects a deleted one", () => {
    const store = seed({ items: { x: item() } });
    expect(hasList({ store, id: DEFAULT_LIST_ID })).toBe(true);
    expect(hasList({ store, id: "gone" })).toBe(false);
  });
});

describe("addList", () => {
  it("trims, appends after the positioned rows, and rejects a blank name", () => {
    const store = seed({ lists: { a: { name: "A", position: "a0", createdAt: 0 } } });
    const id = addList({ store, name: "  Garden  " });
    expect(id).not.toBeNull();
    expect(store.getCell("lists", id!, "name")).toBe("Garden");
    expect(store.getCell("lists", id!, "position")).toBe("a1");
    expect(addList({ store, name: "   " })).toBeNull();
    expect(store.getRowCount("lists")).toBe(2);
  });

  it("appends after position-less rows too", () => {
    const store = seed({ lists: { [DEFAULT_LIST_ID]: { createdAt: 0 } } });
    const id = addList({ store, name: "Garden" });
    expect(ids(store)).toEqual([DEFAULT_LIST_ID, id]);
  });

  // The virtual default row shows while it is the whole roster, so a naive append made it vanish and
  // the route redirected off it — closing the picker mid-session.
  it("materializes a still-virtual list instead of evaporating it", () => {
    const store = seed();
    const id = addList({ store, name: "Garden" });
    expect(ids(store)).toEqual([DEFAULT_LIST_ID, id]);
    // createdAt only: freezing the roster must not out-clock a peer's rename or reorder.
    expect(Object.keys(store.getRow("lists", DEFAULT_LIST_ID))).toEqual(["createdAt"]);
  });
});

describe("renameList", () => {
  // Unlike the migration, a rename is user intent and should win LWW — so it may mint the row.
  it("creates the default list's row before the migration does", () => {
    const store = seed({ items: { x: item() } });
    renameList({ store, id: DEFAULT_LIST_ID, name: " Kitchen " });
    expect(store.getRow("lists", DEFAULT_LIST_ID)).toEqual({ name: "Kitchen" });
  });

  it("keeps the old name on blank, and never resurrects an unrelated row", () => {
    const store = seed({ lists: { a: { name: "A", position: "a0", createdAt: 0 } } });
    renameList({ store, id: "a", name: "  " });
    expect(store.getCell("lists", "a", "name")).toBe("A");
    renameList({ store, id: "gone", name: "Ghost" });
    expect(store.hasRow("lists", "gone")).toBe(false);
  });
});

describe("deleteList", () => {
  it("removes the list and its items, sparing the others", () => {
    const store = seed({
      lists: {
        a: { name: "A", position: "a0", createdAt: 0 },
        b: { name: "B", position: "a1", createdAt: 0 },
      },
      items: {
        x: item({ listId: "a", name: "X" }),
        y: item({ listId: "b", name: "Y" }),
      },
    });
    expect(deleteList({ store, id: "a" })).toBe(true);
    expect(store.getRowIds("lists")).toEqual(["b"]);
    expect(store.getRowIds("items")).toEqual(["y"]);
  });

  it("refuses the last list and an id that isn't in the roster", () => {
    const store = seed({ lists: { a: { name: "A", position: "a0", createdAt: 0 } } });
    expect(deleteList({ store, id: "a" })).toBe(false);
    expect(deleteList({ store, id: "gone" })).toBe(false);
    expect(store.getRowIds("lists")).toEqual(["a"]);
  });

  // Its lists row is virtual, so only the items go — after which nothing references it and it drops
  // out of the roster on its own.
  it("empties the still-virtual default list", () => {
    const store = seed({
      lists: { garden: { name: "Garden", position: "a0", createdAt: 0 } },
      items: { x: item(), y: item({ listId: "garden", name: "Y" }) },
    });
    expect(deleteList({ store, id: DEFAULT_LIST_ID })).toBe(true);
    expect(ids(store)).toEqual(["garden"]);
  });
});

describe("reorderLists", () => {
  it("stamps the whole roster on the first drag, when rows still have no position", () => {
    const store = seed({
      lists: {
        [DEFAULT_LIST_ID]: { createdAt: 1 },
        garden: { name: "Garden", createdAt: 2 },
        shed: { name: "Shed", createdAt: 3 },
      },
    });
    reorderLists({ store, activeId: "shed", overId: DEFAULT_LIST_ID });
    expect(ids(store)).toEqual(["shed", DEFAULT_LIST_ID, "garden"]);
    expect(store.getRowIds("lists").every((id) => store.getCell("lists", id, "position"))).toBe(
      true,
    );
  });

  // Only the dragged row and the position-less ones get a key. Stamping the rest puts a new HLC on a
  // cell the user never touched — and an HLC advances with the wall clock, so a later local drag
  // reverts a peer's reorder without ever having observed it.
  it("leaves the rows it didn't move alone", () => {
    const store = seed({
      lists: {
        x: { name: "X", position: "a1", createdAt: 0 },
        y: { name: "Y", position: "a3", createdAt: 0 },
        z: { name: "Z", createdAt: 5 },
      },
    });
    expect(ids(store)).toEqual(["z", "x", "y"]); // no position sorts first
    reorderLists({ store, activeId: "z", overId: "y" });
    expect(ids(store)).toEqual(["x", "y", "z"]);
    expect(store.getCell("lists", "x", "position")).toBe("a1");
    expect(store.getCell("lists", "y", "position")).toBe("a3");
  });

  it("gives a still-virtual list a createdAt when a drag makes it real", () => {
    const store = seed({
      lists: { garden: { name: "Garden", position: "a0", createdAt: 2 } },
      items: { x: item() },
    });
    reorderLists({ store, activeId: DEFAULT_LIST_ID, overId: "garden" });
    const row = store.getRow("lists", DEFAULT_LIST_ID);
    expect(row.position).toBeDefined();
    expect(row.createdAt).toBeDefined(); // else it is a partial, sorting oldest forever
    expect(store.getCell("lists", "garden", "position")).toBe("a0");
  });

  it("moves one row once every position exists", () => {
    const store = seed({
      lists: {
        a: { name: "A", position: "a0", createdAt: 0 },
        b: { name: "B", position: "a1", createdAt: 0 },
        c: { name: "C", position: "a2", createdAt: 0 },
      },
    });
    reorderLists({ store, activeId: "a", overId: "c" });
    expect(ids(store)).toEqual(["b", "c", "a"]);
    expect(store.getCell("lists", "b", "position")).toBe("a1");
  });

  it("is a no-op when dropped on itself or on an unknown row", () => {
    const store = seed({
      lists: {
        a: { name: "A", position: "a0", createdAt: 0 },
        b: { name: "B", position: "a1", createdAt: 0 },
      },
    });
    reorderLists({ store, activeId: "a", overId: "a" });
    reorderLists({ store, activeId: "a", overId: "gone" });
    expect(store.getCell("lists", "a", "position")).toBe("a0");
  });
});

describe("useRosterRepair", () => {
  // Ungated, a fresh device's empty replica loads before the socket lands and writes rows every peer
  // then has to fight — a deleted list resurrected on all of them, forever.
  describe("before the first sync", () => {
    it("writes nothing", () => {
      const store = seed({ items: { x: item() } });
      repair({ store, synced: false });
      expect(store.getRowCount("lists")).toBe(0);
    });
  });

  // "Synced" is not evidence of having received anything: TinyBase resolves startSync() even when the
  // initial content exchange times out, so the gate can open over a replica that holds nothing. Items
  // are the evidence — and with none there is nothing to orphan anyway.
  describe("once synced but with an empty replica", () => {
    it("still writes nothing, so a peer's delete survives", () => {
      const store = seed();
      repair({ store, synced: true });
      expect(store.getRowCount("lists")).toBe(0);
    });
  });

  describe("once synced", () => {
    it("makes the default list real, with createdAt only", () => {
      const store = seed({ items: { x: item() } });
      repair({ store, synced: true });
      const row = store.getRow("lists", DEFAULT_LIST_ID);
      expect(Object.keys(row)).toEqual(["createdAt"]); // a name or position cell would out-clock a peer
    });

    it("resurrects an orphan's list nameless, ignoring partials", () => {
      const store = seed({
        lists: { garden: { name: "Garden", position: "a0", createdAt: 0 } },
        items: {
          x: item({ listId: "hardware", name: "Nails" }),
          ghost: { listId: "nowhere" }, // a partial: no name, no position
        },
      });
      repair({ store, synced: true });
      expect(store.getRowIds("lists").sort()).toEqual(["garden", "hardware"]);
      expect(store.getCell("lists", "hardware", "name")).toBeUndefined();
    });

    // A live subscription, not a boot one-shot: a peer can orphan an item at any moment, and a
    // module-scoped latch would leave the app stuck at zero lists.
    it("repairs an orphan that arrives after mount", () => {
      const store = seed({ lists: { garden: { name: "Garden", position: "a0", createdAt: 0 } } });
      repair({ store, synced: true });
      store.setRow("items", "x", item({ listId: "hardware", name: "Nails" }));
      expect(store.hasRow("lists", "hardware")).toBe(true);
    });

    it("re-seeds a roster a peer emptied", () => {
      const store = seed({
        lists: { garden: { name: "Garden", position: "a0", createdAt: 0 } },
        items: { x: item({ listId: "garden" }) },
      });
      repair({ store, synced: true });
      store.delRow("lists", "garden");
      expect(store.hasRow("lists", DEFAULT_LIST_ID)).toBe(true);
    });
  });
});
