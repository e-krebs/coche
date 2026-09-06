import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useOpenerFocus } from "client/components/focus";

/**
 * The lists as a modal sheet — rising from the bottom edge on a phone, centred above `sm`. Holds
 * only what a transient surface needs and a persistent one has no use for: the scrim, the dialog
 * boundary, the Tab trap, the focus placed on arrival and the focus handed back on the way out.
 */
export const ListSheetWrapper = ({
  titleId,
  blocked,
  roving,
  onKeyDown,
  onDismiss,
  children,
}: {
  titleId: string;
  blocked: boolean;
  /** Arrows rove the rows while picking; in edit mode they belong to the rename field. */
  roving: boolean;
  onKeyDown: (e: KeyboardEvent) => void;
  onDismiss: () => void;
  children: ReactNode;
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  useOpenerFocus({ fallbackSelector: "[data-list-trigger]" });
  // The active row while picking; opened straight into edit mode there is no checked row to aim at,
  // so the first rename row instead — not the header toggle that is first in document order, which
  // now reads "Done", and answering a request to edit with the control that exits editing is a
  // strange place to land. Skipped when focus is already inside: arriving here from a resize
  // mid-rename, the field has focus, and taking it would blur the field and commit a name nobody
  // confirmed.
  // oxlint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- post-render focus
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || sheet.contains(document.activeElement)) return;
    const target =
      sheet.querySelector<HTMLElement>('[aria-checked="true"]') ??
      sheet.querySelector<HTMLElement>("[data-rename-row]");
    target?.focus();
  }, []);

  const moveFocus = ({ delta, within }: { delta: number; within: string }) => {
    const els = [...(sheetRef.current?.querySelectorAll<HTMLElement>(within) ?? [])];
    const current = els.findIndex((el) => el === document.activeElement);
    els[(current + delta + els.length) % els.length]?.focus();
  };

  // Escape is the panel's to weigh — it knows what is in flight. Tab and the arrows are this
  // surface's own, and the key sets don't overlap. Queried from the DOM rather than a ref list
  // because edit mode grows and drops controls.
  const keys = (e: KeyboardEvent) => {
    onKeyDown(e);
    if (e.key === "Tab") {
      e.preventDefault();
      moveFocus({ delta: e.shiftKey ? -1 : 1, within: "button:not([disabled]),input" });
      return;
    }
    if (!roving) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      moveFocus({ delta: 1, within: '[role="menuitemradio"]' });
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocus({ delta: -1, within: '[role="menuitemradio"]' });
    }
  };

  return (
    <div
      className={`
        fixed inset-0 z-40 flex items-end justify-center
        sm:items-center
      `}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={keys}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onDismiss}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        ref={sheetRef}
        // The dialog role sits on the full-screen wrapper, so a test measuring the panel itself
        // has nothing to aim at without this.
        data-sheet
        inert={blocked}
        className={`
          relative z-10 max-h-[80dvh] w-full max-w-md animate-sheet-in overflow-y-auto rounded-t-2xl
          bg-header shadow-xl
          sm:animate-snackbar-in sm:rounded-2xl
        `}
      >
        {children}
      </div>
    </div>
  );
};
