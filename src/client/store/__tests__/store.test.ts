import { describe, expect, it } from "vitest";
import { generateKeyBetween } from "fractional-indexing";
import {
  createMergeableIndexedDbPersister,
  createShoppingStore,
  dbNameForUser,
  newItemId,
} from "client/store/store";
import { DEFAULT_LIST_ID } from "client/store/schema";

const addItem = ({
  store,
  name,
  position,
}: {
  store: ReturnType<typeof createShoppingStore>;
  name: string;
  position: string;
}) =>
  store.setRow("items", crypto.randomUUID(), {
    listId: DEFAULT_LIST_ID,
    name,
    checked: false,
    position,
    createdAt: 0,
  });

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newItemId", () => {
  it("is a unique v4 UUID", () => {
    expect(newItemId()).toMatch(UUID_V4);
    expect(newItemId()).not.toBe(newItemId());
  });

  describe("when randomUUID is unavailable (insecure context)", () => {
    it("falls back to a unique v4 UUID", () => {
      const desc = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
      Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
      try {
        expect(newItemId()).toMatch(UUID_V4);
        expect(newItemId()).not.toBe(newItemId());
      } finally {
        if (desc) Object.defineProperty(crypto, "randomUUID", desc);
        else delete (crypto as { randomUUID?: unknown }).randomUUID;
      }
    });
  });
});

describe("createShoppingStore", () => {
  it("sorts items by position, breaking ties by rowId", () => {
    const store = createShoppingStore();
    const a = generateKeyBetween(null, null);
    const b = generateKeyBetween(a, null);
    addItem({ store, name: "B", position: b });
    addItem({ store, name: "A", position: a });
    const names = store
      .getSortedRowIds("items", "position")
      .map((id) => store.getCell("items", id, "name"));
    expect(names).toEqual(["A", "B"]);
  });

  it("merges two offline replicas of the same list conflict-free", () => {
    const a = createShoppingStore();
    const b = createShoppingStore();
    const pos = generateKeyBetween(null, null);
    addItem({ store: a, name: "Apples", position: pos });
    addItem({ store: b, name: "Bread", position: generateKeyBetween(pos, null) });

    a.merge(b); // merge is bidirectional

    const names = a
      .getSortedRowIds("items", "position")
      .map((id) => a.getCell("items", id, "name"))
      .sort((x, y) => String(x).localeCompare(String(y)));
    expect(names).toEqual(["Apples", "Bread"]);
  });
});

describe("createMergeableIndexedDbPersister", () => {
  it("persists mergeable content to IndexedDB and reloads into a fresh store", async () => {
    const dbName = dbNameForUser("user_persist");

    const store = createShoppingStore();
    const persister = createMergeableIndexedDbPersister(store, dbName);
    await persister.startAutoLoad();
    await persister.startAutoSave();
    addItem({ store, name: "Milk", position: generateKeyBetween(null, null) });
    await persister.save();
    await persister.destroy();

    const reloaded = createShoppingStore();
    const persister2 = createMergeableIndexedDbPersister(reloaded, dbName);
    await persister2.load();
    const ids = reloaded.getRowIds("items");
    expect(ids).toHaveLength(1);
    expect(reloaded.getCell("items", ids[0], "name")).toBe("Milk");
    await persister2.destroy();
  });

  // Mergeable (not StoreOnly) persister: HLC timestamps + tombstones must survive reload, else an
  // offline edit clobbers a newer remote edit and a delete resurrects. Both cases below fail with
  // the built-in StoreOnly.
  describe("when a newer remote edit exists", () => {
    it("preserves the HLC across reload so the edit is not clobbered", async () => {
      const dbName = dbNameForUser("user_hlc");
      const a = createShoppingStore();
      addItem({ store: a, name: "Milk", position: generateKeyBetween(null, null) });
      const [x] = a.getRowIds("items");

      // B observes A's write, then makes a strictly-later edit (higher HLC).
      const b = createShoppingStore();
      b.merge(a);
      b.setCell("items", x, "checked", true);

      const pa = createMergeableIndexedDbPersister(a, dbName);
      await pa.save();
      await pa.destroy();

      const a2 = createShoppingStore();
      const pa2 = createMergeableIndexedDbPersister(a2, dbName);
      await pa2.load();
      a2.merge(b);

      expect(a2.getCell("items", x, "checked")).toBe(true);
      await pa2.destroy();
    });
  });

  describe("when an item was deleted before reload", () => {
    it("does not resurrect it on sync", async () => {
      const dbName = dbNameForUser("user_tombstone");
      const a = createShoppingStore();
      addItem({ store: a, name: "Milk", position: generateKeyBetween(null, null) });
      const [x] = a.getRowIds("items");

      const b = createShoppingStore();
      b.merge(a);
      a.delRow("items", x); // A deletes it (strictly later than B's copy)

      const pa = createMergeableIndexedDbPersister(a, dbName);
      await pa.save();
      await pa.destroy();

      const a2 = createShoppingStore();
      const pa2 = createMergeableIndexedDbPersister(a2, dbName);
      await pa2.load();
      a2.merge(b);

      expect(a2.hasRow("items", x)).toBe(false);
      await pa2.destroy();
    });
  });
});
