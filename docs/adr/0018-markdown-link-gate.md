# 0018. A markdown link gate on the verify job

## Status

Accepted.

## Context

[`../../CLAUDE.md`](../../CLAUDE.md) treats `docs/` as a living deliverable rather than a one-time
writeup, and backs that with a table mapping each code area to the doc that has to move with it. The
docs hold up their end structurally: pages cross-link each other by anchor, and reference pages link
straight at the source they describe — into `src/` and `e2e/`, the two directories where files get
renamed most.

Nothing checked any of it. A rename in `src/client/components/` left every doc link pointing at it
broken with no signal, and an anchor could rot on its own — reword a heading and every
`#anchor` aimed at it silently stops resolving, because a markdown link to a missing fragment
renders as an ordinary link and simply lands at the top of the page. Both failures are invisible
until a reader follows the link, which on a solo repo means indefinitely. The gates that already
exist — the CSP check, the secret check, five typechecks — all catch a class of drift the author
cannot see by reading the diff; docs links were the remaining one with no such gate.

## Decision

[`../../scripts/check-links.ts`](../../scripts/check-links.ts) resolves every inline markdown link in
every `.md` file git knows about, and runs as a step on the `verify` job in
[`../../.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

- **In CI, not a commit hook.** There is no hook infrastructure in the repo — no husky, no lefthook,
  no `core.hooksPath` — so a pre-commit gate would mean adding a dependency and an install step for
  a check that costs a second on a job that already runs. It sits before the build for that reason:
  it needs nothing but the checkout, so link rot fails early and cheaply.
- **Offline by design.** External `http(s)` and `mailto:` targets are skipped rather than fetched. A
  gate that reaches the network fails `verify` when a third party has an outage or rate-limits a
  runner, and a required check that goes red for reasons outside the repo is a check people learn to
  re-run rather than read. The cost is real and accepted: external links rot here unnoticed.
- **Hand-rolled rather than adopting a checker.** `remark-validate-links` is the principled
  alternative — a real mdast parser, correct on constructs a regex has to special-case — but it
  brings a `remark` toolchain into `devDependencies` for edge cases this corpus does not contain,
  and every dependency added is one more thing to keep current. `lychee` is faster and would cover
  external URLs, but it is a Rust binary: `yarn check:links` would stop being runnable before a push
  without a `brew` or `cargo` install, breaking the property that every gate here can be run locally
  with nothing but the repo's own toolchain.
- **Anything link-shaped it cannot parse is a failure, not a skip.** This is what makes the previous
  point safe. A hand-rolled extractor has a blind spot by construction — reference-style links, a
  link title, an angle-bracketed target, a raw `<a href>` — and the dangerous shape of that blind
  spot is that an unrecognized link is reported as *nothing*, so the gate stays green while quietly
  checking less than it claims. The script therefore counts link-shaped constructs on each line
  against the links it actually resolved and fails on any mismatch, naming the file and line. A
  contributor reaching for syntax the gate doesn't support learns immediately, instead of the gate
  going soft in silence.
- **Heading anchors are resolved against GitHub's own slug algorithm**, including its `-1`/`-2`
  suffixing of repeated headings. The subtle part is the character class: GitHub keeps Unicode
  letters and marks but strips "other" numbers, so `Diátaxis` slugs to `diátaxis` while `½` vanishes
  entirely. An ASCII-only approximation would report false positives against this repo's own
  accented headings.
- **`#L42`-style fragments are skipped.** The repo's citation convention points at source lines, and
  those fragments are GitHub UI addresses rather than headings — there is nothing in the file to
  resolve them against.
- **Untracked-but-not-ignored files are checked too**, so a page still being written is covered
  before its first commit. In CI, where the tree is committed, this is indistinguishable from
  checking tracked files only.

## Consequences

- A rename under `src/` or `e2e/` can no longer silently orphan the reference page that documents
  it, and rewording a heading surfaces every anchor aimed at it — but only where that reference is a
  real `#anchor` link. A section named in prose ("see the *Styling* section of …") is invisible to
  the gate and rots exactly as before, which is an argument for linking to a heading rather than
  naming it.
- External links are not covered, and no gate will tell you when one dies.
- The slug implementation mirrors a third party's, so a change on GitHub's side would appear here as
  a false positive on an unchanged file. Anchors are a small fraction of the links checked, and the
  failure is loud and legible rather than silent, which is the trade accepted.
- The script has no unit test, and deliberately so: nothing under `scripts/` is collectible by either
  Vitest project ([`../reference/testing.md`](../reference/testing.md)), and standing up a third
  project for one gate script would cost more than the gate. Its own correctness is asserted the way
  the other gate scripts' is — by running it.
