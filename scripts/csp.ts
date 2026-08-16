import { readFileSync } from "node:fs";
import { loadEnv } from "vite";

export interface CspHeader {
  name: string;
  value: string;
}

/**
 * Reads a `_headers`-style file's Content-Security-Policy(-Report-Only) line and splits it into the
 * header name and value. Shared by vite.config.ts (to set the same header on server/preview),
 * gen-headers.ts (to emit dist/_headers) and check-csp.ts (to validate the policies stay in sync
 * and well-formed).
 */
export const readCspFile = (path: string): CspHeader => {
  const line = readFileSync(path, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("Content-Security-Policy"));
  if (!line) throw new Error(`No Content-Security-Policy header found in ${path}`);
  const i = line.indexOf(":");
  return { name: line.slice(0, i).trim(), value: line.slice(i + 1).trim() };
};

export const DEV_FILE = "csp/dev.headers";
export const PROD_TEMPLATE = "csp/prod.headers.template";
export const PROD_OUTPUT = "dist/_headers";

/**
 * Clerk encodes the instance's Frontend API host in the publishable key itself. The trim matters:
 * a key whose base64 carries a trailing newline would otherwise keep its `$` terminator.
 */
export const fapiHostFromPublishableKey = (key: string): string =>
  Buffer.from(key.replace(/^pk_(test|live)_/, ""), "base64")
    .toString("utf8")
    .trim()
    .replace(/\$$/, "");

export const hostFromUrl = (url: string): string => new URL(url).host;

const TOKENS = ["%FAPI_HOST%", "%SYNC_HOST%"];

/**
 * Substitutes the deployment's hosts into the template; they are never committed. An empty host is
 * left as its token, so the unresolved-token gate catches it instead of shipping a bare `https://`.
 */
export const resolveTemplate = ({
  template,
  fapiHost,
  syncHost,
}: {
  template: string;
  fapiHost: string;
  syncHost: string;
}): string => {
  const withFapi = fapiHost ? template.replaceAll("%FAPI_HOST%", fapiHost) : template;
  return syncHost ? withFapi.replaceAll("%SYNC_HOST%", syncHost) : withFapi;
};

export const unresolvedTokens = (value: string): string[] =>
  TOKENS.filter((t) => value.includes(t));

/**
 * Vite's own env resolution, so the generator and the gate can never disagree with the bundle about
 * which key is in play — same file precedence (`.env`, `.env.local`, `.env.<mode>`,
 * `.env.<mode>.local`), same dotenv parser, same `process.env` override.
 */
export const resolveViteEnv = (mode = "production"): Record<string, string> =>
  loadEnv(mode, process.cwd(), "VITE_");

const INJECTABLE = ["VITE_CLERK_PUBLISHABLE_KEY", "VITE_SYNC_URL"];

/** Runs `fn` with the build-time vars hidden, so a resolution sees only what env files provide. */
export const withoutInjectedViteVars = <T>(fn: () => T): T => {
  const saved = Object.fromEntries(
    INJECTABLE.filter((k) => k in process.env).map((k) => [k, process.env[k]]),
  );
  for (const k of Object.keys(saved)) delete process.env[k];
  try {
    return fn();
  } finally {
    Object.assign(process.env, saved);
  }
};
