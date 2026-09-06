import { describe, expect, it } from "vitest";
import { nextEverSynced } from "client/store/syncStatus";

/**
 * The stickiness rule behind `everSynced`. Only the rule: the `_app` layout that applies it mounts
 * `useSync`, which reaches Clerk's `useAuth` and throws outside a provider. No tier picks up the
 * rest — the sync tier takes a session off `synced` and back, but asserts the badge and the strip,
 * both functions of `status` alone ([docs/reference/testing.md](../../../../docs/reference/testing.md)).
 */
describe("nextEverSynced", () => {
  // The gate feeds roster repair, which must not run against a replica that hasn't arrived yet.
  it("stays shut until a sync lands", () => {
    expect(nextEverSynced({ everSynced: false, status: "connecting" })).toBe(false);
    expect(nextEverSynced({ everSynced: false, status: "offline" })).toBe(false);
    expect(nextEverSynced({ everSynced: false, status: "signin-required" })).toBe(false);
    // Local-only included: it never syncs, so the rule keeps saying no and `_app` opens the gate
    // beside it rather than folding "disabled" in here.
    expect(nextEverSynced({ everSynced: false, status: "disabled" })).toBe(false);
  });

  it("latches on the first synced status", () => {
    expect(nextEverSynced({ everSynced: false, status: "synced" })).toBe(true);
  });

  // The property the latch exists for: a reconnect blip drops the status but must not close the
  // gate, or roster repair and the gesture locks would flap with the socket.
  it("stays latched once the status leaves synced", () => {
    expect(nextEverSynced({ everSynced: true, status: "connecting" })).toBe(true);
    expect(nextEverSynced({ everSynced: true, status: "offline" })).toBe(true);
    expect(nextEverSynced({ everSynced: true, status: "signin-required" })).toBe(true);
  });

  // Idempotent, which is what makes it safe to apply during render: React re-runs the component
  // until the state settles, and StrictMode runs that twice.
  it("settles in one pass", () => {
    const once = nextEverSynced({ everSynced: false, status: "synced" });
    expect(nextEverSynced({ everSynced: once, status: "synced" })).toBe(once);
  });
});
