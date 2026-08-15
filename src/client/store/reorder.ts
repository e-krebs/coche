import { generateKeyBetween } from "fractional-indexing";

/**
 * Total order by (position, id) — the id tiebreak keeps replicas in agreement when two rows mint
 * the same index.
 */
export const sortedByPosition = (ids: string[], getPosition: (id: string) => string): string[] =>
  [...ids].sort((a, b) => {
    const pa = getPosition(a);
    const pb = getPosition(b);
    if (pa !== pb) return pa < pb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

/**
 * Fractional position for `id` from its neighbours; null when `id` isn't in `order` or neighbours
 * collide (generateKeyBetween throws on prev >= next), so a drag never throws out of the handler.
 */
export const keyForPosition = ({
  order,
  id,
  getPosition,
}: {
  order: string[];
  id: string;
  getPosition: (id: string) => string;
}): string | null => {
  const i = order.indexOf(id);
  if (i < 0) return null;
  const prev = i > 0 ? getPosition(order[i - 1]) : null;
  const next = i < order.length - 1 ? getPosition(order[i + 1]) : null;
  try {
    return generateKeyBetween(prev, next);
  } catch {
    return null;
  }
};
