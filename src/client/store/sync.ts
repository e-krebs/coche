import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { createWsSynchronizer } from "tinybase/synchronizers/synchronizer-ws-client/with-schemas";
import type { MergeableStore, Store } from "tinybase/with-schemas";
import { env } from "client/env";
import type { Schemas } from "./schema";
import { z } from "zod";
import { wsUrl, type WsTicket } from "shared/contract";

export type SyncStatus = "disabled" | "offline" | "connecting" | "synced" | "signin-required";

const RECONNECT_DELAY_MS = 3000;

export class SigninRequiredError extends Error {}

const wsTicketSchema = z.object({ listId: z.string(), ticket: z.string() });

export const fetchWsTicket = async ({
  syncUrl,
  token,
}: {
  syncUrl: string;
  token: string;
}): Promise<WsTicket> => {
  const res = await fetch(`${syncUrl}/ws-ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new SigninRequiredError();
  if (!res.ok) throw new Error(`ws-ticket failed: ${res.status}`);
  const parsed = wsTicketSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("malformed ws-ticket response");
  return parsed.data;
};

type Disposable = { startSync: () => Promise<unknown>; destroy: () => Promise<unknown> };

/**
 * Owns the socket lifecycle: each (re)connect mints a fresh single-use ticket, never replaying a
 * stale one. Accepts the base Store useStore returns, though StoreProvider only supplies the
 * MergeableStore createWsSynchronizer needs.
 */
export const useSync = (store: Store<Schemas> | undefined): SyncStatus => {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [status, setStatus] = useState<SyncStatus>(env.syncUrl ? "connecting" : "disabled");

  // Synchronizing with Effects, not the "you might not need an effect" anti-pattern: this owns a
  // live WebSocket (connect / reconnect / teardown), the sanctioned Effect use per the React docs,
  // and useSyncExternalStore cannot model a reconnecting socket.
  // https://react.dev/learn/synchronizing-with-effects
  // oxlint-disable react-you-might-not-need-an-effect/no-external-store-subscription, react-you-might-not-need-an-effect/no-adjust-state-on-prop-change
  useEffect(() => {
    const syncUrl = env.syncUrl;
    if (!syncUrl) {
      setStatus("disabled");
      return undefined;
    }
    if (!store) return undefined;

    let cancelled = false;
    let ws: WebSocket | undefined;
    let synchronizer: Disposable | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bumped per connect() so a superseded slow attempt bails instead of racing the winner
    // (duplicate sockets, orphaned synchronizer, double-burnt ticket).
    let generation = 0;

    const cleanup = async () => {
      if (timer) clearTimeout(timer);
      const s = synchronizer;
      const w = ws;
      synchronizer = undefined;
      ws = undefined;
      try {
        await s?.destroy();
      } catch {}
      try {
        w?.close();
      } catch {}
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer); // a close handler + a failed connect must not stack timers
      timer = setTimeout(() => void connect(), RECONNECT_DELAY_MS);
    };

    const connect = async () => {
      const gen = ++generation;
      const stale = () => cancelled || gen !== generation;
      await cleanup();
      if (stale()) return;
      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }
      // Clerk still resolving — don't flash "signed out" prematurely.
      if (!isLoaded) {
        setStatus("connecting");
        return;
      }
      if (!isSignedIn) {
        setStatus("signin-required");
        return;
      }
      setStatus("connecting");
      try {
        const token = await getTokenRef.current();
        if (stale()) return;
        if (!token) throw new SigninRequiredError();
        const { listId, ticket } = await fetchWsTicket({ syncUrl, token });
        if (stale()) return;
        const socket = new WebSocket(wsUrl({ syncUrl, listId, ticket }));
        // Attach before the awaits below, or a close during setup is missed — status stuck on a
        // dead socket, no reconnect.
        socket.addEventListener("close", () => {
          if (stale()) return; // a superseded socket closing must not schedule a reconnect
          setStatus(navigator.onLine ? "connecting" : "offline");
          scheduleReconnect();
        });
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see this hook's JSDoc
        const sync = await createWsSynchronizer(store as MergeableStore<Schemas>, socket);
        // Superseded while awaiting: tear down what we opened rather than orphan the winner's
        // connection.
        if (stale()) {
          await sync.destroy().catch(() => {});
          try {
            socket.close();
          } catch {}
          return;
        }
        ws = socket;
        synchronizer = sync;
        await sync.startSync();
        if (stale()) return;
        setStatus("synced");
      } catch (err) {
        if (stale()) return;
        if (err instanceof SigninRequiredError) {
          setStatus("signin-required");
          return;
        }
        setStatus("offline");
        scheduleReconnect();
      }
    };

    const onOnline = () => {
      // A spurious online event must not tear down a healthy socket and burn a ticket — reconnect
      // only when none is live.
      if (ws?.readyState === WebSocket.OPEN) return;
      void connect();
    };
    const onOffline = () => {
      setStatus("offline");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void connect();

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      void cleanup();
    };
  }, [store, isSignedIn, isLoaded]);
  // oxlint-enable react-you-might-not-need-an-effect/no-external-store-subscription, react-you-might-not-need-an-effect/no-adjust-state-on-prop-change

  return status;
};
