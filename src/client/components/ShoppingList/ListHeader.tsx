import { type ReactNode, type RefObject } from "react";
import { useTranslation } from "client/i18n/useTranslation";
import { AddIcon, CloseIcon, SearchIcon } from "client/components/icons";

export const ListHeader = ({
  headerRight,
  scrolled,
  query,
  setQuery,
  inputRef,
  onSubmit,
  onFocusChange,
}: {
  headerRight?: ReactNode;
  scrolled: boolean;
  query: string;
  setQuery: (v: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  onFocusChange: (focused: boolean) => void;
}) => {
  const t = useTranslation();
  return (
    <header
      className={`
        sticky top-0 z-10 border-b border-hairline bg-header px-4
        shadow-[0_3px_6px_-3px_rgb(0_0_0/0.12)]
      `}
    >
      <div
        data-scrolled={scrolled || undefined}
        className={`
          grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] duration-300
          ease-out
          data-scrolled:grid-rows-[0fr] data-scrolled:opacity-0
          motion-reduce:transition-none
        `}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center pt-3 pb-1">
            <span aria-hidden />
            <h1 className="text-center text-[22px] font-medium tracking-tight">{t("appTitle")}</h1>
            {headerRight && (
              <div className="flex items-center justify-end gap-3">{headerRight}</div>
            )}
          </div>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex items-center gap-2 py-2"
      >
        <div className="relative flex-1">
          <SearchIcon
            className={`
              pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted
            `}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onFocus={() => {
              onFocusChange(true);
            }}
            onBlur={() => {
              onFocusChange(false);
            }}
            placeholder={t("addOrFindPlaceholder")}
            aria-label={t("addOrFind")}
            name="q"
            autoComplete="off"
            className={`
              w-full rounded-full bg-canvas py-2.5 pr-9 pl-11 text-[15px] outline-none
              focus:ring-2 focus:ring-accent-text focus:ring-inset
            `}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label={t("clear")}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted"
            >
              <CloseIcon className="size-4.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!query.trim()}
          aria-label={t("addItem")}
          className={`
            grid size-11 flex-none place-items-center rounded-full bg-accent text-on-accent
            disabled:bg-canvas disabled:text-faint
          `}
        >
          <AddIcon className="size-6" />
        </button>
      </form>
    </header>
  );
};
