import { flushSync } from "react-dom";

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
