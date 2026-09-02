import { useId } from "react";
import { useLists } from "client/store/lists";
import { useTranslation } from "client/i18n/useTranslation";
import { RosterRows } from "client/components/RosterRows";

/**
 * The roster standing beside the list instead of over it. Picking is all it does — creating,
 * renaming, reordering and deleting stay in the picker sheet's edit mode, which `onEdit` opens
 * directly, so exactly one drag-and-drop context for lists is ever mounted.
 */
export const ListSidebar = ({
  activeId,
  onSelect,
  onEdit,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  onEdit: () => void;
}) => {
  const t = useTranslation();
  const lists = useLists();
  const titleId = useId();

  return (
    <nav
      aria-labelledby={titleId}
      data-list-sidebar
      className={`
        sticky top-0 flex h-dvh flex-col overflow-y-auto border-r border-hairline bg-header
      `}
    >
      <div className={`sticky top-0 flex items-center justify-between bg-header px-4 pt-4 pb-2`}>
        <h2 id={titleId} className="text-[13px] font-medium tracking-wide text-muted uppercase">
          {t("lists")}
        </h2>
        <button
          type="button"
          onClick={onEdit}
          className={`
            rounded-full px-2 py-1 text-[14px] font-medium text-accent-text outline-hidden
            focus-visible:ring-2 focus-visible:ring-accent-text
          `}
        >
          {t("editLists")}
        </button>
      </div>
      <RosterRows lists={lists} activeId={activeId} semantics="nav" onSelect={onSelect} />
    </nav>
  );
};
