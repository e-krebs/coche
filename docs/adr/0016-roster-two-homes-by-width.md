# 0016. The roster has two homes, chosen by width

## Status

Accepted.

## Context

The list roster started as a modal bottom sheet, and the header title is both the active list's name
and the button that opens it ([0013-multi-list-single-store.md](0013-multi-list-single-store.md)
covers why every list lives in one store). On a phone that is the right shape: there is room for one
column, so a second surface has to be transient.

Above about 1024 px there is room for four lists to stand permanently beside the list you are
reading, and the modal starts costing more than it buys — a scrim, a trapped Tab and a focus
restore, all to change which of four names is active. The same width also makes the title's double
duty awkward: a heading that opens a dialog is a compromise for a screen with nowhere else to put
the switcher.

Three layouts were mocked and reviewed before this decision. The rejected third, checked items as
their own column, is recorded in the repo's local backlog rather than here: it was never adopted, so
it has no decision to record.

## Decision

**The roster renders in one of two homes, chosen by viewport width.** Below `lg` it is the picker
sheet, exactly as before. At `lg` and above it is a persistent sidebar
([../../src/client/components/ListSidebar.tsx](../../src/client/components/ListSidebar.tsx)), and
three things move with it:

- **The `<h1>` stops being a button.** The sidebar is the switcher, so the title is a title: no
  `aria-haspopup`, no chevron, no tab stop. Its accessible name is still the list name at both
  widths, which is what heading navigation and voice control depend on.
- **`data-list-trigger` changes seat.** It marks the control that always exists and always names the
  active list — the header title on a phone, the sidebar's current row beside the list. Its four
  consumers (the row focus restore, and the fallback in the picker, the language chooser and the
  sync notice) are unchanged, and it stays a button either way, so a focus restore still cannot pop
  a soft keyboard.
- **Only the rows are shared, not their semantics.**
  [../../src/client/components/RosterRows.tsx](../../src/client/components/RosterRows.tsx) renders
  one row — name, unchecked count, active marker — under either of two role sets. In the sheet they
  are a `menu` of `menuitemradio`s with a roving tabindex, because arrows must rove without
  selecting: selecting closes the sheet, so the first arrow press would otherwise end the
  interaction. In the sidebar they are ordinary buttons in a `nav` landmark, in normal tab order,
  with `aria-current="true"` on the one you are on — a persistent region is navigation, not a menu.
  `"true"` rather than `"page"`: these are buttons that filter one store, not links to documents,
  and the URL they set is a device-local convenience rather than the thing being navigated.

**Editing the roster stays in the sheet, at every width.** The sidebar's Edit opens the sheet
straight into edit mode. Creating, renaming, reordering and deleting therefore have one
implementation and one drag-and-drop context, and that context is mounted only while the sheet is.

**The choice is made in JavaScript, not CSS.** `ListView` reads the width once through
`useMediaQuery` and both halves of the switch follow from that single value, so the sidebar and the
title cannot disagree about who owns picking — which a CSS-only sidebar plus a JS-only heading
would allow. The sidebar is then genuinely absent from the DOM on a phone rather than hidden in it.

## Consequences

- **`lg`, not `md`.** A 10.9″ tablet in portrait is 820 pt wide; a 17 rem sidebar would take a third
  of that for four names and leave the list narrower than the phone-plus-`md` column it replaced. So
  such a tablet gets the sidebar in landscape and the sheet in portrait, and **rotating the device
  changes which home the roster has** — accepted, and the reason the two homes must not drift apart
  in what they show. A 12.9″ tablet is 1024 pt even in portrait and keeps the sidebar throughout.
- **A screen wide enough for the sidebar never shrinks its header.** The scroll reclaim is frozen
  on `lg` as well as on a wide precise pointer, because up there the title is a plain heading with
  no smaller size to go to — scrolling would drop the account button and buy back a few pixels.
  That also removes the one combination neither Playwright project covers: wide and coarse.
- **The roster precedes the add/find field in tab order** above `lg`, so reaching the app's
  most-used control costs one Tab per list. The landmarks make it navigable and there is still no
  skip link, but the rationale for not having one is weaker than it was on a phone.
- **The roster is rendered twice in the codebase and once on screen.** The shared rows keep the
  name, the count and the active marker in one place, which is where a divergence would be silent.
  The role sets are deliberately not shared, and that is the standing cost of this decision.
- **The pick sheet is a phone surface above `lg`.** It has no entry point there, so the specs for
  its Tab trap, its Escape and its focus restore run only at phone width; the edit sheet's Escape,
  its focus restore and the inert page behind them are asserted above `lg` instead. The local
  Playwright tier runs both widths precisely so neither half goes unexercised
  ([../reference/testing.md](../reference/testing.md)).
- **Opening the sheet in edit mode has to place focus itself.** There is no active `menuitemradio`
  to aim at in that mode, and leaving focus on the sidebar button that opened it would put it
  outside the modal, where neither the Escape handler nor the Tab trap would ever see a key. It
  lands on the first rename row rather than the header toggle that is first in document order —
  that one now reads "Done", and answering a request to edit with the control that leaves editing is
  a strange place to arrive.
