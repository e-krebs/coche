import { describe, expect, it } from "vitest";
import {
  createMergeableIndexedDbPersister,
  createShoppingStore,
  dbNameForUser,
} from "client/store/store";
import { DEFAULT_LIST_ID } from "client/store/schema";
import { deleteUserDatabase } from "client/store/teardown";

describe("deleteUserDatabase", () => {
  it("wipes the signed-out user's local replica", async () => {
    const userId = "user_teardown";
    const store = createShoppingStore();
    const persister = createMergeableIndexedDbPersister(store, dbNameForUser(userId));
    await persister.startAutoLoad();
    store.setRow("items", "i1", {
      listId: DEFAULT_LIST_ID,
      name: "Secret",
      checked: false,
      position: "a0",
      createdAt: 0,
    });
    await persister.save();
    await persister.destroy();

    await deleteUserDatabase(userId);

    const reloaded = createShoppingStore();
    const persister2 = createMergeableIndexedDbPersister(reloaded, dbNameForUser(userId));
    await persister2.load();
    expect(reloaded.getRowIds("items")).toHaveLength(0);
    await persister2.destroy();
  });
});
