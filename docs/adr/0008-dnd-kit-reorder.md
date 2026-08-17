# 0008. dnd-kit for drag reorder (superseding React Aria Components)

## Status

Accepted — supersedes the React Aria Components reorder approach in
[0007-fractional-index-reorder.md](0007-fractional-index-reorder.md). The fractional-index model in
0007 is unchanged; only the drag library changed.

## Context

v1 needs mobile-first drag reorder. React Aria Components (RAC) `GridList` + `useDragAndDrop`, with
a focusable `<Button slot="drag">` per row for keyboard/SR reorder, proved unable to deliver the
target touch UX for reasons structural to RAC rather than fixable by configuration:

- **RAC reorders the DOM collection on change.** The "visually remove the source row / show a drop
  indicator" live-reflow technique reorders the DOM mid-drag, which aborts the in-flight native drag
  entirely.
- **Virtualization doesn't insulate it.** RAC's `Virtualizer` re-sorts the rendered DOM in
  collection order too, so virtualizing doesn't keep the dragged node stable.
- **Soft-keyboard vs touch drag was unwinnable under RAC.** On touch, dismissing the soft keyboard
  fires `touchcancel`, which cancels an in-flight drag; press-hold-delay and an `interactive-widget`
  viewport both failed to reconcile it.

## Decision

Use **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) for the unchecked
list's reorder. Key choices:

- **Whole row is the drag activator** — `{...attributes} {...listeners}` on the `<li>`, no separate
  handle (a handle left an awkward blank gutter and read as inert).
- **Sensors**: `MouseSensor` (activate after 6px), `TouchSensor` **press-and-hold** (`delay: 220`,
  `tolerance: 8`) so a normal vertical swipe still scrolls, `KeyboardSensor`
  (`sortableKeyboardCoordinates`).
- **Drag is disabled while the add/search input is focused** (and until the first sync completes):
  `dndDisabled = inputFocused || (syncing && activeId === null)`. A focused field means the soft
  keyboard may be open, and its dismissal's `touchcancel` would kill the drag; gating on focus
  sidesteps that OS-level conflict.
- Reorder still writes `position` via `keyForPosition` — see
  [0007-fractional-index-reorder.md](0007-fractional-index-reorder.md).

Implemented in [../../src/client/components/ShoppingList/index.tsx](../../src/client/components/ShoppingList/index.tsx).

## Consequences

- `react-aria-components` was dropped from the dependencies.
- **A11y tradeoff**: making the whole `<li>` the drag activator nests the row's child buttons
  (check, rename, quantity, delete) inside a drag-button role — a compromise versus a dedicated
  focusable handle. Accepted for a personal single-user list; keyboard reorder still works via
  `KeyboardSensor`, and checked/search rows are non-draggable.
- **The row must be registered as the activator node, not merely carry the listeners.** The keyboard
  sensor scopes a lift to the activator by comparing the key event's target against it, and skips
  that comparison entirely when no activator is registered — so listeners alone make every nested
  button's `Space`/`Enter` lift the row and suppress its own click. A dedicated handle hides this,
  because there the target is always the handle; whole-row activation is what makes the registration
  load-bearing.
- The nested-interactive markup this produces is invisible to static JSX linting, because the role
  and `tabIndex` arrive through a spread — see
  [0014-jsx-a11y-lint-rules.md](0014-jsx-a11y-lint-rules.md).
- Drag applies to the **unchecked list only**; checked items and search results render as plain,
  non-sortable rows.
- **The tradeoff is scoped to rows that are actually draggable.** dnd-kit returns its full attribute
  set even for a disabled sortable — only the listeners are withheld — so the row's ARIA is narrowed
  explicitly rather than passed through: a row that cannot be dragged right now (the add/search field
  has focus, or the row is being renamed) drops the role, the `tabIndex` and `aria-disabled` together
  and is a plain `listitem`. `aria-disabled` goes with them deliberately: it carries meaning only on a
  widget, and it makes Playwright treat every control inside the row as unactionable, since
  actionability inherits that state from ancestors.
- Verified on-device: touch press-and-hold lift + reorder, and keyboard reorder. `MouseSensor`
  covers desktop pointer drag.
