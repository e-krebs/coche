# Glossary

Acronyms and terms used across the code and docs, grouped by area.

## Web & frontend

- **SPA** — Single-Page Application. The app is a static SPA; there is no server-side rendering (see
  [../adr/0001-drop-tanstack-start.md](../adr/0001-drop-tanstack-start.md)).
- **SSR** — Server-Side Rendering. Dropped in favor of the SPA.
- **PWA** — Progressive Web App. An installable, offline-capable web app.
- **SW** — Service Worker. A background script that precaches the shell for offline use.
- **DOM** — Document Object Model. The live tree of elements a browser renders.
- **UI / UX** — User Interface / User Experience.
- **a11y** — Accessibility (a-*11 letters*-y).
- **i18n** — Internationalization (i-*18 letters*-n). Here, FR/EN.
- **SR** — Screen Reader.

## Data & sync

- **CRDT** — Conflict-free Replicated Data Type. A data structure whose replicas merge automatically
  without conflicts — the basis for offline multi-device editing. See
  [auth-and-sync.md](../explanation/auth-and-sync.md#crdt-merge-semantics).
- **HLC** — Hybrid Logical Clock. The per-cell timestamp TinyBase uses to decide which write wins.
- **LWW** — Last-Write-Wins. The merge rule: the write with the later HLC wins, per cell.
- **`listId`** — Two unrelated things share this name. **`items.listId`** is a row id in the local
  `lists` table: client-side only, one value per list the user owns, and what the UI filters on. The
  **derived `listId`** is `HMAC(serverSecret, userId)` and names the *sync unit* — one Durable
  Object and one local replica per user, carrying all of that user's lists. See
  [data-model.md](data-model.md) and
  [../adr/0013-multi-list-single-store.md](../adr/0013-multi-list-single-store.md).
- **Sync unit** — The scope one Durable Object and one IndexedDB replica cover: one per user, named
  by the derived `listId`, holding every list that user owns.
- **IndexedDB** — The browser's local database; holds the offline replica of every list the user
  owns.
- **SQL / SQLite** — The Durable Object's on-disk store (the server source of truth).

## Auth & tokens

- **JWT** — JSON Web Token. The signed Clerk session token the client sends to authenticate.
- **sub** — The JWT "subject" claim: the authenticated user's id (input to the `listId` HMAC).
- **jti** — JWT ID: the ticket's unique id, burned after one use to prevent replay.
- **azp** — "Authorized party" JWT claim, checked against the Worker's `authorizedParties`.
- **HMAC** — Hash-based Message Authentication Code. A keyed hash; derives the sync unit's `listId`
  from the user id with a server secret. See
  [auth-and-sync.md](../explanation/auth-and-sync.md#listid-derivation).
- **TTL** — Time To Live. The WS ticket's short (~30s) validity window.
- **CORS** — Cross-Origin Resource Sharing. The browser's cross-origin request rules; the Worker
  uses an exact-match allowlist.
- **CSWSH** — Cross-Site WebSocket Hijacking. The attack the single-use ticket primarily defends
  against.
- **WS / WSS** — WebSocket / WebSocket Secure (`ws://` / `wss://`). The sync transport.
- **FAPI** — Clerk's Frontend API (served from Clerk's host); its authed JSON is never cached.

## Cloudflare & infra

- **DO** — Durable Object. A single-instance, stateful Cloudflare compute unit; one per derived
  `listId`, i.e. one sync unit per user, pinned to the `eu` jurisdiction. See
  [architecture.md](../explanation/architecture.md#diagram).
- **KV** — Key-Value (Cloudflare KV). The non-SQLite DO storage class this project avoids
  (`new_sqlite_classes`, not `new_classes` — see [deploy.md](../how-to/deploy.md)).
- **EU** — European Union. The Cloudflare `jurisdiction('eu')` where list content rests.
- **PoP** — Point of Presence. A Cloudflare edge location a request first lands on.
- **CDN** — Content Delivery Network. Cloudflare Pages serves the SPA (including the bundled
  `clerk-js`) from the edge.
- **DNS** — Domain Name System. Only a subdomain CNAME moves to Cloudflare; the zone stays put.
- **LAN** — Local Area Network. A `http://` LAN IP is a non-secure origin during device testing.
- **CI** — Continuous Integration. The GitHub Actions workflow
  ([../../.github/workflows/ci.yml](../../.github/workflows/ci.yml)).

## Project

- **ADR** — Architecture Decision Record. The numbered decision docs under [../adr/](../adr/).
