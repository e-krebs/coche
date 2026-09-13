import { type ReactNode, type RefObject } from "react";
import { useTranslation } from "client/i18n/useTranslation";
import { AddIcon, CloseIcon, ExpandIcon, SearchIcon } from "client/components/icons";

// The item column, less the header's own `px-4` — what holds every row of a full-bleed bar in the
// same column as the items below it.
const BAND = `
  mx-auto w-full
  max-w-104
  md:max-w-160
`;

// The cap change at `md`, transitioned rather than jumped: a state change on one element, which is
// the cheapest motion tier. Per element rather than inside `BAND`, because the title band
// transitions its padding as well and two `transition-property` utilities on one element would leave
// the winner to sheet order.
const CAP_MOTION = `transition-[max-width] duration-300 ease-out motion-reduce:transition-none`;

// Centred on a phone, flush left beside the sidebar, and able to slide between the two: the title is
// offset by `--title-x` of its cell and pulled back by the same fraction of itself, so the band's
// one animation carries it. `w-fit` because a box that fills the cell cannot be centred in it.
const TITLE_BOX = `
  relative left-[var(--title-x)] w-fit max-w-full translate-x-[calc(-1*var(--title-x))]
`;

// Shared by both title elements, so the only difference between them is the tag.
const TITLE_TEXT = `flex items-center gap-1 px-1 text-[22px] font-medium tracking-tight`;

/**
 * Band 1 (title + headerRight) shrinks rather than collapses on scroll: it carries the list
 * switcher, and the hysteresis floor means a vanished band only comes back at the very top.
 *
 * Its side columns are fixed, not `1fr`: anything that resized them — the avatar arriving, a longer
 * sync label — used to drag the centred title sideways. They are as wide as the add button in the
 * band below, so the avatar centred in one shares that button's centre. `notice` sits outside the
 * shrinking band so a state that needs a response survives the collapse.
 *
 * The bar is full-bleed at every width — background, hairline and shadow reach the pane's edges —
 * with `BAND` doing the capping the pane used to do.
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
  // One inner shape for both title elements, so the caret is on both sides of a crossing: it grows
  // with the slide instead of popping in when the commit swaps the tag, and the width it takes is
  // already in the box the slide is centring.
  const titleInner = (
    <>
      <span className="truncate">{listName}</span>
      <ExpandIcon
        className={`
          size-5 flex-none text-muted transition-[width,height] duration-300 ease-out
          group-data-scrolled:size-4
          group-data-wide:size-0
          motion-reduce:transition-none
        `}
      />
    </>
  );
  return (
    <header
      className={`
        sticky top-0 z-10 border-b border-hairline bg-header px-4
        shadow-[0_3px_6px_-3px_rgb(0_0_0/0.12)]
      `}
    >
      <div
        data-title-band
        data-scrolled={scrolled || undefined}
        data-wide={wide || undefined}
        className={`
          group grid grid-cols-[var(--gutter)_minmax(0,1fr)_--spacing(11)] items-center pt-3 pb-1
          transition-[padding,max-width] duration-300 ease-out
          [--gutter:--spacing(11)]
          [--title-x:50%]
          ${BAND}
          data-scrolled:pt-1.5 data-scrolled:pb-0.5
          data-wide:[--gutter:0px] data-wide:[--title-x:0%]
          motion-reduce:transition-none
        `}
      >
        {/* The gutter the centred title needs, animated shut beside the sidebar rather than dropped */}
        <span aria-hidden />
        <h1 className="min-w-0">
          {wide ? (
            <span
              className={`
                ${TITLE_BOX}
                ${TITLE_TEXT}
              `}
            >
              {titleInner}
            </span>
          ) : (
            <button
              type="button"
              onClick={onPickList}
              aria-haspopup="dialog"
              data-list-trigger
              className={`
                ${TITLE_BOX}
                ${TITLE_TEXT}
                rounded-lg outline-hidden transition-[font-size] duration-300 ease-out
                group-data-scrolled:text-[15px]
                focus-visible:ring-2 focus-visible:ring-accent-text
                motion-reduce:transition-none
              `}
            >
              {titleInner}
            </button>
          )}
        </h1>
        {headerRight && (
          <div
            // `invisible` already prunes the slot from the a11y tree; inert makes the absence
            // consistent so nothing here is reachable while it can't be seen.
            inert={scrolled}
            className={`
              flex items-center justify-center transition-[opacity,visibility] duration-300 ease-out
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
        className={`
          flex items-center gap-2 py-2
          ${BAND}
          ${CAP_MOTION}
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
      <div
        className={`
          ${BAND}
          ${CAP_MOTION}
        `}
      >
        {notice}
      </div>
    </header>
  );
};
