import { createMergeableStore } from "tinybase/mergeable-store";
import { createDurableObjectSqlStoragePersister } from "tinybase/persisters/persister-durable-object-sql-storage";
import { WsServerDurableObject } from "tinybase/synchronizers/synchronizer-ws-server-durable-object";
import type { Env } from "./env";

/** Close a socket after this long with no inbound message, bounding idle socket lifetime. */
export const IDLE_MS = 30 * 60 * 1000;

interface SocketState {
  lastSeen: number;
}

/**
 * Per-socket idle state, stored via serializeAttachment so it survives hibernation/eviction (the
 * DO keeps no in-memory socket fields).
 */
const socketState = (ws: WebSocket): SocketState | null => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- untyped `any`
  return ws.deserializeAttachment() as SocketState | null;
};

export class ShoppingListDurableObject extends WsServerDurableObject<Env> {
  createPersister() {
    const store = createMergeableStore();
    return createDurableObjectSqlStoragePersister(store, this.ctx.storage.sql);
  }

  /** Single-use ticket burn; the Worker already verified signature/TTL/listId/Origin. */
  override async fetch(request: Request): Promise<Response> {
    const jti = request.headers.get("X-Ticket-Jti");
    const exp = Number(request.headers.get("X-Ticket-Exp"));
    if (!jti || !Number.isFinite(exp) || exp <= 0) {
      return new Response("missing ticket", { status: 401 });
    }

    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS used_tickets (jti TEXT PRIMARY KEY, exp INTEGER)");
    sql.exec("DELETE FROM used_tickets WHERE exp < ?", Date.now());
    try {
      sql.exec("INSERT INTO used_tickets (jti, exp) VALUES (?, ?)", jti, exp);
    } catch {
      return new Response("ticket already used", { status: 401 });
    }

    const response = await super.fetch!(request);
    if (response.status === 101) {
      // The base already accepted the socket; the freshly-accepted one is the socket with no
      // attachment yet, so stamp only it and leave live sockets' deadlines untouched.
      const now = Date.now();
      for (const ws of this.ctx.getWebSockets()) {
        if (!socketState(ws)) ws.serializeAttachment({ lastSeen: now } satisfies SocketState);
      }
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(now + IDLE_MS);
    }
    return response;
  }

  /** Refresh this socket's idle deadline, then delegate to the base sync handler. */
  override async webSocketMessage(client: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const next: SocketState = { ...socketState(client), lastSeen: Date.now() };
    client.serializeAttachment(next);
    await super.webSocketMessage!(client, message);
  }

  /**
   * Close sockets idle past IDLE_MS, then reschedule to the earliest surviving deadline. Wrapped in
   * try/catch because an uncaught throw here drives Cloudflare's alarm-retry loop.
   */
  override async alarm(): Promise<void> {
    try {
      const now = Date.now();
      let nextDeadline = Infinity;
      for (const ws of this.ctx.getWebSockets()) {
        const lastSeen = socketState(ws)?.lastSeen ?? now;
        if (now - lastSeen >= IDLE_MS) {
          ws.close(1000, "idle");
        } else {
          nextDeadline = Math.min(nextDeadline, lastSeen + IDLE_MS);
        }
      }
      if (Number.isFinite(nextDeadline)) await this.ctx.storage.setAlarm(nextDeadline);
    } catch {
      // Swallow: rescheduling happens on the next connect; a throw here would retry-loop the alarm.
    }
  }
}
