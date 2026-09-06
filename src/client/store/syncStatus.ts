import { createContext, useContext } from "react";
import type { SyncStatus } from "./sync";

export type SyncState = {
  status: SyncStatus;
  /** Sticky once the first sync lands, so later reconnect blips don't make gestures flap. */
  everSynced: boolean;
};

/**
 * The stickiness rule behind `everSynced`, applied during render by the `_app` layout. Idempotent,
 * which is what makes that safe — React re-runs the component until the state settles.
 */
export const nextEverSynced = ({
  everSynced,
  status,
}: {
  everSynced: boolean;
  status: SyncStatus;
}): boolean => everSynced || status === "synced";

const SyncStateContext = createContext<SyncState>({ status: "disabled", everSynced: false });

export const SyncStateProvider = SyncStateContext.Provider;

/**
 * The single useSync result, published by the `_app` layout: useSync owns a live socket, so it has to
 * mount above the `$listId` boundary where a list switch can't remount it.
 */
export const useSyncState = (): SyncState => useContext(SyncStateContext);
