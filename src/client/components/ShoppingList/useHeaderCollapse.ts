import { useEffect, useLayoutEffect, useState } from "react";

/**
 * Read once before React mounts so load-time resets or gate remounts can't clobber the restore
 * target.
 */
const savedScroll = Number(sessionStorage.getItem("shopping:scrollY")) || 0;
let scrollRestored = false;

/**
 * Owns the sticky-header collapse: tracks whether the page is scrolled past the fold and restores
 * the saved scroll offset once rows exist. Returns the collapsed flag.
 */
export const useHeaderCollapse = (itemsLength: number): boolean => {
  // Seed from the saved offset so a restore paints with the header already collapsed (else it
  // shifts content up).
  const [scrolled, setScrolled] = useState(savedScroll > 44);

  // Collapse the title once past the header; hysteresis so the header shrinking can't clamp scroll
  // back under the threshold and re-show it. Synchronizing with Effects (a scroll subscription with
  // stateful hysteresis), not the anti-pattern — a useSyncExternalStore snapshot can't carry the
  // prev-dependent threshold. https://react.dev/learn/synchronizing-with-effects
  // oxlint-disable react-you-might-not-need-an-effect/no-external-store-subscription, react-you-might-not-need-an-effect/no-initialize-state
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((prev) => (prev ? y > 8 : y > 44));
      // Persist the real offset, 0 included — else a stale value makes the next load phantom-scroll
      // down.
      sessionStorage.setItem("shopping:scrollY", String(y));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Reconcile the seeded state: a restore or an unscrollable short list may fire no scroll event
    // to correct a stale collapsed header.
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  // oxlint-enable react-you-might-not-need-an-effect/no-external-store-subscription, react-you-might-not-need-an-effect/no-initialize-state

  // Router restores scroll before the async store loads, landing at 0. Restore in a layout
  // effect once rows exist so the list paints at the saved offset instead of visibly scrolling.
  useLayoutEffect(() => {
    if (scrollRestored || savedScroll <= 0 || itemsLength === 0) return;
    scrollRestored = true;
    window.scrollTo(0, savedScroll);
  }, [itemsLength]);

  return scrolled;
};
