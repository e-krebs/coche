import { type ReactNode, type RefObject } from "react";
import { useTranslation } from "client/i18n/useTranslation";
import { AddIcon, CloseIcon, ExpandIcon, SearchIcon } from "client/components/icons";

/**
 * Band 1 (title + headerRight) shrinks rather than collapses on scroll: it carries the list
 * switcher, and the hysteresis floor means a vanished band only comes back at the very top.
 *
 * Its side columns are fixed at one avatar wide, not `1fr`: anything that resized them — the avatar
 * arriving, a longer sync label — used to drag the centred title sideways. `notice` sits outside the
 * shrinking band so a state that needs a response survives the collapse.
 */
export const ListHeader = ({
  listName,
  onPickList,
  headerRight,
  notice,
  scrolled,
  wide = false,
  query,
  setQuery,
  inputRef,
  onSubmit,
  onFocusChange,
}: {
  listName: string;
  onPickList: () => void;
  headerRight?: ReactNode;
  notice?: ReactNode;
  scrolled: boolean;
  /** The sidebar is on screen and owns switching lists, so the title is a title again. */
  wide?: boolean;
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
        data-wide={wide || undefined}
        className={`
          group mx-auto grid w-full grid-cols-[--spacing(7)_minmax(0,1fr)_--spacing(7)] items-center
          pt-3 pb-1 transition-[padding] duration-300 ease-out
          data-scrolled:pt-1.5 data-scrolled:pb-0.5
          data-wide:max-w-160 data-wide:grid-cols-[minmax(0,1fr)_--spacing(7)]
          motion-reduce:transition-none
        `}
      >
        {/* The gutter the centred title needs; beside the sidebar it would only push it off-centre */}
        {!wide && <span aria-hidden />}
        <h1 className="min-w-0">
          {wide ? (
            <span className="block truncate px-1 text-[22px] font-medium tracking-tight">
              {listName}
            </span>
          ) : (
            <button
              type="button"
              onClick={onPickList}
              aria-haspopup="dialog"
              data-list-trigger
              className={`
                mx-auto flex max-w-full items-center gap-1 rounded-lg px-1 text-[22px] font-medium
                tracking-tight outline-hidden transition-[font-size] duration-300 ease-out
                group-data-scrolled:text-[15px]
                focus-visible:ring-2 focus-visible:ring-accent-text
                motion-reduce:transition-none
              `}
            >
              <span className="truncate">{listName}</span>
              <ExpandIcon
                className={`
                  size-5 flex-none text-muted transition-[width,height] duration-300 ease-out
                  group-data-scrolled:size-4
                  motion-reduce:transition-none
                `}
              />
            </button>
          )}
        </h1>
        {headerRight && (
          <div
            // `invisible` already prunes the slot from the a11y tree; inert makes the absence
            // consistent so nothing here is reachable while it can't be seen.
            inert={scrolled}
            className={`
              flex items-center justify-end transition-[opacity,visibility] duration-300 ease-out
              group-data-scrolled:invisible group-data-scrolled:opacity-0
              motion-reduce:transition-none
            `}
          >
            {headerRight}
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        data-wide={wide || undefined}
        className={`
          mx-auto flex w-full items-center gap-2 py-2
          data-wide:max-w-160
        `}
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
              w-full rounded-full bg-canvas py-2.5 pr-9 pl-11 text-[15px] outline-hidden
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
              className={`
                absolute top-1/2 right-3 -translate-y-1/2 rounded-full text-muted outline-hidden
                focus-visible:ring-2 focus-visible:ring-accent-text
              `}
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
            outline-hidden
            focus-visible:ring-2 focus-visible:ring-accent-text
            disabled:bg-canvas disabled:text-faint
          `}
        >
          <AddIcon className="size-6" />
        </button>
      </form>
      {notice}
    </header>
  );
};
