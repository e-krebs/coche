import { useCallback, useSyncExternalStore } from "react";

/**
 * A precise pointer — a mouse or trackpad, not a finger. What separates an affordance that can be
 * revealed on hover from one that has to be permanently visible.
 */
export const PRECISE = "(pointer: fine)";

/**
 * Wide *and* precise: a desktop, not a tablet held in landscape. Width alone would freeze the
 * header's scroll reclaim on a 1180px iPad that is only 700px tall and about to lose a third of
 * that to a soft keyboard. No height term — a short desktop window keeps the tall header, which is
 * the trade for not carrying a second threshold that would flap as the window resizes.
 */
export const WIDE_AND_PRECISE = "(min-width: 48rem) and (pointer: fine)";

/**
 * Subscribes to a media query. Reports `false` wherever `matchMedia` is missing — jsdom ships none,
 * so every branch this gates is unreachable under Vitest and belongs to the e2e tier instead. A
 * component with unit assertions to keep should take the result as a prop rather than read it here,
 * so both of its branches stay testable.
 */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof matchMedia !== "function") return () => {};
      const mq = matchMedia(query);
      mq.addEventListener("change", onStoreChange);
      return () => {
        mq.removeEventListener("change", onStoreChange);
      };
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => typeof matchMedia === "function" && matchMedia(query).matches,
    [query],
  );

  // Server snapshot: no viewport to measure, so nothing matches — the same answer jsdom gives.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
};
