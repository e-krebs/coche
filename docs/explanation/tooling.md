# Tooling

Why the lint/format/typecheck toolchain is shaped the way it is. The operational rules — which
command to run, which pattern to follow, what never to do — live in
[`../../CLAUDE.md`](../../CLAUDE.md); this page is the reasoning behind them.

## One engine, one pass

The repo runs on the [oxc](https://oxc.rs) toolchain — **oxlint** for linting, **oxfmt** for
formatting — instead of ESLint and Prettier. Both are the same class of tool reimplemented in Rust,
and the win is consolidation as much as raw speed: `yarn lint` is a single pass that already covers
React rules, an Effect-usage rule, Tailwind class ordering, and type-aware static analysis, where an
ESLint-based setup would assemble the same coverage from several plugins layered onto a
`parserOptions.project`-driven type-checking pass. oxlint gets there through **jsPlugins**: it loads
existing npm ESLint-plugin packages directly into oxc's own parser and rule runtime, so a plugin
authored for ESLint runs here without pulling in ESLint itself. That is how two ordinary ESLint
plugins — `eslint-plugin-react-you-might-not-need-an-effect` and `eslint-plugin-readable-tailwind` —
end up inside `yarn lint` rather than a separate `eslint` invocation.

Type-aware rules ride the same pass through **oxlint-tsgolint**
([`../../package.json`](../../package.json)), which is built on TS 7's `tsgo` compiler rather than
the classic `tsc`. Classic type-aware ESLint (`typescript-eslint` with `parserOptions.project`)
needs a full type-checked program built by `tsc` before it can evaluate a single rule; `tsgo` is
fast enough that oxlint folds that step into the normal lint run with no extra command and no
separate CI job — see [`../../.oxlintrc.json`](../../.oxlintrc.json)'s `options.typeAware`.

## Format and lint split the Tailwind problem

[`../../.oxfmtrc.json`](../../.oxfmtrc.json) turns `sortTailwindcss` off on purpose, and Tailwind
class wrapping *and* ordering both live in oxlint instead, via the `readable-tailwind` jsPlugin. The
reason is that a class list lives inside a string literal, and oxfmt — like Prettier — never
rewrites the contents of a string; wrapping a long `className` onto multiple lines therefore means
turning it into a template literal, which is a semantic rewrite, not a formatting one. Once that
rewrite is a lint fix rather than a format pass, ordering has to move with it: a sorter that
normalizes a class list back onto one line and a wrapper that splits it across several lines would
fight each other if they ran as two independent tools racing to have the last word. Giving both jobs
to the same plugin (`readable-tailwind/multiline` at the shared `printWidth: 100`,
`readable-tailwind/sort-classes` against the v4 theme `entryPoint`) means one pass produces the
final shape — a multi-line template literal in the official Tailwind order — and oxfmt is left
owning everything else in the file.

## Comments and strings stay hand-wrapped

oxfmt reflows syntax, not prose: it never wraps a comment or touches the contents of a string
literal. Rewrapping a comment would mean line-breaking English sentences, a different problem from
reformatting code and one a code formatter has no principled way to do; rewriting a string could
silently change behavior for the strings that carry meaning in their exact bytes — SVG path data,
i18n copy, import specifiers. oxfmt stays inside the region it can rewrite without changing meaning,
which is why comment prose and long strings are wrapped by hand instead.

## jsPlugins: reusing ESLint's ecosystem without ESLint

`eslint-plugin-react-you-might-not-need-an-effect` is enforced because `useEffect` is easy to reach
for out of habit in places where it isn't the right tool — deriving state, handling an event,
chaining one update off another, or pushing data up to a parent all have a non-Effect answer, laid
out in [react.dev's guide](https://react.dev/learn/you-might-not-need-an-effect). Each of those has
a dedicated rule, and none of them get relaxed for convenience: the one case an Effect is actually
correct — synchronizing with something outside React's render, a live socket, a scroll position, a
post-render focus move — is handled as a scoped, documented exception at the call site rather than
by softening the rule everywhere.

Both jsPlugins, plus the plain `react` plugin and the `react-hooks` rules, are scoped to
`src/client/**`, not the whole repo. React-shaped linting only means something where the code is
actually React; applying it to the Worker or the shared contract would just be dead configuration.
Hooks linting in particular has to stop at the client boundary for a sharper reason:
`rules-of-hooks` flags any call that matches `use*` inside what it infers is a hook-eligible
context, and Playwright's fixture API hands every fixture a callback literally named `use`
(`{ page }, use) => …`) — under `e2e/**` that pattern reads as a hook call to the rule even though
it has nothing to do with React, so the override boundary exists to keep that false positive out
rather than to loosen the real rule.

## Type-aware rules on top of `tsgo`

[`../../.oxlintrc.json`](../../.oxlintrc.json) turns on almost every `typescript-eslint`-style
type-aware rule as an error, but not uniformly. The `correctness` category applies repo-wide
because those rules are the ones with the lowest false-positive rate — the kind that catch an
actual bug rather than a style preference — so there's no cost to running them everywhere, including
build scripts. The remaining tiers (`pedantic`, `suspicious`, `style`, `restriction`, `nursery`) are
opinionated enough that they only pay off on code the project actually owns and type-checks as a
first-class citizen, so they're confined to an `overrides` entry matching `src/**` and `e2e/**`.
Root-level config files and `scripts/*.mjs` fall outside that glob for the same reason: they call
into untyped or loosely-typed dependencies (`sharp`, Node's `fs`) where the type-aware
`no-unsafe-*` rules would just flag the untyped boundary itself, noise rather than signal, on files
that aren't part of the shipped application anyway.

Two rules are deliberately tuned rather than left at their default:

- **`prefer-readonly-parameter-types` is off.** At its default it flags nearly every function
  parameter that isn't a primitive, which would mean annotating `readonly` almost everywhere for a
  guarantee the codebase doesn't otherwise enforce this aggressively — the cost of universal
  immutability annotations outweighs the bugs it would actually catch here.
- **`prefer-nullish-coalescing` sets `ignorePrimitives.boolean`.** The repo's conditional-styling
  idiom is `data-active={active || undefined}` — see the `Styling` section of
  [`../../CLAUDE.md`](../../CLAUDE.md) — which depends on `||` treating `false` the same as
  `undefined` so React drops the attribute. `??` doesn't: rewriting that to
  `active ?? undefined` would keep `false` as a real value and render `data-active="false"` instead
  of omitting the attribute, silently breaking every Tailwind variant selector that matches on the
  attribute's *presence*. Excluding booleans from the rule keeps the idiom intact.

## Why oxlint doesn't own the type gate

`typeCheck` — the option that would have oxlint surface raw `tsc`-style diagnostics itself — stays
off, and four separate `tsc --noEmit` scripts in [`../../package.json`](../../package.json)
(`typecheck`, `typecheck:worker`, `typecheck:e2e`, `typecheck:e2e:sync`) remain the actual type
gate. oxlint resolves a single tsconfig per file, but this repo needs more than one view of some
files: `src/shared` is included both by the root [`../../tsconfig.json`](../../tsconfig.json)
(browser `lib`, `DOM` types included) and by
[`../../src/server/tsconfig.json`](../../src/server/tsconfig.json) (Worker `lib`, no DOM at all),
and a shared module has to type-check under both. A linter that picks one tsconfig per file
structurally can't reproduce that dual check — it would pick a side and silently miss whichever
errors only show up under the lib it didn't choose. The four `tsc` scripts each point at the right
tsconfig and stay authoritative for that reason; oxlint-tsgolint's type-aware rules are a
complement caught while editing, not a replacement for the split type-check.

## Pinned, not ranged

`oxlint`, `oxfmt`, `oxlint-tsgolint`, and both jsPlugins are pinned to exact versions in
[`../../package.json`](../../package.json) rather than given a `^` range. The Tailwind
wrap-then-sort-then-format sequence is a fixpoint: `readable-tailwind`'s wrapping decides where the
line breaks fall, its sorting decides the order within each line, and oxfmt has to leave that shape
alone afterward. A version bump to either plugin's wrap-column math or class-order table, or to
oxfmt's own formatting rules, can shift that fixpoint enough that `yarn fix` no longer
converges — one tool keeps re-touching what the other just wrote. `oxlint-tsgolint` is pinned in
lockstep with `oxlint` rather than independently because it plugs into oxlint's plugin interface
directly, so it tracks oxlint's version rather than having a compatibility range of its own.

## Living with a type system that doesn't know the runtime

Two friction points recur often enough to have a standing pattern rather than a one-off fix each
time.

**Browser feature detection.** `lib.dom` types progressively-enhanced APIs like
`startViewTransition`, `navigator.vibrate`, and `navigator.storage` as unconditionally present on
their interfaces, because the type declarations describe the specification surface, not which
browsers actually implement it. A defensive `?.` or `&&` guard against a real runtime absence then
looks, to the type checker, like a redundant check against something that's never
`undefined` — exactly what `no-unnecessary-condition` exists to catch. Switching the detection to
`typeof x === "function"` or `"prop" in obj` sidesteps this: those are runtime checks the type
system has no static basis to refute, so they read as intentional feature detection instead of dead
code.

**Unavoidable casts.** TinyBase's store API is generic over opaque cell and table shapes, and some
call sites need a cast the type system genuinely cannot derive on its own. Rather than weaken
`no-unsafe-type-assertion` for a whole file, each such cast carries its own one-line
`oxlint-disable-next-line` with the reasoning attached at the point of risk, so the exception stays
visible and local instead of quietly covering code that didn't need it. `SELF` from
`cloudflare:test` gets the same treatment for `no-deprecated`, for a related but distinct reason:
it's deprecated with no replacement, so a scoped disable is the only alternative to a permanently
unfixable lint error in that one test file.
