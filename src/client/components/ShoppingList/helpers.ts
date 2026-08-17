import { flushSync } from "react-dom";

// Read imperatively rather than through a matchMedia listener: every consumer either calls this at
// mutation time or re-renders continuously through the drag/swipe that consumes it, so a stale value
// can never reach a visible animation.
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * flushSync so React commits the change synchronously and the View Transitions API snapshots the new
 * DOM. `after` runs once that commit has landed — a view transition defers `mutate` to a later frame,
 * so anything that has to observe the resulting DOM (reclaiming focus the mutation just dropped)
 * cannot simply run on the next frame.
 */
export const animate = (mutate: () => void, after?: () => void) => {
  if (typeof document.startViewTransition === "function" && !prefersReducedMotion()) {
    const transition = document.startViewTransition(() => {
      flushSync(mutate);
    });
    if (after) void transition.updateCallbackDone.then(after, after);
    // An overlapping mutation skips this transition, which rejects `finished` — expected, not a fault.
    void transition.finished.catch(() => undefined);
  } else {
    mutate();
    after?.();
  }
};
