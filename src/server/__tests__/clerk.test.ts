import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { subjectFrom, verifyClerkUser } from "server/clerk";

describe("subjectFrom", () => {
  describe("when claims are returned directly", () => {
    it("extracts the subject", () => {
      expect(subjectFrom({ sub: "user_123", azp: "http://localhost:5200" })).toBe("user_123");
    });
  });

  describe("when claims use the documented {data} shape", () => {
    it("extracts the subject", () => {
      expect(subjectFrom({ data: { sub: "user_456" } })).toBe("user_456");
    });
  });

  describe("when the claims carry no subject", () => {
    it("returns null", () => {
      expect(subjectFrom({ azp: "x" })).toBeNull();
    });
  });
});

describe("verifyClerkUser", () => {
  describe("when no authorized parties are configured", () => {
    it("fails closed and returns null", async () => {
      expect(await verifyClerkUser("tok", { ...env, CLERK_AUTHORIZED_PARTIES: "" })).toBeNull();
    });
  });

  describe("when the token is malformed", () => {
    it("returns null", async () => {
      expect(await verifyClerkUser("not-a-jwt", env)).toBeNull();
    });
  });
});
