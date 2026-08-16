import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { z } from "zod";
import { clearCachedUserId, readCachedUserId } from "./identity";
import { clearLastList } from "./lists";
import { dbNameForUser } from "./store";

const AUTH_CHANNEL = "shopping-auth";
const signoutSchema = z.object({ type: z.literal("signout") });

const deleteDatabaseByName = async (name: string): Promise<void> =>
  new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = () => {
      resolve();
    };
    // onblocked: deletion deferred until other tabs close
  });

export const deleteUserDatabase = async (userId: string): Promise<void> => {
  // Only this user's replica — a broad shopping-* sweep would wipe other accounts on a shared
  // device (docs/adr/0005-offline-cached-identity.md).
  await deleteDatabaseByName(dbNameForUser(userId));
};

const postSignOut = (): void => {
  try {
    const ch = new BroadcastChannel(AUTH_CHANNEL);
    ch.postMessage({ type: "signout" });
    ch.close();
  } catch {}
};

/** The Clerk auth snapshot the teardown depends on — a parameter so the logic is testable without it. */
type TeardownAuth = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null | undefined;
};

/**
 * Deletes the local replica when Clerk resolves signed-out. lastUserId is seeded from the cache
 * (not just an observed sign-in) so a boot straight into an expired session still wipes a shared
 * device, and held in a ref so the delete survives a concurrent cache clear. Auth is injected so the
 * transition is testable without standing up Clerk (which can't be driven to arbitrary states).
 */
export const useSignOutTeardownFrom = ({ isLoaded, isSignedIn, userId }: TeardownAuth): void => {
  const lastUserId = useRef<string | null>(readCachedUserId());

  // Synchronizing external systems (localStorage, IndexedDB, a BroadcastChannel) with a resolved
  // auth state, not hoisting an event: the caller has nowhere above it to put a database delete.
  // https://react.dev/learn/synchronizing-with-effects
  // oxlint-disable react-you-might-not-need-an-effect/no-event-handler
  useEffect(() => {
    if (!isLoaded) return; // offline / still resolving: keep the optimistic replica
    if (isSignedIn && userId) {
      lastUserId.current = userId;
      return;
    }
    clearCachedUserId();
    clearLastList(); // else the next user on this device lands on a list id that isn't theirs
    postSignOut();
    const gone = lastUserId.current;
    lastUserId.current = null;
    if (gone) void deleteUserDatabase(gone);
  }, [isLoaded, isSignedIn, userId]);
  // oxlint-enable react-you-might-not-need-an-effect/no-event-handler

  useEffect(() => {
    let ch: BroadcastChannel | undefined;
    try {
      ch = new BroadcastChannel(AUTH_CHANNEL);
      ch.onmessage = (e: MessageEvent) => {
        if (signoutSchema.safeParse(e.data).success) clearCachedUserId();
      };
    } catch {}
    return () => ch?.close();
  }, []);
};

export const useSignOutTeardown = (): void => {
  useSignOutTeardownFrom(useAuth());
};
