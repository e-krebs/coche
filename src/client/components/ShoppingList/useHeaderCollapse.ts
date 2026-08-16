import { useEffect, useLayoutEffect, useState } from "react";

/** Band 1's own height: past it, the title has scrolled away and shrinks. */
const COLLAPSE_AT = 44;
/** Hysteresis floor: the shrink itself can clamp scroll, which must not re-expand the header. */
const REEXPAND_AT = 8;

const scrollKey = (listId: string) => `shopping:scrollY:${listId}`;

/** The offset a fresh mount should restore for this list; 0 when there is nothing to restore. */
export const restoreTargetFor = ({ listId }: { listId: string }): number => {
  try {
    return Math.max(0, Number(sessionStorage.getItem(scrollKey(listId))) || 0);
  } catch {
    return 0;
  }
};

/** Once per page load, so a list switch — which remounts this hook — starts at the top instead. */
let scrollRestored = false;

/**
 * Owns the sticky-header collapse: tracks whether the page is scrolled past the fold and restores
 * the saved scroll offset once rows exist. Returns the collapsed flag.
 */
export const useHeaderCollapse = ({
  listId,
  itemsLength,
}: {
  listId: string;
  itemsLength: number;
}): boolean => {
  // Read at mount, not module load: the key is per-list, and nothing writes it before this hook runs.
  const [savedScroll] = useState(() => restoreTargetFor({ listId }));
  // Seed from the saved offset so a restore paints with the header already collapsed (else it
  // shifts content up).
  const [scrolled, setScrolled] = useState(savedScroll > COLLAPSE_AT);

  // Collapse the title once past the header; hysteresis so the header shrinking can't clamp scroll
  // back under the threshold and re-show it. Synchronizing with Effects (a scroll subscription with
  // stateful hysteresis), not the anti-pattern — a useSyncExternalStore snapshot can't carry the
  // prev-dependent threshold. https://react.dev/learn/synchronizing-with-effects
  // The listId dep is the storage key, not state mirroring a prop — onScroll() only reconciles the
  // seeded flag against the real offset.
  // oxlint-disable react-you-might-not-need-an-effect/no-external-store-subscription, react-you-might-not-need-an-effect/no-initialize-state, react-you-might-not-need-an-effect/no-adjust-state-on-prop-change
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((prev) => (prev ? y > REEXPAND_AT : y > COLLAPSE_AT));
      // Persist the real offset, 0 included — else a stale value makes the next load phantom-scroll
      // down.
      sessionStorage.setItem(scrollKey(listId), String(y));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Reconcile the seeded state: a restore or an unscrollable short list may fire no scroll event
    // to correct a stale collapsed header.
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [listId]);
  // oxlint-enable react-you-might-not-need-an-effect/no-external-store-subscription, react-you-might-not-need-an-effect/no-initialize-state, react-you-might-not-need-an-effect/no-adjust-state-on-prop-change

  // Router restores scroll before the async store loads, landing at 0. Restore in a layout
  // effect once rows exist so the list paints at the saved offset instead of visibly scrolling.
  useLayoutEffect(() => {
    if (scrollRestored || itemsLength === 0) return;
    scrollRestored = true;
    if (savedScroll > 0) window.scrollTo(0, savedScroll);
  }, [itemsLength, savedScroll]);

  return scrolled;
};
