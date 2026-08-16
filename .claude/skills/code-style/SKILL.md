---
name: code-style
description: Comment, formatting, linting, and import conventions for TS/TSX in this repo. Use when writing or editing any .ts/.tsx file — comment density, oxfmt/oxlint rules, and path alias imports.
---

# Code style

## Code comments

Comments are **minimal**: delete any comment that only restates a well-named symbol or the code
below it; keep only a non-obvious *why* (a workaround, a surprising ordering, a security/fail-closed
reason), cut to the essential clause. Exported symbols and documented top-level declarations use
terse **JSDoc** (`/** */`, no `@param`/`@returns` bloat); inline "why" notes inside bodies stay
`//`. This repo opts out of the global no-JSDoc rule via the `.claude/allow-jsdoc` marker (the JSDoc
ban is lifted only — multi-line `/* */` blocks stay banned). Comments **wrap at 100 columns** like
code: a comment longer than one line becomes a multi-line JSDoc / `//` block, never an over-long
single line (oxfmt doesn't reflow comment prose, so wrap by hand). `src/shared/contract.ts` is the
style anchor.

## Formatting

**oxfmt** (`.oxfmtrc.json`, `printWidth: 100`, Prettier-compatible options) formats JS/TS — run
`yarn format` to write, `yarn format:check` in CI. It reflows **code only**: it never wraps comment
prose or string literals, so hand-wrap long comments to ≤100 and leave unbreakable strings (SVG
paths, i18n copy, import specifiers) as-is. Tailwind `className`s are the exception: they're wrapped
and ordered by a **lint** rule, not oxfmt — its `sortTailwindcss` is deliberately off (why:
[docs/explanation/tooling.md](../../../docs/explanation/tooling.md)). Markdown, CSS,
HTML, `package.json`, and the generated `routeTree.gen.ts` are excluded via `ignorePatterns`.

## Linting

**oxlint** (`.oxlintrc.json`) runs on the whole repo — `yarn lint`, enforced in CI; correctness
rules are errors. React linting (the `react` plugin plus both `react-hooks` rules) is scoped to
`src/client/**`. Never silence a hooks error with an inline `oxlint-disable` — fix the hook (lift
the call out of the branch, close the dependency).

**"You might not need an Effect"** is enforced too
(`eslint-plugin-react-you-might-not-need-an-effect`, all rules errors, same `src/client/**` scope).
Don't reach for `useEffect` to derive state, handle events, chain updates, or notify a parent — see
[react.dev](https://react.dev/learn/you-might-not-need-an-effect). The one exception is genuinely
**synchronizing with an external system** (a live socket, a scroll subscription, post-render focus):
keep the Effect and wrap it in a block `// oxlint-disable <rule>` / `// oxlint-enable <rule>` with a
one-line *why* + doc link — never a blanket file-level disable. Examples: `store/sync.ts`,
`components/ShoppingList/useHeaderCollapse.ts`.

**Tailwind class wrapping + ordering** is a lint concern too (`eslint-plugin-readable-tailwind`,
errors, same scope): a long `className` becomes a multi-line **template literal**
(`` className={`…`} ``); whitespace/newlines collapse at match time, so it's behaviorally identical.
Don't hand-format Tailwind classes — run **`yarn fix`** (`oxlint --fix . && oxfmt .`); CI enforces
`yarn lint` + `format:check`.

**Type-aware rules** run in the same `yarn lint` pass via **`oxlint-tsgolint`** — nearly all
typescript-eslint type-aware rules are errors (`correctness` repo-wide, the rest scoped to `src/**`
+ `e2e/**`). oxlint's `typeCheck` stays **off**: the five `tsc --noEmit` scripts are the
authoritative type gate. Two frictions have set patterns: **browser feature detection** uses
`typeof x === "function"` or `"prop" in obj`, never `?.`/`&&` guards (`lib.dom` types those APIs as
always-present, so guards trip `no-unnecessary-condition`); **unavoidable casts** (TinyBase's
generic/opaque-content casts, `SELF` from `cloudflare:test`) get a narrow `oxlint-disable` with a
`-- <why>`, never a blanket one.

oxlint, oxfmt, `oxlint-tsgolint`, and both jsPlugin versions are **pinned** — the wrap/sort/format
fixpoint is version-sensitive, so never bump one alone. The reasoning behind the toolchain's shape
(why `sortTailwindcss` is off, why `typeCheck` is off, rule-scoping and tuning) lives in
[docs/explanation/tooling.md](../../../docs/explanation/tooling.md).

## Imports

Cross-directory imports use bare path aliases, never relative `../`: `shared/*`, `client/*`,
`server/*` (→ `src/*`). Same-directory imports stay `./`. Aliases are declared as **relative**
`paths` in each leaf tsconfig (`tsconfig.json`, `src/server/tsconfig.json`) — TS 7 (tsgo) removed
`baseUrl` and resolves inherited `paths` per-leaf, so don't re-add `baseUrl` or centralize `paths`
in `tsconfig.base.json`. `vite-tsconfig-paths` bridges the aliases into Vite and Vitest;
esbuild/wrangler read the tsconfig directly.
