import { flushSync } from "react-dom";

/**
 * Focus dropped (body/nothing/detached) rather than moved to a live control — safe to reclaim
 * without stealing.
 */
export const focusDropped = () => {
  const el = document.activeElement;
  return !el || el === document.body || !el.isConnected;
};

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
