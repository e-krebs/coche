import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Focus dropped (body/nothing/detached) rather than moved to a live control — safe to reclaim
 * without stealing.
 */
export const focusDropped = () => {
  const el = document.activeElement;
  return !el || el === document.body || !el.isConnected;
};

/**
 * Rescues focus from a control that vanishes from under the reader — an unmount drops focus to
 * `<body>` and restarts tab order from the top of the document. Attach the returned ref to the
 * control. The check has to happen in a *layout* effect's cleanup, the last moment the node is still
 * connected and still `document.activeElement`: a passive effect's cleanup sees it detached, which
 * is indistinguishable from focus having moved on purpose. Then deferred a frame and gated on
 * `focusDropped` like the dialogs' restore, so focus the reader moved is never stolen.
 */
export const useVanishingFocus = <T extends HTMLElement>({
  fallbackSelector,
}: {
  fallbackSelector: string;
}) => {
  const control = useRef<T>(null);

  // Post-render focus synchronization, the sanctioned Effect use — and cleanup is the only place
  // that knows the control is going. https://react.dev/learn/synchronizing-with-effects
  // oxlint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
  useLayoutEffect(() => {
    const el = control.current;
    return () => {
      if (document.activeElement !== el) return;
      requestAnimationFrame(() => {
        if (!focusDropped()) return;
        document.querySelector<HTMLElement>(fallbackSelector)?.focus();
      });
    };
  }, [fallbackSelector]);

  return control;
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
        // Excluding <body>: a UA that blurs a focused descendant when an ancestor turns inert would
        // capture it, and it passes both tests above while focusing nothing.
        if (captured instanceof HTMLElement && captured.isConnected && captured !== document.body) {
          captured.focus();
          return;
        }
        if (fallbackSelector) document.querySelector<HTMLElement>(fallbackSelector)?.focus();
      });
    };
  }, [fallbackSelector]);
  // oxlint-enable react-you-might-not-need-an-effect/no-event-handler
};
