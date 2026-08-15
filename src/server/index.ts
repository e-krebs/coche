import { deriveListId, mintTicket, originAllowed, verifyTicket } from "./auth";
import { verifyClerkUser } from "./clerk";
import type { Env } from "./env";
import { parseWsUrl, type WsTicket } from "shared/contract";

export { ShoppingListDurableObject } from "./durable-object";

const TICKET_TTL_MS = 30_000;

const corsHeaders = (origin: string): Record<string, string> => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "3600",
  Vary: "Origin",
});

const json = ({
  body,
  status,
  origin,
}: {
  body: unknown;
  status: number;
  origin?: string;
}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(origin ? corsHeaders(origin) : {}),
    },
  });

const handleTicket = async (request: Request, env: Env): Promise<Response> => {
  const origin = request.headers.get("Origin");
  if (!originAllowed(origin, env)) return new Response("forbidden", { status: 403 });

  const auth = request.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return json({ body: { error: "unauthorized" }, status: 401, origin });

  const userId = await verifyClerkUser(token, env);
  if (!userId) return json({ body: { error: "unauthorized" }, status: 401, origin });

  const listId = await deriveListId({ secret: env.LIST_ID_SECRET, userId });
  const ticket = await mintTicket(env.TICKET_SECRET, {
    listId,
    exp: Date.now() + TICKET_TTL_MS,
    jti: crypto.randomUUID(),
  });
  const body: WsTicket = { listId, ticket };
  return json({ body, status: 200, origin });
};

// ⚠️ DEV must be unset in prod — DEV=true routes DOs off-EU and remaps every listId (residency
// breach + data loss).
const resolveListStub = (env: Env, listId: string): DurableObjectStub => {
  const ns = env.SHOPPING_LIST;
  if (env.DEV === "true") return ns.get(ns.idFromName(listId));
  const eu = ns.jurisdiction("eu");
  return eu.get(eu.idFromName(listId));
};

const handleWs = async ({
  request,
  env,
  url,
}: {
  request: Request;
  env: Env;
  url: URL;
}): Promise<Response> => {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("expected websocket", { status: 426 });
  }
  // Token is the primary CSWSH defense; Origin is a fail-closed second gate.
  if (!originAllowed(request.headers.get("Origin"), env)) {
    return new Response("forbidden origin", { status: 403 });
  }

  const parsed = parseWsUrl(url);
  if (!parsed) return new Response("unauthorized", { status: 401 });
  const { listId: pathListId, ticket } = parsed;

  const payload = await verifyTicket({ secret: env.TICKET_SECRET, ticket });
  if (!payload || payload.listId !== pathListId) {
    return new Response("unauthorized", { status: 401 });
  }

  const forwardUrl = new URL(request.url);
  forwardUrl.searchParams.delete("ticket");
  const forwardReq = new Request(forwardUrl, request);
  forwardReq.headers.set("X-Ticket-Jti", payload.jti);
  forwardReq.headers.set("X-Ticket-Exp", String(payload.exp));

  return resolveListStub(env, payload.listId).fetch(forwardReq);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws-ticket") {
      if (request.method === "OPTIONS") {
        const origin = request.headers.get("Origin");
        return originAllowed(origin, env)
          ? new Response(null, { status: 204, headers: corsHeaders(origin) })
          : new Response("forbidden", { status: 403 });
      }
      if (request.method === "POST") return handleTicket(request, env);
      return new Response("method not allowed", { status: 405 });
    }

    if (url.pathname.startsWith("/list/")) return handleWs({ request, env, url });

    return new Response("not found", { status: 404 });
  },
};
