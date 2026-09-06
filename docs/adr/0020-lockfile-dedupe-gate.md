# 0020. A lockfile dedupe gate on the verify job

## Status

Accepted.

## Context

Yarn never re-resolves a descriptor that is already in the lockfile. That is what makes installs
reproducible, and it is also how a second copy of a package appears: when two consumers declare
overlapping ranges for the same package and those ranges are resolved at different times, the
later one resolves independently rather than collapsing onto the version the first already picked.
Nothing in the lockfile marks the result as duplicated — both entries are valid, both consumers get
a version satisfying their range, and every gate stays green.

`vite` is the case that made this concrete. It is a direct dependency, and `vitest` declares it in
its own `dependencies` as well as its peer range, with a much wider `^6 || ^7 || ^8`. A bump to the
direct range moved that descriptor and left `vitest`'s where it was, so the tree carried two Vite
versions and the test run and the build no longer necessarily loaded the same one. Nothing reported
it: the split was found by reading the lockfile while working on an unrelated Vite config change.

The rest of the tree had drifted the same way in parallel, across eight packages, including two
`@clerk/*` packages several minor versions apart. Every one of them predated any deliberate
decision. Only two involved a range this repo declares itself; the rest were transitive against
transitive, two consumers of the same package arriving with different ranges at different times.
Dependency updates set either shape in motion — grouped monthly Dependabot bumps
([`0019-grouped-dependency-updates.md`](0019-grouped-dependency-updates.md)) move a range and leave
every already-locked descriptor for that package untouched, whether the range that moved is a
direct one or one inside a bumped parent — and nothing looked at the result.

## Decision

`yarn dedupe --check` runs as a step on the `verify` job in
[`../../.github/workflows/ci.yml`](../../.github/workflows/ci.yml), and the tree is deduped so the
gate starts green.

- **In CI, on `verify`, before the build.** Same placement and same reasoning as the link gate
  ([`0018-markdown-link-gate.md`](0018-markdown-link-gate.md)): it reads the lockfile and nothing
  else, costs a second, and needs no build output — so it fails early on a job that already runs.
  There is still no hook infrastructure in the repo to hang a pre-commit check on.
- **`--check` rather than a `--mode=update-lockfile` autofix.** The gate reports and fails; the
  author runs `yarn dedupe` and commits the result. Deduping is not free — it moves transitive
  consumers onto newer versions within their declared ranges, which is a real change even when
  semver-compatible — so it belongs in a reviewed commit rather than happening under CI.
- **No package is exempted.** An exemption list would need a reason per entry and would be the thing
  nobody revisits. The strategy is not a choice either — `highest` is the only one Yarn implements —
  so every duplicate collapses onto the highest already-resolved version satisfying its range, which
  is the direction bumps travel anyway.
- **A gate rather than `resolutions` pins.** A `resolutions` entry per duplicated package would
  also collapse the tree, but each one hand-duplicates a range that already exists in
  `dependencies` and silently overrides Dependabot for that package. The gate keeps a single source
  of truth for every range and fails loudly instead.

## Consequences

- A grouped Dependabot PR that splits a package now goes red on `verify` instead of merging
  quietly. Fixing it is `yarn dedupe` plus a commit, but it does mean a routine bump can arrive
  needing a manual step — the cost of the gate, accepted because the alternative is the drift being
  invisible.
- Deduping moves transitive consumers onto newer versions within their ranges, so a red gate is
  never *only* a lockfile edit: the dedupe that clears it can change behavior in a dependency the
  repo does not name directly. The full gate set, both Playwright tiers included, is what stands
  behind that — and which tier matters depends on where the duplicate sat. The `@clerk/*` split this
  gate was introduced against hung entirely off `@clerk/testing`, the e2e-only harness, so the
  shipped auth path never moved and `test:e2e:sync` was the tier that covered it.
- `yarn install --immutable` and this gate check different things and both are needed. The former
  says the lockfile matches the manifests; this one says the lockfile does not carry avoidable
  duplicates. A tree can satisfy either while failing the other.
- Yarn's resolution is the authority for what counts as dedupable, so a Yarn upgrade can change the
  gate's verdict on an unchanged lockfile. Yarn is pinned via `packageManager`, so that arrives as
  a deliberate bump rather than a surprise.
