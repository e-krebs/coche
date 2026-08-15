import { z } from "zod";
import type { Env } from "./env";

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64url = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const hmacKey = async (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);

export const splitCsv = (v: string): string[] =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Non-guessable and stable per user; no stored membership in v1. */
export const deriveListId = async ({
  secret,
  userId,
}: {
  secret: string;
  userId: string;
}): Promise<string> => {
  const key = await hmacKey(secret);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(userId))));
};

const ticketSchema = z.object({ listId: z.string(), exp: z.number(), jti: z.string() });
export type TicketPayload = z.infer<typeof ticketSchema>;

export const mintTicket = async (secret: string, payload: TicketPayload): Promise<string> => {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))));
  return `${body}.${sig}`;
};

export const verifyTicket = async ({
  secret,
  ticket,
}: {
  secret: string;
  ticket: string;
}): Promise<TicketPayload | null> => {
  const dot = ticket.indexOf(".");
  if (dot < 0) return null;
  const body = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  // atob throws on a malformed ticket; keep inside try so garbage yields 401, not 500.
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const parsed = ticketSchema.safeParse(JSON.parse(dec.decode(fromB64url(body))));
    if (!parsed.success || parsed.data.exp < Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

export const originAllowed = (origin: string | null, env: Env): origin is string => {
  if (!origin || !splitCsv(env.ALLOWED_ORIGINS).includes(origin)) return false;
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return !isLocal || env.DEV === "true";
};
