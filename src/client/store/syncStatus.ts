import { createContext, useContext } from "react";
import type { SyncStatus } from "./sync";

export type SyncState = {
  status: SyncStatus;
  /** Sticky once the first sync lands, so later reconnect blips don't make gestures flap. */
  everSynced: boolean;
};

const SyncStateContext = createContext<SyncState>({ status: "disabled", everSynced: false });

export const SyncStateProvider = SyncStateContext.Provider;

/**
 * The single useSync result, published by the `_app` layout: useSync owns a live socket, so it has to
 * mount above the `$listId` boundary where a list switch can't remount it.
 */
export const useSyncState = (): SyncState => useContext(SyncStateContext);
