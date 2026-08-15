# 0010. Idle-socket lifetime alarm on the Durable Object

## Status

Accepted. Revises the "there is no DO socket-lifetime alarm" statements in
[0003-do-per-listid.md](0003-do-per-listid.md) and
[0005-offline-cached-identity.md](0005-offline-cached-identity.md) — their core decisions are
unaffected; only the claim that the Durable Object has (and can have) no alarm is corrected here.

## Context

`ShoppingListDurableObject` authorizes a WebSocket only at the upgrade — a single-use ticket,
validated by the Worker and burned in the DO. Once open, a socket is never re-checked, so an idle or
abandoned socket keeps a Durable Object awake and its authorization outlives the ~30s ticket
indefinitely. Bounding socket lifetime is the eventual basis for revocation once lists are shared.

An earlier assumption held that a DO alarm could not be added because it would interfere with
`WsServerDurableObject`'s own request/fragment timeouts. That assumption is wrong: the base class
implements those timeouts with `setTimeout`, not `ctx.storage.setAlarm`, and defines no `alarm()`
handler — the DO's single alarm slot is unused and free.

Two forces shape how aggressive the cap can be:

- **No production revocation exists yet.** A user cannot be revoked from their own only list, so a
  socket-lifetime cap only becomes a security mechanism once sharing (a stored membership roster)
  ships.
- **The TinyBase client synchronizer does not heartbeat.** A healthy but quiet client sends nothing
  between edits, so a short or absolute lifetime cap would tear down and re-ticket perfectly good
  connections — churning sockets and burning tickets for no benefit.

Cloudflare WebSocket Hibernation means the DO can be evicted between messages, so any per-socket
state must survive eviction — it cannot live in instance fields.

## Decision

Add an **idle-only** socket-lifetime alarm to `ShoppingListDurableObject`
([../../src/server/durable-object.ts](../../src/server/durable-object.ts)):

- Each socket carries a `{ lastSeen }` attachment via `serializeAttachment` /
  `deserializeAttachment`, stamped at connect and refreshed on every inbound message
  (`webSocketMessage`). Storing it on the socket rather than in memory keeps it correct across
  hibernation.
- A coarse DO alarm (~30 minutes) sweeps `ctx.getWebSockets()`, closes any socket idle longer than
  the threshold with a normal close (`1000`, `"idle"`), and reschedules to the earliest surviving
  `lastSeen + threshold`; when no sockets remain it does not reschedule. The alarm is scheduled once
  per connect and only when none is already set — never per message — so message volume never storms
  the alarm.
- The alarm body is wrapped in try/catch: an uncaught throw would trigger Cloudflare's alarm-retry
  loop.
- **No absolute-lifetime cap.** Sockets are bounded by inactivity only; an actively-used connection
  stays open on its original ticket.

The client already reconnects on `close` with a fresh single-use ticket
([../../src/client/store/sync.ts](../../src/client/store/sync.ts)), so an alarm-driven close is
handled like any other drop.

## Consequences

- Idle and abandoned sockets no longer keep a Durable Object awake indefinitely. On a multi-device
  list the sweep closes only the individually-idle socket, never blanket-closes.
- Revocation latency is unchanged for an active socket — the idle alarm is not a re-auth mechanism.
  Immediate revocation still waits on sharing, which will need both a membership roster and an
  **absolute** re-auth cap. See [0005-offline-cached-identity.md](0005-offline-cached-identity.md)
  and [../explanation/auth-and-sync.md#limitations](../explanation/auth-and-sync.md#limitations).
- A server-initiated `close()` may not re-fire `webSocketClose`; this is harmless — the base's hook
  is no-op bookkeeping and `ctx.getWebSockets()` self-corrects on the next sweep.
