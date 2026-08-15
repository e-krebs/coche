import { readFileSync } from "node:fs";
import { loadEnv } from "vite";

/**
 * Reads a `_headers`-style file's Content-Security-Policy(-Report-Only) line and splits it into the
 * header name and value. Shared by vite.config.js (to set the same header on server/preview),
 * gen-headers.mjs (to emit dist/_headers) and check-csp.mjs (to validate the policies stay in sync
 * and well-formed).
 */
export const readCspFile = (path) => {
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
export const fapiHostFromPublishableKey = (key) =>
  Buffer.from(key.replace(/^pk_(test|live)_/, ""), "base64")
    .toString("utf8")
    .trim()
    .replace(/\$$/, "");

export const hostFromUrl = (url) => new URL(url).host;

const TOKENS = ["%FAPI_HOST%", "%SYNC_HOST%"];

/**
 * Substitutes the deployment's hosts into the template; they are never committed. An empty host is
 * left as its token, so the unresolved-token gate catches it instead of shipping a bare `https://`.
 */
export const resolveTemplate = ({ template, fapiHost, syncHost }) => {
  const withFapi = fapiHost ? template.replaceAll("%FAPI_HOST%", fapiHost) : template;
  return syncHost ? withFapi.replaceAll("%SYNC_HOST%", syncHost) : withFapi;
};

export const unresolvedTokens = (value) => TOKENS.filter((t) => value.includes(t));

/**
 * Vite's own env resolution, so the generator and the gate can never disagree with the bundle about
 * which key is in play — same file precedence (`.env`, `.env.local`, `.env.<mode>`,
 * `.env.<mode>.local`), same dotenv parser, same `process.env` override.
 */
export const resolveViteEnv = (mode = "production") => loadEnv(mode, process.cwd(), "VITE_");
