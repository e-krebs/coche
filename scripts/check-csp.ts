import { existsSync, readFileSync } from "node:fs";
import {
  DEV_FILE,
  fapiHostFromPublishableKey,
  PROD_OUTPUT,
  PROD_TEMPLATE,
  readCspFile,
  resolveViteEnv,
  unresolvedTokens,
  withoutInjectedViteVars,
} from "./csp.ts";

const REQUIRED_DIRECTIVES = [
  "default-src",
  "script-src",
  "style-src",
  "img-src",
  "font-src",
  "connect-src",
  "worker-src",
  "frame-src",
  "frame-ancestors",
  "manifest-src",
  "form-action",
  "base-uri",
  "object-src",
];

let ok = true;
const fail = (message: string) => {
  console.error(message);
  ok = false;
};

const directiveNames = (value: string): Set<string> =>
  new Set(
    value
      .split(";")
      .map((d) => d.trim().split(" ")[0])
      .filter(Boolean),
  );

const onlyIn = (a: Set<string>, b: Set<string>): string[] => [...a].filter((d) => !b.has(d));

const dev = readCspFile(DEV_FILE);
const prod = readCspFile(PROD_TEMPLATE);

for (const { file, csp } of [
  { file: DEV_FILE, csp: dev },
  { file: PROD_TEMPLATE, csp: prod },
]) {
  const missing = REQUIRED_DIRECTIVES.filter((d) => !csp.value.includes(`${d} `));
  if (missing.length) fail(`${file}: missing directive(s): ${missing.join(", ")}`);
}

// Both files should flip Report-Only → enforcing together; catches flipping just one by mistake.
if (dev.name !== prod.name) {
  fail(`${DEV_FILE} is "${dev.name}" but ${PROD_TEMPLATE} is "${prod.name}" — flip both together.`);
}

// Flipping *both* files would otherwise satisfy the check above, so production could run unenforced
// indefinitely after a debugging session. The escape hatch is deliberate and has to be typed.
if (prod.name !== "Content-Security-Policy" && !process.env.CSP_ALLOW_REPORT_ONLY) {
  fail(
    `${PROD_TEMPLATE} is "${prod.name}", not enforcing — set CSP_ALLOW_REPORT_ONLY=1 to allow it.`,
  );
}

// The fixed list above can't catch a directive added to one policy and forgotten in the other.
const devOnly = onlyIn(directiveNames(dev.value), directiveNames(prod.value));
const prodOnly = onlyIn(directiveNames(prod.value), directiveNames(dev.value));
if (devOnly.length) fail(`${DEV_FILE} has directive(s) the template lacks: ${devOnly.join(", ")}`);
if (prodOnly.length) {
  fail(`${PROD_TEMPLATE} has directive(s) ${DEV_FILE} lacks: ${prodOnly.join(", ")}`);
}

// Pages applies a header only under a path rule: a template that lost its `/*` line ships inert.
if (
  !readFileSync(PROD_TEMPLATE, "utf8")
    .split("\n")
    .some((l) => l.startsWith("/"))
) {
  fail(`${PROD_TEMPLATE}: no \`/*\` path rule — Pages would ignore the header line`);
}

// The deployment's own hosts stay out of the repo (ADR 0011), so the template must still be a
// template — a hand-substituted host here would ship and be committed.
const tokens = unresolvedTokens(prod.value);
if (tokens.length !== 2) {
  fail(
    `${PROD_TEMPLATE}: expected %FAPI_HOST% and %SYNC_HOST% placeholders, found ${tokens.length}`,
  );
}

// Resolved exactly as `vite dev` would, so a key kept in .env.local or .env.development is checked
// too — but only from env *files*. A production build injects the real hosts through the environment,
// and dev.headers is never meant to name those, so the injected copies are withheld for this
// resolution. Env files are gitignored, so this half no-ops in CI instead of failing there.
const env = withoutInjectedViteVars(() => resolveViteEnv("development"));

if (env.VITE_CLERK_PUBLISHABLE_KEY) {
  const fapi = fapiHostFromPublishableKey(env.VITE_CLERK_PUBLISHABLE_KEY);
  // A single-label wildcard (Clerk dev instances all live under *.clerk.accounts.dev) covers
  // the exact host too, so accept either — an exact host would still work if ever committed.
  const wildcard = fapi.replace(/^[^.]+\./, "*.");
  if (!dev.value.includes(fapi) && !dev.value.includes(wildcard)) {
    fail(`${DEV_FILE} is missing the Clerk FAPI host the local env resolves to: ${fapi}`);
  }
}

if (env.VITE_SYNC_URL) {
  const wsUrl = env.VITE_SYNC_URL.replace(/^http/, "ws");
  if (!dev.value.includes(env.VITE_SYNC_URL) || !dev.value.includes(wsUrl)) {
    fail(`${DEV_FILE} is missing the local env's sync host: ${env.VITE_SYNC_URL} / ${wsUrl}`);
  }
}

if (!env.VITE_CLERK_PUBLISHABLE_KEY && !env.VITE_SYNC_URL) {
  console.log("check:csp — no local env values; skipping the drift check (structural check only)");
}

// A bare `vite build` no longer produces a policy at all (gen-headers.ts does), so a built dist/
// without a resolved _headers means the SPA would ship with no CSP.
if (existsSync("dist")) {
  if (!existsSync(PROD_OUTPUT)) {
    fail(`${PROD_OUTPUT} is missing — run \`yarn build\`, which resolves ${PROD_TEMPLATE}`);
  } else {
    const built = readCspFile(PROD_OUTPUT);
    const leftover = unresolvedTokens(built.value);
    if (leftover.length) fail(`${PROD_OUTPUT}: unresolved token(s): ${leftover.join(", ")}`);
    if (built.name !== prod.name) {
      fail(`${PROD_OUTPUT} is "${built.name}" but ${PROD_TEMPLATE} is "${prod.name}"`);
    }
    const missing = REQUIRED_DIRECTIVES.filter((d) => !built.value.includes(`${d} `));
    if (missing.length) fail(`${PROD_OUTPUT}: missing directive(s): ${missing.join(", ")}`);
  }
}

if (!ok) process.exit(1);
console.log("csp gate: dev.headers + prod template OK");
