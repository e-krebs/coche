# 0015. axe-core as a gate on the local Playwright tier

## Status

Accepted. The runtime half of the pair begun in
[0014-jsx-a11y-lint-rules.md](0014-jsx-a11y-lint-rules.md).

## Context

A static linter reads JSX. It cannot see the accessibility tree the markup actually produces, and in
this codebase that gap is concrete rather than theoretical: dnd-kit supplies a row's `role`,
`tabIndex` and `aria-describedby` through a spread, so the single largest semantic compromise in the
app — the whole-row drag activator from
[0008-dnd-kit-reorder.md](0008-dnd-kit-reorder.md) — produces no lint diagnostic in either
direction. Neither does a colour token that fails its contrast minimum, because contrast is a
property of the rendered page, not of the class name.

Hand-written role-and-name assertions already carry a lot of the accessibility contract, but they
only ever check what somebody thought to assert. The gap that let the sortable row ship without an
activator node was not a missing assertion; it was a whole failure mode nobody had considered.

## Decision

`@axe-core/playwright` runs as an ordinary spec on the hermetic local tier
([../../e2e/local/a11y.spec.ts](../../e2e/local/a11y.spec.ts)), scanning nine DOM states: the empty
list, a populated list, the checked group both collapsed and expanded, search results, a search with
no matches, the picker in both pick and edit mode, and the delete confirmation. The collapsed checked
group earns its own scan because it is the only place `inert` and `aria-hidden` wrap focusable
content.

- **Rides `yarn test:e2e`, not a new command or CI job.** It needs a real engine, the local tier
  already provides one hermetically, and a separate job would double the build for one spec file.
- **Tag allowlist, not everything**: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. axe's
  `best-practice` rules encode house style as much as conformance, and a gate that fails on taste is
  a gate people learn to skip.
- **Pinned exact.** A floating minor of axe-core ships new rules, which would fail an unchanged app
  on an unrelated install. That is a different reason from the version-pinning argument in
  [../explanation/tooling.md](../explanation/tooling.md) — there the risk is a formatting fixpoint
  drifting, here it is the ruleset itself moving under us.
- **The two rules the drag activator trips —`nested-interactive` and `list` — are filtered per node,
  not disabled per scan.** A blanket `disableRules` on the list screens would also stop detecting a
  *new* violation of either rule on the screen where most of the app lives. Filtering the known node
  signature keeps the rule live everywhere else.
- **`color-contrast` is never disabled.** It is the highest-value rule against a hand-rolled theme,
  and no amount of role-and-name testing would surface a token that fails it. Its reach is narrower
  than the name suggests, though: it measures **text** only. axe implements no non-text-contrast rule,
  so a UI component boundary that fails 3:1 — an unselected radio's ring, an icon button's border —
  passes this gate untouched and is checked by hand against the token contract in
  [../explanation/architecture.md](../explanation/architecture.md) instead.
- **Scans run under `prefers-reduced-motion: reduce`.** A dialog measured mid entrance animation is
  still partly transparent, so axe resolves the scrim behind it as the background and fails contrast
  on every element inside, including ones that comfortably pass. Emulating the preference makes each
  surface fully painted at the moment it is measured, which makes the scan deterministic rather than
  a race against a keyframe.

## Consequences

- Accessible names, ARIA validity, nesting and text contrast are checked on every push, without
  anyone having to anticipate the specific failure. Coverage is not uniform across the nine, though:
  the three dialog scans are scoped to the dialog subtree, because the full-bleed scrim otherwise sits
  behind every measurement, so page-level findings like landmark structure come from the six full-page
  scans only.
- **The language chooser is not covered.** The local tier aborts non-localhost requests, so Clerk
  never initializes and the `UserButton` that opens the dialog never renders. Its semantics and focus
  behaviour are unit-covered instead; closing this gap needs a non-Clerk entry point to the chooser,
  which is a product decision rather than a test one.
- **Focus visibility is still not covered by axe** — it has no rule for it. That is why
  [../../e2e/local/keyboard.spec.ts](../../e2e/local/keyboard.spec.ts) asserts a painted ring
  separately, and why forced-colors remains a manual check.
- The filtered rules are a standing reminder rather than a silence: if the row ever gains a dedicated
  drag handle, deleting the filter is how you find out the compromise is gone.
