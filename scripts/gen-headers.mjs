import { readFileSync, writeFileSync } from "node:fs";
import {
  fapiHostFromPublishableKey,
  hostFromUrl,
  PROD_OUTPUT,
  PROD_TEMPLATE,
  resolveTemplate,
  resolveViteEnv,
  unresolvedTokens,
} from "./csp.mjs";

// `vite build` defaults to mode=production, so an unflagged run must resolve env the same way.
const modeIndex = process.argv.indexOf("--mode");
const mode = (modeIndex === -1 ? undefined : process.argv[modeIndex + 1]) ?? "production";
const env = resolveViteEnv(mode);

const key = env.VITE_CLERK_PUBLISHABLE_KEY;
if (!key) {
  console.error(`gen-headers: VITE_CLERK_PUBLISHABLE_KEY is required to resolve ${PROD_TEMPLATE}`);
  process.exit(1);
}

// A key that decodes to nothing, or to something that isn't a host, would otherwise resolve to a
// bare `https://` source. The host isn't echoed: only the raw key is masked in public CI logs.
const fapiHost = fapiHostFromPublishableKey(key);
if (!/^[a-z0-9.-]+$/i.test(fapiHost)) {
  console.error("gen-headers: VITE_CLERK_PUBLISHABLE_KEY does not decode to a Frontend API host");
  process.exit(1);
}

const syncUrl = env.VITE_SYNC_URL;
let template = readFileSync(PROD_TEMPLATE, "utf8");

// No sync URL means a local-only build (see .env.sample), so the Worker sources are dropped rather
// than resolved to something bogus — anything the strip misses trips the token gate below.
if (!syncUrl) template = template.replaceAll(/ [a-z]+:\/\/%SYNC_HOST%/g, "");

const resolved = resolveTemplate({
  template,
  fapiHost,
  syncHost: syncUrl ? hostFromUrl(syncUrl) : "",
});

const leftover = unresolvedTokens(resolved);
if (leftover.length) {
  console.error(`gen-headers: unresolved token(s) in ${PROD_TEMPLATE}: ${leftover.join(", ")}`);
  process.exit(1);
}

writeFileSync(PROD_OUTPUT, resolved);
console.log(`gen-headers: wrote ${PROD_OUTPUT}${syncUrl ? "" : " (local-only, no sync hosts)"}`);
