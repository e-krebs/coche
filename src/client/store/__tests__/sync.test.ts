import { describe, expect, it } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { server } from "client/__tests__/msw";
import {
  SigninRequiredError,
  createTokenRequest,
  fetchWsTicket,
  reconnectDelay,
  refusalStatus,
  withTimeout,
} from "client/store/sync";
import { wsUrl } from "shared/contract";

const ARGS = { syncUrl: "http://x", token: "tok" };

// Registers a POST handler for the ticket endpoint; returns an accessor for the request it saw.
const setup = ({ respond }: { respond: () => Response | Promise<Response> }) => {
  let seen: Request | undefined;
  server.use(
    http.post("http://x/ws-ticket", async ({ request }) => {
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

describe("refusalStatus", () => {
  it("waits for a second refusal before naming the reader signed out", () => {
    // A lost token refresh must not accuse a signed-in reader — the retry settles it 3s later.
    expect(refusalStatus({ refusals: 1 })).toBe("connecting");
    expect(refusalStatus({ refusals: 2 })).toBe("signin-required");
    expect(refusalStatus({ refusals: 9 })).toBe("signin-required");
  });
});

describe("withTimeout", () => {
  it("rejects once the deadline passes, and stays out of the way otherwise", async () => {
    // The point of the deadline: a wait nobody else times out would leave the retry loop with no
    // timer armed at all.
    await expect(withTimeout({ promise: new Promise(() => {}), ms: 20 })).rejects.toThrow(
      /timed out/,
    );
    await expect(withTimeout({ promise: Promise.resolve("tok"), ms: 20 })).resolves.toBe("tok");
    // A real failure has to surface as itself, not get repackaged as a deadline.
    await expect(
      withTimeout({ promise: Promise.reject(new Error("clerk gave up")), ms: 20 }),
    ).rejects.toThrow("clerk gave up");
  });
});

// Hands back the token requester plus the resolvers of every call it made, so a test can count
// ladders and settle them one at a time.
const setupTokenRequest = () => {
  const releases: ((token: string) => void)[] = [];
  const requestToken = createTokenRequest({
    getToken: async () =>
      new Promise<string>((resolve) => {
        releases.push(resolve);
      }),
  });
  return { requestToken, releases };
};

describe("createTokenRequest", () => {
  it("shares one in-flight call, and asks again once it settles", async () => {
    const { requestToken, releases } = setupTokenRequest();
    const first = requestToken();
    // The retry a deadline arms: Clerk is still retrying behind the first call, so a second one
    // would race a second ladder against it.
    const second = requestToken();
    expect(releases).toHaveLength(1);

    releases[0]?.("tok");
    expect(await first).toBe("tok");
    expect(await second).toBe("tok");

    // Settled means the ladder is done — the next attempt must not replay that token.
    const third = requestToken();
    expect(releases).toHaveLength(2);
    releases[1]?.("fresh");
    expect(await third).toBe("fresh");
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

  describe("when the server never answers", () => {
    it("aborts rather than hanging, and not as a refusal", async () => {
      setup({
        respond: async () => {
          await delay(2000);
          return HttpResponse.json({ listId: "L", ticket: "T" });
        },
      });
      const failure = await fetchWsTicket({ ...ARGS, timeoutMs: 20 }).catch((err: unknown) => err);
      // Pin the name, not just `instanceof Error`: an environment without `AbortSignal.timeout`
      // would throw a TypeError that satisfies every weaker assertion here.
      expect(failure).toHaveProperty("name", "TimeoutError");
      // A hang says nothing about the reader's session, so the retry ladder — not the sign-in
      // notice — has to be what picks it up.
      expect(failure).not.toBeInstanceOf(SigninRequiredError);
    });
  });
});
