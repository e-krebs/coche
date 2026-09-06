import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const CODE_SPAN = /`+[^`]*`+/g;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^#{1,6} +(.*)$/;
const HTML_LINK = /<a\s[^>]*href=/i;
// A footnote is `[^1]: …`, not a link definition, so it's excluded from the reference-link check.
const REFERENCE_DEFINITION = /^\s{0,3}\[[^^\]][^\]]*\]:/;
// The repo cites source lines as [file.ts:42](path/to/file.ts#L42) — a GitHub UI fragment, not a
// heading, so it has nothing to resolve against.
const LINE_ANCHOR = /^l\d+(?:-l\d+)?$/i;
// Any scheme, plus protocol-relative: all off-repo, so out of scope for a path check.
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

let ok = true;
const fail = (message: string) => {
  console.error(message);
  ok = false;
};

const readText = (file: string): string | undefined => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    fail(`${file}: unreadable — git lists it, but it can't be opened`);
    return undefined;
  }
};

/**
 * Prose lines, numbered, with fenced blocks dropped, plus any fence left open at EOF. Fences are
 * tracked line by line rather than matched by regex: an anchored `^``` ` misses every fence
 * indented inside a list item — which is all of them in some docs — and pairing fences with a
 * non-greedy match silently shifts by a whole region as soon as one file holds an odd count.
 */
const proseLines = (text: string): { lines: { line: string; number: number }[]; open: string } => {
  let open = "";
  const lines = text.split("\n").flatMap((line, index) => {
    const marker = FENCE.exec(line)?.[1];
    if (open) {
      if (marker && marker[0] === open[0] && marker.length >= open.length) open = "";
      return [];
    }
    if (marker) {
      open = marker;
      return [];
    }
    return [{ line, number: index + 1 }];
  });
  return { lines, open };
};

/**
 * GitHub's heading slug. `\p{Nd}\p{Nl}` rather than `\p{N}`: GitHub strips `\p{No}`, so
 * `## ½ CubeSat` anchors as `-cubesat`. Unicode letters do survive — `Diátaxis` is `diátaxis`.
 */
const slug = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{Nd}\p{Nl} _-]/gu, "")
    .replaceAll(" ", "-");

const slugsOf = (file: string): Set<string> => {
  const counts = new Map<string, number>();
  const slugs = new Set<string>();
  const text = readText(file);
  if (text === undefined) return slugs;
  for (const { line } of proseLines(text).lines) {
    const heading = HEADING.exec(line);
    if (!heading) continue;
    const base = slug(heading[1]);
    // GitHub suffixes repeats from the second occurrence on: -1, -2, …
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    slugs.add(seen === 0 ? base : `${base}-${seen}`);
  }
  return slugs;
};

const slugCache = new Map<string, Set<string>>();
const headingSlugs = (file: string): Set<string> => {
  const cached = slugCache.get(file);
  if (cached) return cached;
  const slugs = slugsOf(file);
  slugCache.set(file, slugs);
  return slugs;
};

// --others so a doc that isn't committed yet is still checked locally; --exclude-standard keeps
// the gitignored working notes out. In CI, where everything is committed, this is just --cached.
const listFiles = (): string[] => {
  try {
    return execSync("git ls-files -z --cached --others --exclude-standard -- '*.md'", {
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    console.error("check:links needs a git checkout to enumerate markdown files");
    process.exit(1);
  }
};

const files = listFiles();
let checked = 0;

for (const file of files) {
  const text = readText(file);
  if (text === undefined) continue;
  const { lines, open } = proseLines(text);
  // Coverage silently shrinking is the one failure this gate must never have: an unclosed fence
  // swallows every line below it, and CommonMark agrees those aren't links — but going quiet
  // about a whole unchecked region is exactly what the loud-on-unparseable rule below exists to
  // prevent, so say it.
  if (open) fail(`${file}: unterminated \`${open}\` fence — every line below it went unchecked`);

  for (const { line, number } of lines) {
    const at = `${file}:${number}`;
    // Inline code holds examples, not links — including this repo's own `[file.ts:42](path#L42)`
    // citation convention written out as a code span, which would otherwise resolve as a link.
    const prose = line.replace(CODE_SPAN, "");

    if (REFERENCE_DEFINITION.test(prose)) {
      fail(
        `${at}: reference-style definition — this gate resolves inline [text](target) links only`,
      );
      continue;
    }
    if (HTML_LINK.test(prose)) {
      fail(`${at}: raw <a href> — use a markdown link so it gets checked`);
      continue;
    }

    const targets = [...prose.matchAll(LINK)].map((match) => match[1]);
    // An unparsed link is otherwise reported as *nothing*, leaving the gate green while it quietly
    // stops checking. Anything link-shaped the regex won't take — a link title, an <angle> target,
    // a bracket in the text — has to fail loudly instead.
    const linkLike = prose.split("](").length - 1;
    if (linkLike !== targets.length) {
      fail(
        `${at}: ${linkLike} link-like construct(s), ${targets.length} parsed — unsupported syntax`,
      );
      continue;
    }

    for (const target of targets) {
      if (EXTERNAL.test(target)) continue;
      const hash = target.indexOf("#");
      const path = hash === -1 ? target : target.slice(0, hash);
      const anchor = hash === -1 ? "" : target.slice(hash + 1);
      const resolved = path === "" ? resolve(file) : resolve(dirname(file), path);
      if (path !== "" && !existsSync(resolved)) {
        fail(`${at}: missing path -> ${target}`);
        continue;
      }
      checked++;
      if (!anchor || LINE_ANCHOR.test(anchor)) continue;
      const anchored = relative(process.cwd(), resolved);
      if (!anchored.endsWith(".md")) {
        fail(`${at}: anchor on a non-markdown target -> ${target}`);
        continue;
      }
      if (!headingSlugs(anchored).has(anchor.toLowerCase())) {
        fail(`${at}: no heading matches -> ${target}`);
      }
    }
  }
}

if (!ok) process.exit(1);
console.log(`links gate: ${checked} relative link(s) across ${files.length} files OK`);
