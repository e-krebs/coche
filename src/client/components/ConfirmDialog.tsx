import { useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "client/i18n/useTranslation";

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

  useEffect(() => {
    const opener = document.activeElement;
    buttonsRef.current[0]?.focus(); // Cancel: the safe default under a stray Enter
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
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

  const action = `rounded-full px-4 py-2 text-[14px] font-medium outline-none
    focus-visible:ring-2 focus-visible:ring-accent-text`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
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
        <h2 className="text-[17px] font-medium">{title}</h2>
        <p className="mt-2 text-[14px] text-muted">{body}</p>
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
