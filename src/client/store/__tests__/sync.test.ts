import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "client/__tests__/msw";
import { SigninRequiredError, fetchWsTicket, reconnectDelay } from "client/store/sync";
import { wsUrl } from "shared/contract";

const ARGS = { syncUrl: "http://x", token: "tok" };

// Registers a POST handler for the ticket endpoint; returns an accessor for the request it saw.
const setup = ({ respond }: { respond: () => Response }) => {
  let seen: Request | undefined;
  server.use(
    http.post("http://x/ws-ticket", ({ request }) => {
      seen = request;
      return respond();
    }),
  );
  return () => seen;
};

describe("wsUrl", () => {
  it("upgrades the scheme and encodes the ticket", () => {
    expect(wsUrl({ syncUrl: "http://localhost:8787", listId: "L", ticket: "t k" })).toBe(
      "ws://localhost:8787/list/L?ticket=t%20k",
    );
    expect(wsUrl({ syncUrl: "https://sync.example", listId: "L", ticket: "t" })).toBe(
      "wss://sync.example/list/L?ticket=t",
    );
  });
});

describe("reconnectDelay", () => {
  it("doubles per consecutive failure, up to a cap", () => {
    // The first retry after a healthy drop stays as fast as it was before backoff existed.
    expect(reconnectDelay({ failures: 0 })).toBe(3000);
    expect([1, 2, 3].map((failures) => reconnectDelay({ failures }))).toEqual([
      6000, 12_000, 24_000,
    ]);
    // Capped, not unbounded: a server down for an hour is still retried on the reader's return.
    expect(reconnectDelay({ failures: 4 })).toBe(30_000);
    expect(reconnectDelay({ failures: 40 })).toBe(30_000);
  });
});

describe("fetchWsTicket", () => {
  it("posts the bearer token and returns the ticket", async () => {
    const request = setup({ respond: () => HttpResponse.json({ listId: "L", ticket: "T" }) });
    expect(await fetchWsTicket(ARGS)).toEqual({ listId: "L", ticket: "T" });
    // A POST-only handler matching at all proves the method; assert the auth header it carried.
    expect(request()?.headers.get("Authorization")).toBe("Bearer tok");
  });

  describe("when the server responds 401 or 403", () => {
    it("signals sign-in required", async () => {
      setup({ respond: () => new HttpResponse("no", { status: 401 }) });
      await expect(fetchWsTicket(ARGS)).rejects.toBeInstanceOf(SigninRequiredError);

      setup({ respond: () => new HttpResponse("no", { status: 403 }) });
      await expect(fetchWsTicket(ARGS)).rejects.toBeInstanceOf(SigninRequiredError);
    });
  });
});
