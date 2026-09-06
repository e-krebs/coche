import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const FORBIDDEN = [
  /sk_test_[A-Za-z0-9]+/,
  /sk_live_[A-Za-z0-9]+/,
  /\bTICKET_SECRET\b/,
  /\bLIST_ID_SECRET\b/,
];
const TRACKED_ENV_FILES = [".env.sample", ".env.e2e", ".env.e2e-sync", ".env.test"];

// .gitignore is the only thing keeping a real env file out of the index, and a pruned or mistyped
// pattern there fails silently. Matched on filename alone: FORBIDDEN's bare-word patterns appear
// legitimately throughout docs/ and ci.yml, so they can't be reused against tracked files. The
// globs lead with `*` because a pathspec is root-anchored while .gitignore matches at any depth —
// without it a force-added src/.env.production would slip past the very check that backs it up.
const trackedEnv = execSync("git ls-files -z -- '*.env*' '*.dev.vars*'", { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => !TRACKED_ENV_FILES.includes(file));
if (trackedEnv.length) {
  console.error(`Env file(s) committed that carry secrets: ${trackedEnv.join(", ")}`);
  process.exit(1);
}

const leakyEnv = Object.keys(process.env).filter((k) => k.startsWith("VITE_") && /SECRET/i.test(k));
if (leakyEnv.length) {
  console.error(`Secret-shaped VITE_ vars would be bundled: ${leakyEnv.join(", ")}`);
  process.exit(1);
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const hits = walk(DIST).flatMap((file) => {
  const text = readFileSync(file, "utf8");
  return FORBIDDEN.filter((re) => re.test(text)).map((re) => `${re} in ${file}`);
});

if (hits.length) {
  console.error(`Secret leak in dist/:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("secret gate: index + dist/ clean");
