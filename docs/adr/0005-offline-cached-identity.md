# 0005. Trust a cached identity for offline boot

## Status

Accepted

## Context

The app must work fully offline, including a cold boot with no network. Clerk can't verify a session
offline — there's no way to validate a JWT against an unreachable server. Without an offline-trusted
notion of "who is this," the app either can't render offline or has to wait on Clerk before showing
anything, which defeats "offline read+write."

## Decision

Cache `{userId}` in localStorage after any successful online sign-in. On boot, if a cached identity
exists, render the app and open the local TinyBase store for that user **immediately**, independent
of Clerk's own readiness — Clerk catches up (or fails to reach the network) in the background. Only
when there is no cached identity does the app fall through to the Clerk `<SignedOut>` → `/sign-in`
path. The first-ever run therefore requires one online session.

## Consequences

- **Shared-device safety.** When Clerk resolves, if the confirmed `userId` differs from the cached
  one (or the user is signed out), the app tears down the local store and cached identity *before*
  first render of that user's data — otherwise a second person on a shared device could briefly see
  or write into the previous user's cached list.
- **Revoked-while-offline tradeoff.** A user whose session was revoked server-side keeps offline
  access to their cached local replica until they're next online and Clerk contradicts the cache. An
  accepted cost of trusting a cache at all — the alternative (no offline boot) defeats the
  local-first requirement.
- **Auth-at-upgrade tradeoff.** WS authorization happens only at connection upgrade (ticket
  validated + burned once). A DO alarm now bounds *idle* sockets — closing them after ~30 minutes of
  silence so the client re-tickets on reconnect
  ([0010-do-idle-socket-alarm.md](0010-do-idle-socket-alarm.md)) — but there is still no
  *absolute*-lifetime cap forcing periodic re-auth on an actively-used socket.
  (`WsServerDurableObject`'s own request/fragment timeouts use `setTimeout`, not the DO alarm slot,
  so the alarm was free to add.) Combined with the cached-identity gate, an active socket is never
  re-authorized mid-connection: revocation is only as fast as the next reconnect or the next time
  the client goes online and Clerk contradicts the cache. Acceptable in v1 (a user can't be revoked
  from their own only list); sharing will need a stored membership roster *and* that absolute
  re-auth cap. See
  [../explanation/auth-and-sync.md#limitations](../explanation/auth-and-sync.md#limitations).
- `clerk-js` is served same-origin from `/clerk-js/` — bundled from the `@clerk/clerk-js`
  dependency at build and runtime-cached by the service worker (StaleWhileRevalidate) — for boot
  speed, but that's a performance detail, not the mechanism that makes offline boot work: the
  cached-identity gate does that, since session verification is impossible offline regardless.
  Offline boot is unaffected either way.
