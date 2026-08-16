import { useEffect, useRef } from "react";

/**
 * Focus dropped (body/nothing/detached) rather than moved to a live control — safe to reclaim
 * without stealing.
 */
export const focusDropped = () => {
  const el = document.activeElement;
  return !el || el === document.body || !el.isConnected;
};

/**
 * Returns focus to whatever opened a dialog, on the frame *after* it unmounts. Deferred because a
 * list switch remounts the header in the same commit that closes the dialog: the node captured on
 * open is still connected when cleanup runs and only dies afterwards, so focusing it there drops
 * focus to `<body>`. `fallbackSelector` re-finds its successor once that has happened.
 *
 * The opener is held in a ref so StrictMode's double-invoke can't capture this dialog's own control.
 */
export const useOpenerFocus = ({ fallbackSelector }: { fallbackSelector?: string } = {}): void => {
  const opener = useRef<Element | null>(null);

  // Post-render focus synchronization, the sanctioned Effect use — and cleanup is the only place that
  // knows the dialog is closing. https://react.dev/learn/synchronizing-with-effects
  // oxlint-disable react-you-might-not-need-an-effect/no-event-handler
  useEffect(() => {
    opener.current ??= document.activeElement;
    const captured = opener.current;
    return () => {
      requestAnimationFrame(() => {
        if (!focusDropped()) return; // focus moved on purpose — don't steal it back
        if (captured instanceof HTMLElement && captured.isConnected) {
          captured.focus();
          return;
        }
        if (fallbackSelector) document.querySelector<HTMLElement>(fallbackSelector)?.focus();
      });
    };
  }, [fallbackSelector]);
  // oxlint-enable react-you-might-not-need-an-effect/no-event-handler
};
