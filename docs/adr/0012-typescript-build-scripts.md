# 0012. TypeScript build scripts on a Node 24 baseline

## Status

Accepted. Supersedes no earlier ADR — the build tooling's language was never decided, only inherited.

## Context

The application is TypeScript throughout. Its build tooling — the Vite config, the `scripts/` helpers,
the repo's Claude Code hook — is not incidental to it:
[../../scripts/gen-headers.ts](../../scripts/gen-headers.ts) resolves the production
Content-Security-Policy, [../../scripts/check-csp.ts](../../scripts/check-csp.ts) and
[../../scripts/check-dist-secrets.ts](../../scripts/check-dist-secrets.ts) are the two deploy gates,
and [../../scripts/csp.ts](../../scripts/csp.ts) is a shared module imported by both gates *and* by
the Vite config. As untyped JavaScript, a change to that module's exported shape has no gate at all —
the failure surfaces at deploy time.

Running TypeScript from `node` needs an answer to *how the types get erased*. Three were available: a
runner dependency (`tsx`), a compile step producing tracked or ignored output, or Node's own type
stripping.

## Decision

The Vite config, every `scripts/*` helper, and the Claude Code hook are TypeScript, executed directly
by `node` using its native type stripping. [../../.nvmrc](../../.nvmrc) pins Node 24 and
`package.json` declares `"engines": { "node": ">=24" }`.

- **Stripping over a runner.** Type stripping is unflagged from Node 22.18 on, so `node
  scripts/gen-headers.ts` runs with no dependency, no build step, and no wrapper in `package.json`.
  The rejected alternative, a `tsx` devDep, would sit in the critical path of `yarn build` and both
  deploy gates.
- **24 as the floor, not 22.18.** It is the current LTS line, and a floor that names a patch release
  is one contributors read as approximate.
- **`.nvmrc` is the single source of truth.** The CI setup action reads `node-version-file: .nvmrc`
  instead of naming a version, so local and CI cannot drift.
- **Relative imports inside `scripts/` carry the `.ts` extension.** Stripping erases types; it does
  not rewrite specifiers, so Node resolves the literal path. `allowImportingTsExtensions` permits it
  because every tsconfig here is `noEmit`.
- **A fifth type gate.** [../../scripts/tsconfig.json](../../scripts/tsconfig.json) covers
  `scripts/**`, `vite.config.ts`, and the hook under `module: nodenext`; `yarn typecheck:node` runs it,
  and CI runs it alongside the four existing `tsc --noEmit` scripts.

## Consequences

- `scripts/csp.ts` now has a checked contract. A changed export shape fails `yarn typecheck:node`
  rather than the deploy that depends on it.
- **Node 24 is a hard requirement, not a recommendation.** On a Node without unflagged type
  stripping — anything below 22.18 — every one of these commands fails with
  `ERR_UNKNOWN_FILE_EXTENSION`: `yarn build`, both gates, `yarn icons`, and the PreToolUse hook. The
  hook is the sharpest edge: it runs under whatever `node` the spawned shell resolves, which is not
  necessarily the version `.nvmrc` names.
- Erasable syntax only. `enum`, `namespace`, parameter properties, and `import x = require()` do not
  survive stripping, so they are unavailable in these files. `verbatimModuleSyntax` (already set in
  [../../tsconfig.base.json](../../tsconfig.base.json)) forces `import type` for type-only imports,
  which is what stripping requires anyway.
- Lint scoping is unchanged. `.oxlintrc.json`'s type-aware `overrides` still match `src/**` and
  `e2e/**` only, so the converted scripts get `correctness` rules and not the `no-unsafe-*` tier —
  their `sharp` and `node:fs` boundaries would otherwise be flagged as noise (see
  [../explanation/tooling.md](../explanation/tooling.md)).
- Editing any of these files now triggers the `code-style` skill nudge, whose matcher keys on `.ts`.
