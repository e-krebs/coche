// oxlint-disable typescript/no-deprecated -- SELF is the vitest-pool-workers integration Fetcher;
// the suggested exports.default.fetch() has a different signature/dispatch, not a drop-in.
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { mintTicket } from "server/auth";
import { IDLE_MS } from "server/durable-object";

const ORIGIN = "http://localhost:3000";

const wsHeaders = (extra: Record<string, string> = {}) => ({
  Upgrade: "websocket",
  Origin: ORIGIN,
  "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
  ...extra,
});

const setup = async ({ listId }: { listId: string }) => {
  const ticket = await mintTicket(env.TICKET_SECRET, {
    listId,
    exp: Date.now() + 30_000,
    jti: crypto.randomUUID(),
  });
  const res = await SELF.fetch(`http://x/list/${listId}?ticket=${encodeURIComponent(ticket)}`, {
    headers: wsHeaders(),
  });
  res.webSocket?.accept();
  return {
    status: res.status,
    socket: res.webSocket,
    stub: env.SHOPPING_LIST.get(env.SHOPPING_LIST.idFromName(listId)),
  };
};

describe("idle socket alarm", () => {
  describe("when a socket has been idle past the threshold", () => {
    it("closes it with reason 'idle'", async () => {
      const { status, socket, stub } = await setup({ listId: "IDLE" });
      expect(status).toBe(101);

      const closed = new Promise<CloseEvent>((resolve) => {
        socket?.addEventListener("close", resolve);
      });

      await runInDurableObject(stub, (_instance, state) => {
        const [ws] = state.getWebSockets();
        ws.serializeAttachment({ lastSeen: Date.now() - IDLE_MS - 1000 });
      });

      expect(await runDurableObjectAlarm(stub)).toBe(true);
      expect((await closed).reason).toBe("idle");
    });
  });

  describe("when a socket is still active", () => {
    it("keeps it open and reschedules the alarm", async () => {
      const { stub } = await setup({ listId: "ACTIVE" });

      await runInDurableObject(stub, (_instance, state) => {
        const [ws] = state.getWebSockets();
        ws.serializeAttachment({ lastSeen: Date.now() });
      });

      expect(await runDurableObjectAlarm(stub)).toBe(true);
      await runInDurableObject(stub, async (_instance, state) => {
        expect(state.getWebSockets()).toHaveLength(1);
        expect(await state.storage.getAlarm()).not.toBeNull();
      });
    });
  });
});
