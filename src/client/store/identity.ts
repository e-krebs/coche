import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

const CACHE_KEY = "shopping:userId";

export const readCachedUserId = (): string | null => {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
};

export const writeCachedUserId = (userId: string): void => {
  try {
    localStorage.setItem(CACHE_KEY, userId);
  } catch {
    // storage unavailable — degrade to online-only
  }
};

export const clearCachedUserId = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
};

export type IdentityStatus = "loading" | "first-run" | "signed-out" | "ready";

export interface Identity {
  status: IdentityStatus;
  userId: string | null;
}

/** The Clerk auth snapshot the gate depends on — a parameter so the logic is testable without it. */
type IdentityAuth = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null | undefined;
};

/**
 * Offline gate: renders the store from a cached userId regardless of Clerk readiness; Clerk, once
 * reachable, is authoritative. Auth is injected so the resolution + cache sync are testable without
 * standing up Clerk (which can't be driven to arbitrary states offline).
 */
export const useIdentityFrom = ({
  isLoaded,
  isSignedIn,
  userId: clerkUserId,
}: IdentityAuth): Identity => {
  // Read once for the offline-first paint. Clerk is authoritative once loaded, so this value is
  // never updated in state — identity is derived during render and localStorage is kept in sync by
  // the Effect below, instead of mirroring Clerk into a second piece of state.
  const [initialCachedUserId] = useState(readCachedUserId);

  const resolvedUserId = isLoaded && isSignedIn && clerkUserId ? clerkUserId : null;

  // Persist the resolved identity so a future offline load renders immediately. Synchronizing an
  // external system (localStorage) is the sanctioned Effect use per the React docs — isLoaded and
  // resolvedUserId are inputs to that sync, not an event to hoist to a parent.
  // https://react.dev/learn/synchronizing-with-effects
  // oxlint-disable react-you-might-not-need-an-effect/no-event-handler
  useEffect(() => {
    if (!isLoaded) return; // offline / still initializing: keep the optimistic cache
    if (resolvedUserId) writeCachedUserId(resolvedUserId);
    else clearCachedUserId();
  }, [isLoaded, resolvedUserId]);
  // oxlint-enable react-you-might-not-need-an-effect/no-event-handler

  if (isLoaded) return { status: resolvedUserId ? "ready" : "signed-out", userId: resolvedUserId };
  if (initialCachedUserId) return { status: "ready", userId: initialCachedUserId };
  // Clerk unreachable, nothing cached: offline needs one online session first.
  return { status: navigator.onLine ? "loading" : "first-run", userId: null };
};

export const useIdentity = (): Identity => useIdentityFrom(useAuth());
