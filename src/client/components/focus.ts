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
 * Takes focus back to a control without dragging the page along. A plain `.focus()` reveals its
 * target, and unchecking remounts the row a viewport or more above the section it came from — so the
 * reveal scrolled the page away from whatever the finger was pointing at. A keyboard reader still has
 * to see where focus went, and `:focus-visible` is the engine's own answer to "was this a keyboard
 * interaction". Read *after* the focus, so a control that refused it — an `inert` collapsed row — is
 * never revealed either. A target that can end up under the sticky header carries its own
 * `scroll-margin-top` (the item rows do); the root can't, since a control living inside that padding
 * for good would scroll the page to the top instead.
 */
export const reclaimFocus = (el: HTMLElement | null | undefined) => {
  if (!el) return;
  el.focus({ preventScroll: true });
  if (el.matches(":focus-visible")) el.scrollIntoView({ block: "nearest" });
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
