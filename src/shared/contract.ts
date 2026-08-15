/** Client/server WebSocket-handshake contract. */
export interface WsTicket {
  listId: string;
  ticket: string;
}

/** Sync WS URL format `/list/<listId>?ticket=<ticket>`. */
export const wsUrl = ({
  syncUrl,
  listId,
  ticket,
}: {
  syncUrl: string;
  listId: string;
  ticket: string;
}): string =>
  `${syncUrl.replace(/^http/, "ws")}/list/${encodeURIComponent(listId)}?ticket=${encodeURIComponent(ticket)}`;

/** Recover listId + ticket; null if either is absent. */
export const parseWsUrl = (url: URL): WsTicket | null => {
  if (!url.pathname.startsWith("/list/")) return null;
  const listId = decodeURIComponent(url.pathname.slice("/list/".length));
  const ticket = url.searchParams.get("ticket");
  return listId && ticket ? { listId, ticket } : null;
};
