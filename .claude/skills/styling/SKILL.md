---
name: styling
description: Tailwind/CSS conventions for client UI — conditional classes and motion tiers. Use when writing or editing components under src/client/, especially className logic or animation.
---

# Styling

Conditional classes use **data attributes + Tailwind variants**, never ternary/template `className`
strings. Keep the always-on classes unconditional and gate the rest on a variant:
`className="border-faint data-active:border-accent-text"` with `data-active={active || undefined}`
(React drops the attribute when the value is falsy, so the bare-boolean `data-active:` shorthand —
Tailwind ≥ 4.1 — matches on presence). For an enum use the value form `data-[status=synced]:…` with
`data-status={status}`. When the target can't take the attribute (an icon component that only
accepts `className`, or a sibling element), mark an ancestor `group` + `data-open` and use
`group-data-open:…`.

Motion tier, most-preferred first: **CSS transition → CSS `@keyframes` → JS**. Use a transition for
a state change (A→B); a keyframe animation only when the motion loops or is a one-shot that returns
to its start (a transition can't); a hand-rolled JS/WAAPI animation only as a last resort. The View
Transitions API (list add/check/delete) is a platform transition, not hand-rolled JS — it's fine.
Gate every animation on `prefers-reduced-motion`: `motion-reduce:` for transitions, an
`@media (prefers-reduced-motion: reduce)` guard for keyframes.
