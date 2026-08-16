import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  createMergeableIndexedDbPersister,
  createShoppingStore,
  dbNameForUser,
} from "client/store/store";
import { DEFAULT_LIST_ID } from "client/store/schema";
import { deleteUserDatabase, useSignOutTeardownFrom } from "client/store/teardown";

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

// Auth is injected (the useIdentityFrom seam) because Clerk can't be driven to a signed-out state
// here and the no-mocking policy rules out faking the hook.
const setup = ({ isSignedIn, userId }: { isSignedIn: boolean; userId: string | null }) => {
  localStorage.setItem("shopping:userId", "user_a");
  localStorage.setItem("shopping:lastList", "garden");
  renderHook(() => {
    useSignOutTeardownFrom({ isLoaded: true, isSignedIn, userId });
  });
  return {
    cached: () => localStorage.getItem("shopping:userId"),
    lastList: () => localStorage.getItem("shopping:lastList"),
  };
};

describe("useSignOutTeardownFrom", () => {
  describe("when Clerk resolves signed-out", () => {
    // The list hint has to go with the identity: left behind, the next user on a shared device lands
    // on a list id that isn't theirs.
    it("clears the cached identity and the last-used list", () => {
      const ui = setup({ isSignedIn: false, userId: null });
      expect(ui.cached()).toBeNull();
      expect(ui.lastList()).toBeNull();
    });
  });

  describe("when Clerk resolves signed-in", () => {
    it("keeps both", () => {
      const ui = setup({ isSignedIn: true, userId: "user_a" });
      expect(ui.cached()).toBe("user_a");
      expect(ui.lastList()).toBe("garden");
    });
  });
});
