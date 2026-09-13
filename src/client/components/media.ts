import { useCallback, useRef, useSyncExternalStore } from "react";
import { prefersReducedMotion } from "client/components/ShoppingList/helpers";

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
 * Room for the roster to stand beside the list rather than over it. Width only: a tablet in
 * landscape is a fine place for the sidebar, it just shouldn't lose the header's scroll reclaim.
 */
export const WIDE = "(min-width: 64rem)";

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

const CROSSING = "data-crossing";
/** The length of the sidebar's slide, which the two keyframes in `styles.css` share. */
const SLIDE_MS = 250;

/**
 * `WIDE`, with each crossing marked on the root element for the sidebar to animate on. The marker
 * is why the animation belongs to the crossing rather than to every mount — deleting the active
 * list remounts the view — and its two values are which direction to play.
 *
 * A departure is held back for the length of its slide, then committed: the sidebar animates while
 * it is still mounted, because an unmount has nothing left to animate. Everything stays CSS for the
 * same reason the mount does — no resize can interrupt a keyframe, and a drag across the threshold
 * is a resize on every frame.
 *
 * Its own hook rather than an option on `useMediaQuery`: the deferred commit and the marker's two
 * values belong to the sidebar, not to a media query. Exactly one component may call it — the marker
 * is on the root element while the state is this hook's own, so a second caller would clear a marker
 * it does not own and hold an answer the first one has already moved on from. The route reads it and
 * passes `wide` down, which is the same reason that prop exists at all. The answer is held in a ref because
 * `getSnapshot` is re-read on every render, and `matchMedia` answers the new width immediately —
 * read live, an unrelated update would commit the unmount before the slide had started.
 */
export const useWide = (): boolean => {
  const matches = useRef(typeof matchMedia === "function" && matchMedia(WIDE).matches);
  // One crossing at a time: the crossing back cancels whatever the last one still had pending.
  const epoch = useRef(0);

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof matchMedia !== "function") return () => {};
    const mq = matchMedia(WIDE);
    const root = document.documentElement;

    // Reads `mq`, not an event, so the re-read below can share it.
    const onChange = () => {
      const id = (epoch.current += 1);
      const mine = () => epoch.current === id;
      const slide = prefersReducedMotion() ? 0 : SLIDE_MS;
      if (mq.matches) {
        // Back before the last departure committed, so the sidebar never left: there is nothing to
        // animate in, and dropping the marker returns it to its place.
        if (matches.current) {
          root.removeAttribute(CROSSING);
          return;
        }
        root.setAttribute(CROSSING, "in");
        matches.current = true;
        onStoreChange();
        window.setTimeout(() => {
          if (mine()) root.removeAttribute(CROSSING);
        }, slide);
        return;
      }
      root.setAttribute(CROSSING, "out");
      window.setTimeout(() => {
        if (!mine()) return;
        matches.current = false;
        onStoreChange();
        root.removeAttribute(CROSSING);
      }, slide);
    };

    mq.addEventListener("change", onChange);
    // The width can cross between the render that read it and this subscription.
    if (mq.matches !== matches.current) onChange();
    return () => {
      mq.removeEventListener("change", onChange);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => matches.current,
    () => false,
  );
};
