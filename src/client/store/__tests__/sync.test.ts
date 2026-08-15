import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "client/__tests__/msw";
import { SigninRequiredError, fetchWsTicket } from "client/store/sync";
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
