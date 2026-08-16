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

/**
 * Deletes the local replica when Clerk resolves signed-out. lastUserId is seeded from the cache
 * (not just an observed sign-in) so a boot straight into an expired session still wipes a shared
 * device, and held in a ref so the delete survives a concurrent cache clear.
 */
export const useSignOutTeardown = (): void => {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const lastUserId = useRef<string | null>(readCachedUserId());

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
