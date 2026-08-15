import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { readCachedUserId, useIdentityFrom, writeCachedUserId } from "client/store/identity";

type Auth = Parameters<typeof useIdentityFrom>[0];

const setup = ({
  auth,
  online = true,
  cached,
}: {
  auth: Auth;
  online?: boolean;
  cached?: string;
}) => {
  if (cached) writeCachedUserId(cached);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: online });
  return renderHook(() => useIdentityFrom(auth));
};

describe("useIdentityFrom", () => {
  describe("when signed in and Clerk is loaded", () => {
    it("is ready and caches the userId", async () => {
      const { result } = setup({ auth: { isLoaded: true, isSignedIn: true, userId: "user_1" } });
      expect(result.current).toEqual({ status: "ready", userId: "user_1" });
      await waitFor(() => {
        expect(readCachedUserId()).toBe("user_1");
      });
    });
  });

  describe("when signed out and Clerk is loaded", () => {
    it("is signed-out and clears a stale cache", async () => {
      const { result } = setup({
        auth: { isLoaded: true, isSignedIn: false, userId: null },
        cached: "user_old",
      });
      expect(result.current.status).toBe("signed-out");
      await waitFor(() => {
        expect(readCachedUserId()).toBeNull();
      });
    });
  });

  describe("when Clerk is not loaded but a userId is cached", () => {
    it("is ready (offline-first boot)", () => {
      const { result } = setup({
        auth: { isLoaded: false, isSignedIn: false, userId: null },
        cached: "user_cached",
      });
      expect(result.current).toEqual({ status: "ready", userId: "user_cached" });
      // stays cached: Clerk is not authoritative while unreachable
      expect(readCachedUserId()).toBe("user_cached");
    });
  });

  describe("when Clerk is not loaded, there is no cache, and the device is online", () => {
    it("is loading", () => {
      const { result } = setup({
        auth: { isLoaded: false, isSignedIn: undefined, userId: undefined },
      });
      expect(result.current).toEqual({ status: "loading", userId: null });
    });
  });

  describe("when Clerk is not loaded, there is no cache, and the device is offline", () => {
    it("is first-run", () => {
      const { result } = setup({
        auth: { isLoaded: false, isSignedIn: undefined, userId: undefined },
        online: false,
      });
      expect(result.current).toEqual({ status: "first-run", userId: null });
    });
  });

  describe("when Clerk confirms a different user (shared device)", () => {
    it("switches the cache to that user", async () => {
      const { result } = setup({
        auth: { isLoaded: true, isSignedIn: true, userId: "user_b" },
        cached: "user_a",
      });
      expect(result.current).toEqual({ status: "ready", userId: "user_b" });
      await waitFor(() => {
        expect(readCachedUserId()).toBe("user_b");
      });
    });
  });
});
