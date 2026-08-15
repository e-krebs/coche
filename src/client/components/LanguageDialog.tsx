import { useEffect, useRef, type KeyboardEvent } from "react";
import { LOCALES, type Locale } from "client/i18n";
import { useTranslation } from "client/i18n/useTranslation";

/**
 * A themed app modal (not a Clerk page) so the language chooser follows the app's light/dark
 * tokens.
 */
export const LanguageDialog = ({
  locale,
  onSelect,
  onClose,
}: {
  locale: Locale;
  onSelect: (locale: Locale) => void;
  onClose: () => void;
}) => {
  const t = useTranslation();
  const radiosRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const opener = document.activeElement;
    const active = Math.max(
      0,
      LOCALES.findIndex((l) => l.code === locale),
    );
    radiosRef.current[active]?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    }; // restore focus to the opener
  }, [locale]);

  const moveFocus = (delta: number) => {
    const els = radiosRef.current.filter((el): el is HTMLButtonElement => el != null);
    const current = els.findIndex((el) => el === document.activeElement);
    els[(current + delta + els.length) % els.length]?.focus();
  };

  // Escape closes; arrows rove; Tab is trapped in the modal (Enter/Space commit via the radio's
  // native click).
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === "Tab") {
      e.preventDefault();
      moveFocus(e.shiftKey ? -1 : 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("language")}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        className={`
          animate-snackbar-in relative z-10 w-full max-w-xs overflow-hidden rounded-2xl bg-header
          shadow-xl
        `}
      >
        <h2
          className={`
            border-b border-hairline px-4 py-3 text-[13px] font-medium tracking-wide text-muted
            uppercase
          `}
        >
          {t("language")}
        </h2>
        <div role="radiogroup" aria-label={t("language")} className="p-1.5">
          {LOCALES.map((l, i) => {
            const active = l.code === locale;
            return (
              <button
                key={l.code}
                ref={(el) => {
                  radiosRef.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => {
                  onSelect(l.code);
                }}
                className={`
                  flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px]
                  outline-none
                  hover:bg-canvas
                  focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-accent-text
                  focus-visible:ring-inset
                `}
              >
                <span
                  data-active={active || undefined}
                  className={`
                    grid size-4.5 flex-none place-items-center rounded-full border-2 border-faint
                    data-active:border-accent-text
                  `}
                >
                  {active && <span className={`size-2 rounded-full bg-accent-text`} />}
                </span>
                {l.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
