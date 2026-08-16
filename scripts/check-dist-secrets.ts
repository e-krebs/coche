import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const FORBIDDEN = [
  /sk_test_[A-Za-z0-9]+/,
  /sk_live_[A-Za-z0-9]+/,
  /\bTICKET_SECRET\b/,
  /\bLIST_ID_SECRET\b/,
];

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
console.log("secret gate: dist/ clean");
