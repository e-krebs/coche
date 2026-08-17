import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "client/i18n/useTranslation";
import { useOpenerFocus } from "client/components/focus";

/**
 * Destructive confirmation. z-50 puts it above the list picker that opens it (z-40) and the Undo
 * snackbar (z-30); it stops its own keys so Escape cancels the dialog, not the sheet underneath.
 */
export const ConfirmDialog = ({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const t = useTranslation();
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const titleId = useId();
  const bodyId = useId();

  // No fallback selector: confirming can tear down the sheet the opener lived in, and then the sheet's
  // own restore has the better claim on focus.
  useOpenerFocus();
  // oxlint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- post-render focus
  useEffect(() => {
    buttonsRef.current[0]?.focus(); // Cancel: the safe default under a stray Enter
  }, []);

  const moveFocus = (delta: number) => {
    const els = buttonsRef.current.filter((el): el is HTMLButtonElement => el != null);
    const current = els.findIndex((el) => el === document.activeElement);
    els[(current + delta + els.length) % els.length]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      onCancel();
      return;
    }
    if (e.key === "Tab" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      moveFocus(e.key === "ArrowLeft" || e.shiftKey ? -1 : 1);
    }
  };

  const action = `rounded-full px-4 py-2 text-[14px] font-medium outline-hidden
    focus-visible:ring-2 focus-visible:ring-accent-text`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      // alertdialog, not dialog: it interrupts to confirm something destructive, and the body naming
      // what the delete destroys has to reach assistive tech as the description, not just as text.
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        className={`
          animate-snackbar-in relative z-10 w-full max-w-xs rounded-2xl bg-header p-5 shadow-xl
        `}
      >
        <h2 id={titleId} className="text-[17px] font-medium">
          {title}
        </h2>
        <p id={bodyId} className="mt-2 text-[14px] text-muted">
          {body}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            ref={(el) => {
              buttonsRef.current[0] = el;
            }}
            onClick={onCancel}
            className={`
              ${action}
              text-muted
            `}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            ref={(el) => {
              buttonsRef.current[1] = el;
            }}
            onClick={onConfirm}
            className={`
              ${action}
              bg-danger text-white
            `}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
