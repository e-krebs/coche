# Architecture

Per-user, local-first shopping list: offline read+write on every device, auto-merge across a user's
devices, and list content at rest in the EU.

> New to an acronym here? See the [glossary](../reference/glossary.md).

## Test coverage

Client logic runs under Vitest (jsdom) in
`src/client/**`; the sync server runs under `@cloudflare/vitest-pool-workers` (miniflare) in
`src/server/__tests__/`. Two Playwright tiers exercise the browser:

- **Local-only** ([../../e2e/local/](../../e2e/local/)) — offline cold-boot, drag reorder, multi-tab
  persistence. Runs against a `vite preview` build with the sync server off (`VITE_SYNC_URL` empty)
  and Clerk's network blocked, so the app boots from a seeded cached identity
  ([../../e2e/local/fixtures.ts](../../e2e/local/fixtures.ts)). Hermetic, so it runs unconditionally
  in CI.
- **Sync** ([../../e2e/sync/](../../e2e/sync/),
  [../../playwright.config.sync.ts](../../playwright.config.sync.ts)) — real Clerk via
  `@clerk/testing` against a local `wrangler dev` Worker, provisioning a fresh `+clerk_test` user
  per test (each gets an isolated HMAC-derived sync unit, so a clean Durable Object). Covers live
  two-context CRDT merge, cross-user isolation, and sign-out clearing local data. CI runs it only
  when `CLERK_SECRET_KEY` is present.

Source: [../../src/client/store/](../../src/client/store/),
[../../src/client/components/](../../src/client/components/),
[../../src/server/](../../src/server/).

## Diagram

Renders on GitHub. The numbered edges are the connection handshake in order.

```mermaid
flowchart TB
  subgraph browser["Browser — static SPA on Cloudflare Pages"]
    spa["App shell<br/>TanStack Router · React 19 · Vite · Tailwind"]
    store["TinyBase MergeableStore (CRDT)<br/>+ mergeable IndexedDB persister<br/>per-user DB, all of the user's lists · offline read/write"]
    ident["cached userId · localStorage<br/>offline identity gate"]
    clerk["Clerk · clerk-js served same-origin"]
    sw["Service worker (PWA)<br/>precache shell · runtime-cache clerk-js · never caches authed responses"]
    spa <-->|"offline read/write"| store
    ident -.->|"gates first render (offline)"| spa
    clerk -.->|"sign-in → userId"| spa
    sw -.-> spa
  end

  worker["Cloudflare Worker.fetch()<br/>/ws-ticket: verifyToken → listId = HMAC(secret, sub) → mint ticket<br/>WS upgrade: validate ticket · exact-match Origin · strip ticket"]
  do["Durable Object · name = listId<br/>ShoppingListDurableObject extends WsServerDurableObject<br/>burns the single-use ticket (used_tickets)<br/>createDurableObjectSqlStoragePersister · SQLite<br/>jurisdiction('eu') in prod → EU data at rest"]

  spa -->|"1 · POST /ws-ticket (Bearer JWT)"| worker
  worker -->|"2 · listId + single-use ticket"| spa
  store <-->|"3 · WsSynchronizer over WSS<br/>wss://.../list/:listId?ticket=..."| worker
  worker -->|"resolveListStub — prod: jurisdiction('eu') · dev/test: plain namespace"| do
```

## Components

| Component | Role | Location |
|---|---|---|
| SPA shell | Routing, auth UI, app shell. A pathless `_app` layout route sits between the root and the per-list routes: the cached-identity gate, `StoreProvider`, the single `useSync` call and the roster-repair subscription mount there, above the `/lists/$listId` boundary, so switching lists never remounts the store or restarts the socket. `useSync`'s result reaches the list view through a context rather than the `Outlet` | [../../src/client/routes/__root.tsx](../../src/client/routes/__root.tsx), [../../src/client/routes/](../../src/client/routes/), [../../src/client/store/syncStatus.ts](../../src/client/store/syncStatus.ts), [../../src/client/router.tsx](../../src/client/router.tsx) |
| Clerk (client) | Identity provider: `ClerkProvider` + `useAuth` | [../../src/client/routes/__root.tsx](../../src/client/routes/__root.tsx), [../../src/client/env.ts](../../src/client/env.ts) |
| Cached identity gate | `{userId}` in localStorage; renders the app offline, independent of Clerk readiness | [../../src/client/store/identity.ts](../../src/client/store/identity.ts) |
| Local store | TinyBase `MergeableStore` (CRDT) ⇄ a mergeable `IndexedDB` persister that preserves HLCs and tombstones across reload; DB `shopping-<userId>` | [../../src/client/store/schema.ts](../../src/client/store/schema.ts), [../../src/client/store/store.ts](../../src/client/store/store.ts), [../../src/client/store/persister.ts](../../src/client/store/persister.ts) |
| Shopping list UI | The active list's items in two sections (unchecked/checked), search, rename, quantity, delete, drag-reorder — wrapped by a view that also carries the header's sync/account controls and the two dialogs | [../../src/client/components/ShoppingList/](../../src/client/components/ShoppingList/), [../../src/client/components/ListView.tsx](../../src/client/components/ListView.tsx) |
| List picker | Bottom sheet over the header title: switch list, and an edit mode to create, rename, reorder and delete lists — mounted above the keyed `<ShoppingList>` so a switch can't unmount it mid-interaction | [../../src/client/components/ListPicker.tsx](../../src/client/components/ListPicker.tsx), [../../src/client/components/ConfirmDialog.tsx](../../src/client/components/ConfirmDialog.tsx) |
| Lists roster | Virtual default row, the gated default-list migration, list CRUD, the orphan sweep and position backfill | [../../src/client/store/lists.ts](../../src/client/store/lists.ts) |
| Sign-out teardown | Deletes the local IndexedDB replica and broadcasts to peer tabs on any signed-out transition | [../../src/client/store/teardown.ts](../../src/client/store/teardown.ts) |
| Service worker | Precache the SPA shell; runtime-cache the same-origin `clerk-js` served from `/clerk-js/`; the sync Worker origin stays network-only | [../../vite.config.ts](../../vite.config.ts) |
| Content-Security-Policy | [../../csp/dev.headers](../../csp/dev.headers) is committed and host-pinned for dev/preview; production resolves [../../csp/prod.headers.template](../../csp/prod.headers.template) into `dist/_headers` at build time so no deployment host is committed (see [../adr/0011-deployment-identifiers-out-of-repo.md](../adr/0011-deployment-identifiers-out-of-repo.md)); `yarn check:csp` — a gate CI and `yarn deploy:spa` run, not `yarn build` — fails on drift between the two, a stray placeholder, a `dist/` with no policy, or a Report-Only template without an explicit opt-in | [../../scripts/check-csp.ts](../../scripts/check-csp.ts), [../../scripts/gen-headers.ts](../../scripts/gen-headers.ts) |
| `/ws-ticket` endpoint | Verifies the Clerk JWT (`verifyClerkUser`), derives `listId` and mints a single-use WS ticket (`deriveListId`, `mintTicket`) | [../../src/server/index.ts](../../src/server/index.ts), [../../src/server/clerk.ts](../../src/server/clerk.ts), [../../src/server/auth.ts](../../src/server/auth.ts) |
| WS upgrade handler | Validates the ticket and checks `Origin` (`verifyTicket`, `originAllowed`), forwards to the EU Durable Object, which burns the ticket | [../../src/server/index.ts](../../src/server/index.ts), [../../src/server/auth.ts](../../src/server/auth.ts) |
| Durable Object | `ShoppingListDurableObject`, one per derived `listId` — i.e. one sync unit per user, carrying all of their lists — `jurisdiction('eu')` in prod, SQLite-backed | [../../src/server/durable-object.ts](../../src/server/durable-object.ts) |

Constraints met: **local-first** (CRDT in IndexedDB, offline r/w, conflict-free), **EU residency**
(the DO is pinned `eu`), and **per-user with a path to sharing** (one DO per sync unit — one per
user today, holding every list they own; a membership layer is addable later without re-keying — see
[../adr/0006-deterministic-hmac-listid.md](../adr/0006-deterministic-hmac-listid.md)).

## Design & UX

Decisions that aren't obvious from the markup:

- **Lists & the picker** — the header title is the active list's name *and* the button that opens
  the list picker: a bottom sheet forked from the language chooser (scrim, `role="dialog"` +
  `aria-modal`, a trapped Tab). Its rows are a **menu** of `menuitemradio`s, not a radiogroup:
  arrows rove without selecting, because selecting switches list and closes the sheet, so the first
  arrow press would end the interaction. The trigger carries **no `aria-label`** — the list name has
  to be the `<h1>`'s accessible name, or heading navigation and voice control both lose it. Because
  the trigger lives in the title band, that band **shrinks** on scroll — a shorter band, dropping the
  sync dot and the avatar — instead of collapsing to nothing, so the picker stays reachable at any
  offset. The cost is a taller scrolled header. Each list shows its **unchecked** count only: the
  number you'd act on, so `0` reads as "nothing to do here". List management lives in the sheet's edit
  mode, and every action there leaves the sheet open — creating a list neither switches to it nor
  closes, so you can add several in one sitting: an inline new-list field, tap-to-rename reusing the
  row's input, a drag handle for ordering,
  and delete behind a confirmation nested inside the sheet, naming every item the delete destroys —
  checked included, which is why the roster carries both counts. Deleting the list you're standing on
  switches away and closes the sheet; deleting any other leaves it open. **Escape is decided in one
  place**, the sheet's own handler, so it can weigh what is in flight: it cancels a keyboard drag
  without closing (dnd-kit already reads Escape as cancel), it clears a half-typed list name rather
  than discarding it along with the sheet, and only otherwise closes. The inline rename input is the
  one exception, keeping `Enter` and `Escape` for itself — and only those two, so `Tab` still reaches
  the sheet's trap rather than being decided by native tab order. The active list is URL state
  (`/lists/$listId`, replacing rather than pushing so Back doesn't walk a switch history) plus a
  device-local last-used hint for `/` — deliberately not a synced value, same seam as the locale
  mirror. An id that no longer resolves redirects to the first list rather than a not-found screen.
  Switching resets the view: query cleared, any open editor closed, the checked section collapsed —
  all of it from remounting the list on a `key` rather than a reset routine. Scrolling to the top is
  the one explicit step, in the switch handler, because the page keeps its offset across a remount.
  Everything else about a switch is a client-side filter — one store per user holds every list, so
  there is no request and no loading state
  ([../adr/0013-multi-list-single-store.md](../adr/0013-multi-list-single-store.md)).
  [ListHeader.tsx](../../src/client/components/ShoppingList/ListHeader.tsx),
  [../../src/client/components/ShoppingList/](../../src/client/components/ShoppingList/).
- **Reorder** — dnd-kit, whole-row drag: press-and-hold on touch (220 ms activation delay so a
  vertical swipe still scrolls), 6 px on mouse, plus keyboard reorder; disabled while the
  add/search input is focused. The row is both the drag node and the registered **activator node**,
  and registering it as the activator is what scopes the keyboard sensor to the row: the sensor only
  compares a `Space`/`Enter` target against the activator when one exists, so without that
  registration the same keypress on a nested control lifts the row and suppresses the control's own
  click. A row that cannot currently be dragged carries none of the drag attributes at all and reverts
  to a plain list item, so it is neither a tab stop that does nothing nor an element claiming a widget
  state it has no role to hold; `data-draggable` is the signal that survives, for both styling and
  tests. Both drag surfaces also replace dnd-kit's built-in screen-reader copy, which is hardcoded
  English and interpolates the raw row id: the app supplies its own instructions, role description and
  start/move/drop/cancel announcements from the same typed dictionary as everything else, naming the
  **item or list** and its position. Items and lists get separate key sets rather than one with a noun
  slot, because French genders the article and the interpolator has no grammar.
  See [../adr/0008-dnd-kit-reorder.md](../adr/0008-dnd-kit-reorder.md).
- **Swipe-to-delete & undo** — on touch, a left-swipe reveals a growing red action pill that
  brightens past a one-third-width commit threshold. Only a finger-lift past the threshold commits;
  any `touchcancel` (edge back-swipe, shade pull, app-switch) springs back, so a destructive action
  never fires on an interrupted gesture. The undo window is **ten seconds and pauses on hover or
  focus**, because the snackbar is last in the DOM — several Tab presses away — and the delete has just
  moved focus onto a neighbouring row, so a short fixed window is unreachable by keyboard. If it does
  expire while the Undo button holds focus, the same restore that covers a delete catches the fall.
  A commit slides the row off and shows an Undo snackbar
  that restores the item via `store.setRow` under the same rowId, preserving its
  `(position, id)` order. The gesture tracks a single `Touch.identifier`, is suppressed during a
  drag, and is blocked from starting (but never torn down) while syncing. Delete is also reachable
  without touch via the row's edit mode — the same path in every row variant, checked and search rows
  included: activate the name to open the inline editor, then Tab to the Delete it reveals, which an
  `onBlur` guard keeps alive precisely so that Tab works.
  [../../src/client/components/ShoppingList/useSwipeToDelete.ts](../../src/client/components/ShoppingList/useSwipeToDelete.ts),
  [UndoSnackbar.tsx](../../src/client/components/ShoppingList/UndoSnackbar.tsx).
- **Announcements** — one polite `role="status"` region, mounted from the start and only ever swapping
  its text. A region that appears in the same commit as its content is the case VoiceOver and NVDA
  routinely miss, which is why it isn't rendered alongside the Undo snackbar it describes; the snackbar
  is the visual half only. It carries exactly two messages, both cases where the app moves focus
  somewhere that doesn't explain what happened: a **delete**, because focus lands on the *neighbouring*
  row and nothing else says the item went or that Undo exists, and **clearing checked items**, because
  the section vanishes and focus jumps to the header. Everything else is deliberately silent —
  check/uncheck and quantity are announced by the focused control's own `aria-pressed` and text, Undo's
  restore is announced by the focus move onto the restored row, and adding leaves focus in the field
  that just cleared. The search result count is the accessible **name of the results list** rather than
  an announcement: the field adds as well as finds, so someone typing a new item shouldn't hear match
  counts read at them. Over-announcing is its own accessibility bug.
- **Colour contrast** — the neutral ramp has a contract: `--color-faint` is for **decoration and
  disabled state only** (a radio outline, the offline dot, a `disabled:` colour, all of which the
  contrast minimums exempt), and `--color-muted` is the floor for anything a user has to read or
  click. `faint` cannot carry content — it measures about 2.4:1 on the canvas in light mode and 3.6:1
  in dark, so it fails body text in both, and fails even the 3:1 non-text bar for an icon button. That
  is why the empty and no-match copy, checked item names, the quantity glyph, list counts and the
  picker's icon buttons all sit on `muted`. `--color-accent-text` is the accent's *text* form, distinct
  from `--color-accent` (the butter-yellow fill, unchanged): it is tuned against the **canvas**, the
  worse of its two backgrounds, not against white, since that is the binding constraint. It also
  doubles as the focus-ring colour, so tuning it for text raises the ring's margin at the same time.
- **Focus visibility** — one house pattern, applied to every interactive control:
  `outline-hidden focus-visible:ring-2 focus-visible:ring-accent-text`, with `ring-inset` wherever the
  element clips (the row, whose `overflow-hidden` would cut an outset ring) and plain `focus:` rather
  than `focus-visible:` on text inputs, which should show focus however it arrived. `outline-hidden`
  rather than `outline-none` is load-bearing: rings are box-shadows, forced-colors modes strip
  box-shadows, and `outline-hidden` keeps a transparent outline that those modes repaint — so the
  indicator survives without a hand-written `forced-colors` block. Inline editors are marked by their
  background and a border, never by a permanent ring: the rename input deliberately keeps editing
  alive while focus moves to the row's Delete, so a ring that never leaves would claim focus that has
  gone elsewhere.
- **Modal containment** — the dialogs are hand-rolled `role="dialog"` elements with their own
  `keydown` Tab traps, not native `<dialog>`/`showModal()`: jsdom implements `HTMLDialogElement` as an
  empty subclass, so going native would move containment and Escape out of unit-test reach (see
  [../adr/0014-jsx-a11y-lint-rules.md](../adr/0014-jsx-a11y-lint-rules.md)). `aria-modal` alone only
  *claims* the page behind is unreachable, and a keydown trap has a blind spot — with focus on
  `<body>` there is no keydown to intercept. So the list is wrapped in an `inert` subtree whenever
  either dialog is open, which is a property of the tree rather than of a handler, and the sheet
  already does the same to itself while the nested confirmation is up. Focus restore survives it
  because closing clears `inert` in the same commit that unmounts the dialog, one frame before the
  deferred restore runs — the header trigger it reaches for lives inside that subtree.
- **Dialog naming** — each dialog is named by `aria-labelledby` pointing at its own visible `<h2>`,
  rather than an `aria-label` repeating the same words in a second place that can drift. The delete
  confirmation is an `alertdialog`, and its body — the sentence naming every item the delete
  destroys, and that it can't be undone — is wired as the accessible **description**, so it reaches
  assistive tech on arrival instead of only when the user reads past the title. State that a label
  change alone wouldn't announce is exposed too: `aria-pressed` on the Edit-lists toggle, which swaps
  the sheet's body between a menu and a sortable roster, and `aria-controls` on the checked
  disclosure. The picker trigger deliberately carries **no `aria-expanded`** — `aria-haspopup="dialog"`
  already says a dialog opens, `aria-expanded` describes content that expands in place, and while the
  sheet is open the trigger sits inside an `inert` subtree, so the value could never be read as
  anything but `false`.
- **Landmarks & headings** — the items sit in a `<main>`, with the title band left outside it so it
  keeps its `banner` role. Heading structure carries the two groups: the list name is the `<h1>` (and
  the picker trigger), and the checked disclosure is an `<h2>`, so heading navigation can tell "still
  to buy" from "already in the basket" without reading through. There is deliberately **no skip
  link**: the add/find field lives inside the header, so skipping to the main landmark would jump past
  the app's most-used control, and a landmark already satisfies bypass-blocks on a single-screen app.
  There is nothing repeated across pages to bypass.
- **Focus & keyboard** — mutations that unmount the focused control return focus to a button rather
  than dropping it to `<body>`: rename/quantity commits refocus the row, delete moves to a
  neighbour, Undo returns to the restored item. When there is no row left to return to — the last
  item deleted, or the checked section cleared out from under the button that cleared it — focus falls
  back to the header title, the one button that always exists and stays visible at any scroll offset.
  Each reclaim waits for the mutation to actually land rather than for the next frame: a view
  transition defers the DOM change to a later frame, so a restore scheduled immediately still sees the
  old tree, decides nothing was lost, and does nothing — the control then disappears with no second
  attempt. jsdom has no View Transitions API, so this is a browser-only failure mode and the reason the
  animation helper takes an after-callback instead of the caller guessing a delay. Each only reclaims focus that was genuinely lost, so
  it never steals focus the user moved on purpose, and always targets a button so it can't pop the
  soft keyboard. The same rule holds through the picker's two nested layers: opening the sheet moves
  focus into it and closing returns it to the title trigger, and the delete confirmation — a dialog
  inside a dialog — returns focus to the row that opened it, not to whatever the DOM happened to
  leave focused. All three dialogs share one hook for this, and restore on the frame *after* they
  unmount rather than during cleanup: a switch remounts the header in the same commit that closes
  them, so the captured opener is still connected while cleanup runs and only dies afterwards —
  focusing it there would drop focus to `<body>`. The language chooser leans hardest on the fallback,
  because its opener is a Clerk menu item that unmounts along with the menu, so the captured node is
  normally detached by the time focus is handed back; the header title is the selector it falls back
  to, being the one control present and visible at any scroll offset.
  [focus.ts](../../src/client/components/focus.ts).
  [../../src/client/components/ShoppingList/useListActions.ts](../../src/client/components/ShoppingList/useListActions.ts),
  [ItemRow.tsx](../../src/client/components/ShoppingList/ItemRow.tsx).
- **Internationalisation** — FR/EN via a typed dictionary
  ([../../src/client/i18n/](../../src/client/i18n/)); English keys are the source of truth, so a
  missing French key is a compile error, and `t(key, vars)` interpolates `{name}`/`{count}` and
  picks a `{ one, other }` plural form by `count` via the locale's `Intl.PluralRules`. The
  chosen language is a synced CRDT value (`VALUES_SCHEMA.locale`) mirrored to `localStorage` so it's
  readable above `StoreProvider` — that mirror drives both the app UI and Clerk's own strings
  (`@clerk/localizations`). The copy stays **neutral about what a list is for**: a list can be
  Hardware or Garden as easily as a weekly shop, so strings talk about items and lists rather than
  buying or shopping. (The product framing — the app's name, the manifest, this repo's README — is
  positioning, and stays.)
  [../../src/client/routes/__root.tsx](../../src/client/routes/__root.tsx).
- **Theme** — light and dark, following `prefers-color-scheme`. The butter accent holds in both and
  `--color-accent-text` swaps to a readable tone per theme. A lighter header (`--color-header`) over
  a darker canvas (`--color-canvas`) is held by dedicated tokens because `surface`/`surface-2` don't
  keep a consistent lightness order across themes. Clerk's own components follow the same light/dark
  via `@clerk/themes`. [../../src/client/styles.css](../../src/client/styles.css).
- **Motion** — add/check/delete animate through the View Transitions API (`flushSync` commits the
  store change before the API snapshots; each row carries a `view-transition-name`, and rows in a
  collapsed section render at `opacity: 0` so a named element isn't lifted out of its clip).
  The checked-section fold uses CSS `grid-template-rows`, and the title band's shrink is a CSS
  transition on the same scrolled flag — sized down to a shorter band rather than to zero, so the
  picker trigger is never unmounted mid-scroll. Swipe-to-delete tracks the finger with a CSS
  transform and springs back with a CSS transition, and crossing the delete threshold plays a short
  CSS keyframe pulse. Motion is CSS-driven (no hand-rolled JS animation) and
  all of it is gated on `prefers-reduced-motion`.
  [../../src/client/components/ShoppingList/helpers.ts](../../src/client/components/ShoppingList/helpers.ts),
  [ItemRow.tsx](../../src/client/components/ShoppingList/ItemRow.tsx).
- **Scroll restoration** — page-level scroll under a sticky header; the offset is persisted to
  `sessionStorage` under a **per-list** key and re-applied before paint in a `useLayoutEffect` once
  rows exist. One shared key would restore list A's offset into list B, so the key carries the list
  id. Restoring is **reload-only**: switching lists scrolls to top, because landing halfway down a
  list you just picked reads as a bug rather than as a convenience.
  `history.scrollRestoration` is `manual`, and `StoreProvider` withholds the list until the local
  load resolves so it paints populated and already-scrolled.
  [../../src/client/main.tsx](../../src/client/main.tsx),
  [../../src/client/store/StoreProvider.tsx](../../src/client/store/StoreProvider.tsx).
- **Insecure-context ids** — `newItemId` falls back to `crypto.getRandomValues` when
  `crypto.randomUUID` is unavailable (non-secure origins, e.g. a `http://` LAN IP during device
  testing). [../../src/client/store/store.ts](../../src/client/store/store.ts).

## EU residency

The hard constraint is data residency in the EU. The design meets it for **data at rest**, not for
every hop or every actor. The caveats matter — this is not "EU sovereign":

- **At rest, not in transit.** Every request first lands on the nearest Cloudflare edge PoP before
  reaching the `eu` Durable Object; for a travelling user that PoP can be outside the EU.
- **The DO `id` is logged outside the jurisdiction.** Cloudflare's request logging is not itself
  pinned to `eu`; the DO identifier (not the list content) can appear in logs processed elsewhere.
- **Clients hold full local replicas** wherever the device physically is — "at rest in the EU"
  describes the server copy, not every copy.
- **Clerk stores identity data in the US.** Only the list content is pinned; auth and profile data
  are out of scope.
- **`jurisdiction('eu')` is a Cloudflare region, not a specific member state, and not legal
  sovereignty.** There's no control over the operator and no assurance against non-EU legal process
  reaching Cloudflare. True sovereignty would mean an EU-domiciled operator (e.g. OVH, Scaleway) —
  out of scope here.

DO SQLite is encrypted at rest (Cloudflare-managed), which is a security property, not a residency
one. See [../adr/0004-eu-residency-cloudflare.md](../adr/0004-eu-residency-cloudflare.md).
