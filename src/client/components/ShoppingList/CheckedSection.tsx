import { useId } from "react";
import { useTranslation } from "client/i18n/useTranslation";
import { ChevronIcon } from "client/components/icons";
import { ItemRow } from "./ItemRow";
import type { ItemView, RowProps } from "./types";

export const CheckedSection = ({
  checked,
  showChecked,
  onToggleShow,
  onClearChecked,
  swipeLocked,
  syncing,
  rowProps,
}: {
  checked: ItemView[];
  showChecked: boolean;
  onToggleShow: () => void;
  onClearChecked: () => void;
  swipeLocked: boolean;
  syncing: boolean;
  rowProps: RowProps;
}) => {
  const t = useTranslation();
  const panelId = useId();
  return (
    <div className="group flex flex-col" data-open={showChecked || undefined}>
      {/* Heading so the two item groups are distinguishable to heading navigation */}
      <h2>
        <button
          type="button"
          onClick={onToggleShow}
          aria-expanded={showChecked}
          aria-controls={panelId}
          className={`
            mt-1.5 flex w-full items-center gap-3 border-t border-hairline px-2 pt-3 pb-2.5
            text-[14px] font-medium text-muted
          `}
        >
          <ChevronIcon
            className={`
              size-5 text-muted transition-transform duration-200
              group-data-open:rotate-90
              motion-reduce:transition-none
            `}
          />
          {t("checked", { count: checked.length })}
        </button>
      </h2>
      <div
        className={`
          grid grid-rows-[0fr] transition-[grid-template-rows] duration-200
          group-data-open:grid-rows-[1fr]
          motion-reduce:transition-none
        `}
      >
        <div
          id={panelId}
          className="flex flex-col overflow-hidden"
          inert={!showChecked}
          aria-hidden={!showChecked}
        >
          {/* marked so a test can tell the two item lists apart — the unchecked one renders no ul at all when empty */}
          <ul data-checked-list className="flex flex-col">
            {checked.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                q=""
                collapsed={!showChecked}
                swipeLocked={swipeLocked}
                syncing={syncing}
                {...rowProps}
              />
            ))}
          </ul>
          <button
            type="button"
            onClick={onClearChecked}
            className={`self-start rounded-full px-3 py-2 text-[14px] font-medium text-accent-text`}
          >
            {t("clearChecked")}
          </button>
        </div>
      </div>
    </div>
  );
};
