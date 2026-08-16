import { flushSync } from "react-dom";

// Read imperatively rather than through a matchMedia listener: every consumer either calls this at
// mutation time or re-renders continuously through the drag/swipe that consumes it, so a stale value
// can never reach a visible animation.
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * flushSync so React commits the change synchronously and the View Transitions API snapshots the
 * new DOM.
 */
export const animate = (mutate: () => void) => {
  if (typeof document.startViewTransition === "function" && !prefersReducedMotion()) {
    document.startViewTransition(() => {
      flushSync(mutate);
    });
  } else {
    mutate();
  }
};
