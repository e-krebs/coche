import { type ListSummary } from "client/store/lists";
import { useTranslation } from "client/i18n/useTranslation";
import { CheckIcon } from "client/components/icons";

/** Shared with the picker's edit rows, which live beside their drag handle and delete button. */
export const rowBase = `flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px]
  outline-hidden
  focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-accent-text
  focus-visible:ring-inset`;

/**
 * `menu` is the picker sheet: a menu of `menuitemradio`s with a roving tabindex, so arrows rove
 * without selecting — selecting closes the sheet, so the first arrow press would end the
 * interaction. `nav` is the sidebar, where the roster is persistent navigation rather than a
 * transient menu: plain buttons in normal tab order, the one you're on marked `aria-current`. The
 * sidebar's active row also carries `data-list-trigger`, the anchor a focus restore falls back to —
 * it is the control that always exists and always names the active list, whichever surface holds it.
 */
type Semantics = "menu" | "nav";

const PickRow = ({
  list,
  label,
  active,
  semantics,
  onSelect,
}: {
  list: ListSummary;
  label: string;
  active: boolean;
  semantics: Semantics;
  onSelect: () => void;
}) => {
  const t = useTranslation();
  const menu = semantics === "menu";
  // A roving tabindex in the menu, explicit on both ends as the pattern expects; in the sidebar
  // every row is an ordinary tab stop, which a native button already is.
  const tabIndex = menu ? (active ? 0 : -1) : undefined;
  return (
    <button
      type="button"
      role={menu ? "menuitemradio" : undefined}
      aria-checked={menu ? active : undefined}
      aria-current={!menu && active ? "true" : undefined}
      aria-label={t("listWithCount", { name: label, count: list.count })}
      tabIndex={tabIndex}
      data-list-trigger={(!menu && active) || undefined}
      onClick={onSelect}
      className={`
        ${rowBase}
        hover:bg-canvas
      `}
    >
      <span
        data-active={active || undefined}
        className={`
          grid size-4.5 flex-none place-items-center rounded-full border-2 border-muted
          text-transparent
          data-active:border-accent-text data-active:text-accent-text
        `}
      >
        <CheckIcon className="size-3" />
      </span>
      <span className="flex-1 truncate">{label}</span>
      <span className="flex-none text-[14px] text-muted tabular-nums">{list.count}</span>
    </button>
  );
};

/**
 * The roster as rows you can pick from. Extracted so one rendering of a list's name and count can
 * serve more than one surface — a list must not read differently depending on where it is shown.
 * Each row shows the **unchecked** count only: the number you'd act on, so `0` reads as "nothing to
 * do here".
 */
export const RosterRows = ({
  lists,
  activeId,
  semantics,
  onSelect,
}: {
  lists: ListSummary[];
  activeId: string;
  semantics: Semantics;
  onSelect: (id: string) => void;
}) => {
  const t = useTranslation();
  return (
    <div
      role={semantics === "menu" ? "menu" : undefined}
      aria-label={semantics === "menu" ? t("lists") : undefined}
      className="p-1.5"
    >
      {lists.map((list) => (
        <PickRow
          key={list.id}
          list={list}
          label={list.name ?? t("appTitle")}
          active={list.id === activeId}
          semantics={semantics}
          onSelect={() => {
            onSelect(list.id);
          }}
        />
      ))}
    </div>
  );
};
