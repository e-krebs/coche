import { useEffect, useState, type ReactNode } from "react";
import {
  Provider,
  useCreateMergeableStore,
  useCreatePersister,
  createMergeableIndexedDbPersister,
  createShoppingStore,
  dbNameForUser,
} from "./store";

export const StoreProvider = ({ userId, children }: { userId: string; children: ReactNode }) => {
  const store = useCreateMergeableStore(createShoppingStore);
  // Hold children until the local load finishes — paint the populated list in one frame, no
  // empty-state flash.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if ("storage" in navigator && "persist" in navigator.storage) void navigator.storage.persist();
  }, []);

  useCreatePersister(
    store,
    (s) => createMergeableIndexedDbPersister(s, dbNameForUser(userId)),
    [userId],
    async (persister) => {
      await persister.startAutoLoad().catch(() => {});
      setLoaded(true);
      await persister.startAutoSave();
    },
    [userId],
  );

  return <Provider store={store}>{loaded ? children : null}</Provider>;
};
