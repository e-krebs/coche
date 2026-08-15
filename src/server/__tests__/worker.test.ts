// oxlint-disable typescript/no-deprecated -- SELF is the vitest-pool-workers integration Fetcher;
// the suggested exports.default.fetch() has a different signature/dispatch, not a drop-in.
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { mintTicket } from "server/auth";

const ORIGIN = "http://localhost:3000";
const EVIL = "https://evil.example";

const wsHeaders = (extra: Record<string, string> = {}) => ({
  Upgrade: "websocket",
  Origin: ORIGIN,
  "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
  ...extra,
});

const mint = async (listId: string, opts: { exp?: number; jti?: string } = {}) =>
  mintTicket(env.TICKET_SECRET, {
    listId,
    exp: opts.exp ?? Date.now() + 30_000,
    jti: opts.jti ?? crypto.randomUUID(),
  });

describe("POST /ws-ticket", () => {
  describe("when the Origin is missing", () => {
    it("responds 403", async () => {
      const res = await SELF.fetch("http://x/ws-ticket", { method: "POST" });
      expect(res.status).toBe(403);
    });
  });

  describe("when the Origin is disallowed", () => {
    it("responds 403", async () => {
      const res = await SELF.fetch("http://x/ws-ticket", {
        method: "POST",
        headers: { Origin: EVIL },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("when the Origin is allowed but no token is provided", () => {
    it("responds 401", async () => {
      const res = await SELF.fetch("http://x/ws-ticket", {
        method: "POST",
        headers: { Origin: ORIGIN },
      });
      expect(res.status).toBe(401);
    });
  });
});

describe("WS /list/:listId", () => {
  describe("when the Upgrade header is missing", () => {
    it("responds 426", async () => {
      const res = await SELF.fetch("http://x/list/L?ticket=abc");
      expect(res.status).toBe(426);
    });
  });

  describe("when the Origin is disallowed", () => {
    it("responds 403", async () => {
      const ticket = await mint("L");
      const res = await SELF.fetch(`http://x/list/L?ticket=${encodeURIComponent(ticket)}`, {
        headers: wsHeaders({ Origin: EVIL }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("when no ticket is provided", () => {
    it("responds 401", async () => {
      const res = await SELF.fetch("http://x/list/L", { headers: wsHeaders() });
      expect(res.status).toBe(401);
    });
  });

  describe("when the ticket is bound to a different listId", () => {
    it("responds 401", async () => {
      const ticket = await mint("OTHER");
      const res = await SELF.fetch(`http://x/list/L?ticket=${encodeURIComponent(ticket)}`, {
        headers: wsHeaders(),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("when the ticket is expired", () => {
    it("responds 401", async () => {
      const ticket = await mint("L", { exp: Date.now() - 1 });
      const res = await SELF.fetch(`http://x/list/L?ticket=${encodeURIComponent(ticket)}`, {
        headers: wsHeaders(),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("when the ticket is valid", () => {
    it("upgrades the connection and burns the ticket so a replay is rejected", async () => {
      const ticket = await mint("L", { jti: "burn-me" });
      const url = `http://x/list/L?ticket=${encodeURIComponent(ticket)}`;

      const first = await SELF.fetch(url, { headers: wsHeaders() });
      expect(first.status).toBe(101);
      first.webSocket?.accept();
      first.webSocket?.close();

      const replay = await SELF.fetch(url, { headers: wsHeaders() });
      expect(replay.status).toBe(401);
    });
  });
});
