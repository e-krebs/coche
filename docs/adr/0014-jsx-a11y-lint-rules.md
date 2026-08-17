# 0014. A curated jsx-a11y rule set, with three rules off

## Status

Accepted. Complemented by [0015-axe-e2e-gate.md](0015-axe-e2e-gate.md), which covers what a static
linter structurally cannot see.

## Context

The client's accessibility layer is hand-rolled and load-bearing: three modal dialogs with
hand-written Tab traps and Escape handling, a bottom sheet whose rows are `menuitemradio`s under a
roving `tabIndex`, a radiogroup that ropes arrows without selecting, keyboard drag-and-drop through
dnd-kit, and a focus contract that reclaims focus whenever a mutation unmounts the focused control.

None of it was enforced. There was no `jsx-a11y`, no `axe`, and no keyboard assertion in any test
tier — accessibility held only as long as every contributor remembered every invariant. It did not
hold: the sortable row shipped without `setActivatorNodeRef`, so `Space` on any control inside a row
started a keyboard drag instead of activating the control, and nothing failed.

Two gates were available. A static linter reads JSX and catches a malformed or missing attribute as
it is typed; a runtime scanner reads the computed accessibility tree of a rendered page and catches
what the markup only implies. They fail in different directions, so the question was not which one
but whether the cheap one earns its configuration.

## Decision

`jsx-a11y` is enabled in [`../../.oxlintrc.json`](../../.oxlintrc.json)'s `src/client/**` override,
alongside the `react` plugin and for the same reason — React-shaped linting only means something
where the code is React (see [../explanation/tooling.md](../explanation/tooling.md)).

The `correctness` category turns the plugin's rules on wholesale. Three are turned off, each because
the rule's advice is wrong for this codebase rather than because the codebase is wrong:

- **`prefer-tag-over-role`.** It asks for `<dialog>` in place of `role="dialog"`, `<output>` in place
  of `role="status"`, and `<input type="radio">` in place of `role="radio"`. Native `<dialog>` is
  unavailable to the unit tier: jsdom ships `HTMLDialogElement` as an empty subclass with no
  `showModal`, no top layer, and no `close` event, so converting would move all three dialogs'
  containment and Escape behavior out of unit-test reach. `role="status"` on a `<div>` is correct and
  `<output>` is not — `<output>` is for a form control's calculated result. The locale radios are
  buttons on purpose, because they rove focus without selecting.
- **`no-autofocus`.** Both `autoFocus` attributes sit on an inline editor that exists only because
  the user just activated a control to open it. The focus move *is* the interaction, and removing it
  breaks the keyboard delete path, which reaches Delete by tabbing from the focused rename input.
- **`no-noninteractive-element-interactions`.** Each dialog's container element owns `Escape` and the
  Tab trap for its whole subtree. That is a container concern by design; moving the handler to an
  interactive descendant would scope it to one control instead of the dialog.

## Consequences

- A malformed `aria-*` attribute, an invalid role, a role missing its required props, a positive
  `tabIndex`, or an interactive handler on a static element fails `yarn lint` at the point of
  writing.
- **The linter cannot see through a JSX spread.** dnd-kit delivers `role`, `tabIndex`,
  `aria-roledescription` and `aria-describedby` via `{...sortable?.attributes}`, so the row that
  nests four buttons inside a `role="button"` — the tradeoff accepted in
  [0008-dnd-kit-reorder.md](0008-dnd-kit-reorder.md) — produces no lint diagnostic at all, in either
  direction. Neither does the `aria-hidden` scrim, because `tabIndex={-1}` puts it outside the rule's
  definition of focusable. This is the structural gap that motivates the runtime gate in 0015.
- Enabling the plugin changed no application code. All ten pre-existing diagnostics fall under the
  three disabled rules, which is what makes this a policy decision rather than a cleanup.
- **`prefer-tag-over-role` becomes a forcing function.** Its only real blocker is jsdom's missing
  `HTMLDialogElement`. If that lands, or if dialog containment coverage moves to the browser tier,
  re-enabling the rule is the signal to migrate to native `<dialog>` — which would also delete the
  hand-written traps, the scrim buttons, and the z-index ladder between the sheet and the nested
  confirmation.
