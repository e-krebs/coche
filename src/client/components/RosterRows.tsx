import { type ListSummary } from "client/store/lists";
import { useTranslation } from "client/i18n/useTranslation";
import { CheckIcon } from "client/components/icons";

/** Shared with the picker's edit rows, which live beside their drag handle and delete button. */
export const rowBase = `flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px]
  outline-hidden
  focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-accent-text
  focus-visible:ring-inset`;

const PickRow = ({
  list,
  label,
  active,
  onSelect,
}: {
  list: ListSummary;
  label: string;
  active: boolean;
  onSelect: () => void;
}) => {
  const t = useTranslation();
  return (
    <button
      type="button"
      // A menu, not a radiogroup: arrows rove without selecting, because selecting switches list and
      // closes the sheet — so the first arrow press would end the interaction.
      role="menuitemradio"
      aria-checked={active}
      aria-label={t("listWithCount", { name: label, count: list.count })}
      tabIndex={active ? 0 : -1}
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
  onSelect,
}: {
  lists: ListSummary[];
  activeId: string;
  onSelect: (id: string) => void;
}) => {
  const t = useTranslation();
  return (
    <div role="menu" aria-label={t("lists")} className="p-1.5">
      {lists.map((list) => (
        <PickRow
          key={list.id}
          list={list}
          label={list.name ?? t("appTitle")}
          active={list.id === activeId}
          onSelect={() => {
            onSelect(list.id);
          }}
        />
      ))}
    </div>
  );
};
