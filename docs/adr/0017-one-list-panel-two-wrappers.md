# 0017. One lists panel, two wrappers

## Status

Accepted. Supersedes the editing clause, the `data-list-trigger` contract and the
two-implementations consequence of
[0016-roster-two-homes-by-width.md](0016-roster-two-homes-by-width.md); the rest of 0016 — two homes
chosen by width, `lg` rather than `md`, and role sets that stay unshared — still stands.

## Context

0016 gave the lists two homes and left them two implementations: a `nav` column above `lg`, a modal
sheet below it, with editing in the sheet at every width. Their state was split the same way —
`ListView` held "the sheet is open" and the sheet itself held "it is in edit mode", and neither
answered to the width.

Nothing in that shape forbids a sheet and a sidebar at once, and two routes reached it. Resizing past
`lg` with the pick sheet open left the sheet standing over the arriving sidebar: two panels showing
the same rows, one modal over the other. Pressing Done in the edit sheet above `lg` did the same
thing, uncovering a pick menu the sidebar already was.

A guard on either route would have left the state that expresses the bug intact.

## Decision

**The lists are one component, rendered inside one of two wrappers chosen by width.**
[../../src/client/components/ListPanel.tsx](../../src/client/components/ListPanel.tsx) holds
everything that isn't chrome — the heading and its Edit/Done toggle, the pickable rows, the edit
rows, the create field, the delete confirmation, all of the panel's state and the arbitration of
Escape. It renders itself inside
[../../src/client/components/ListSheetWrapper.tsx](../../src/client/components/ListSheetWrapper.tsx)
below `lg` or
[../../src/client/components/ListSidebarWrapper.tsx](../../src/client/components/ListSidebarWrapper.tsx)
above it. Two panels cannot be on screen because there is only one panel: a resize swaps its wrapper.

**One mode, owned by `ListView`.** `"closed" | "pick" | "edit"` replaces the two booleans. Above `lg`
`"closed"` and `"pick"` are the same picture, so a `"pick"` that survives the crossing collapses to
`"closed"` — adjusted during render, where React re-runs the component before reconciling its
children, so the two panels never commit. An Effect would paint them together for a frame, and is
the shape `react-you-might-not-need-an-effect` rejects.

**Editing follows the panel into whichever home it has.** Above `lg` the sidebar itself flips into
edit mode: no sheet exists up there at all, and Done drops back to picking rather than uncovering a
duplicate. The column widens from 17 rem to 22 rem for the duration — a row there holds a drag
handle, a rename field and a delete — transitioned on its own `width` rather than on the grid track,
which interpolates unevenly across engines. The create field is pinned to the column's floor, as the
heading is pinned to its top.

**The panel's state outlives a change of home.** The wrapper is a different component at the same
position, so React discards its subtree on a swap — which is why the rename in progress and the
new-list name are held in the panel rather than in the fields, and why the arriving sheet places
focus only when the field doesn't already have it. Both are what make an edit session ride the
crossing instead of being silently committed by a blur.

**`data-list-trigger` moves to the Done toggle while editing.** No row carries `aria-current` in
that mode, so the anchor's promise narrows: it always exists, it is always a button, and it names the
active list *whenever the panel is picking*. The toggle is the one control edit mode cannot lose, and
it is stable under reorder.

## Consequences

- **The bug is unrepresentable, not guarded.** No arrangement of the mode and the width puts two
  panels on screen, and the pick sheet has no entry point above `lg` by construction rather than by
  omission.
- **Nothing is modal above `lg`.** The list beside the editor stays live, which is the point — but
  every focus rescue the `inert` page used to make unnecessary now has to exist: a rename that closes
  returns focus to its row, leaving edit mode returns it to the anchor, and the delete confirmation
  carries a fallback selector rather than deferring to a sheet that no longer unmounts. The
  confirmation itself is a sibling of both wrappers: nested in the sticky column it would be trapped
  in that stacking context, and nested in the sheet it would go `inert` with the panel.
- **The mode flip is announced.** Below `lg` the dialog boundary and the focus move into it say that
  editing began; in a column that flips in place, nothing does — so the panel owns a polite live
  region for the flip and for a list being deleted. Two polite regions are then on screen above `lg`,
  the panel's and the list's.
- **Tab order above `lg` gets worse while editing.** Picking costs one stop per list before the
  add/find field (0016); editing costs three per list plus the two create controls, with no trap,
  because the column is not modal. Landmark navigation is still the way past it, and the argument for
  having no skip link — that skipping to `main` would jump past the app's most-used control — now
  cuts the other way: at this width a link *to* the add/find field would skip the roster rather than
  the field.
- **The lists are rendered once in the codebase.** 0016 accepted two implementations as a standing
  cost; this pays it off. What stays deliberately unshared is the role sets — a `menu` of
  `menuitemradio`s in the sheet, `nav` buttons with `aria-current` in the column — which
  [../../src/client/components/ListRows.tsx](../../src/client/components/ListRows.tsx) selects with
  a prop.
- **Reordering in the column needs a drag overlay.** The column is `sticky`, so dnd-kit's scroll
  compensation would slide the lifted row away from the row it lands on when the page scrolls
  mid-drag. The sheet is `fixed`, which keeps the page's scroll out of those sums, so it keeps the
  plain transform. The overlay stays inside the column, which is a stacking context: a lift dragged
  out over the list paints under the list's own sticky header. That is cosmetic and drag-only, and
  the alternative — portalling it out — would take the lifted row out of the panel it belongs to.
- **Both wrappers are unit-testable.** The width reaches the panel as a prop, so jsdom — which has no
  `matchMedia` — can reach the sidebar's branch for the first time. `ListView` itself still can't be
  mounted there (Clerk's `useUser` throws outside its provider), so only its mode rule is exported
  for a unit test and the wiring it feeds stays with the e2e tier.
- **A tablet rotated mid-edit keeps its edit session**, and the field it restores focus to may pop a
  soft keyboard. That is the user's own rename following them, which is the lesser of the two
  surprises available.
