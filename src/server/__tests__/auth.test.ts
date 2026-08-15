import { describe, expect, it } from "vitest";
import { deriveListId, mintTicket, verifyTicket } from "server/auth";

const SECRET = "list-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TSECRET = "ticket-secret-bbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("deriveListId", () => {
  it("is deterministic, user-specific, and non-guessable", async () => {
    const a1 = await deriveListId({ secret: SECRET, userId: "user_1" });
    const a2 = await deriveListId({ secret: SECRET, userId: "user_1" });
    expect(a1).toBe(a2);
    expect(a1).not.toBe(await deriveListId({ secret: SECRET, userId: "user_2" }));
    expect(a1).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("depends on the server secret", async () => {
    expect(await deriveListId({ secret: SECRET, userId: "user_1" })).not.toBe(
      await deriveListId({ secret: "other", userId: "user_1" }),
    );
  });
});

describe("verifyTicket", () => {
  it("round-trips a valid ticket", async () => {
    const ticket = await mintTicket(TSECRET, { listId: "L", exp: Date.now() + 30_000, jti: "j1" });
    expect(await verifyTicket({ secret: TSECRET, ticket })).toMatchObject({
      listId: "L",
      jti: "j1",
    });
  });

  describe("when the ticket is expired", () => {
    it("returns null", async () => {
      const ticket = await mintTicket(TSECRET, { listId: "L", exp: Date.now() - 1, jti: "j1" });
      expect(await verifyTicket({ secret: TSECRET, ticket })).toBeNull();
    });
  });

  describe("when the ticket is signed with a different secret", () => {
    it("returns null", async () => {
      const ticket = await mintTicket("wrong-secret", {
        listId: "L",
        exp: Date.now() + 30_000,
        jti: "j1",
      });
      expect(await verifyTicket({ secret: TSECRET, ticket })).toBeNull();
    });
  });

  describe("when the payload is tampered", () => {
    it("returns null", async () => {
      const ticket = await mintTicket(TSECRET, {
        listId: "L",
        exp: Date.now() + 30_000,
        jti: "j1",
      });
      const sig = ticket.slice(ticket.indexOf(".") + 1);
      const forgedBody = btoa(
        JSON.stringify({ listId: "EVIL", exp: Date.now() + 30_000, jti: "j1" }),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      expect(await verifyTicket({ secret: TSECRET, ticket: `${forgedBody}.${sig}` })).toBeNull();
    });
  });
});
