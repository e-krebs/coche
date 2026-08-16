import { type ReactNode, useCallback, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { sortedByPosition } from "client/store/reorder";
import { useTable } from "client/store/store";
import { useTranslation } from "client/i18n/useTranslation";
import { focusDropped, prefersReducedMotion } from "./helpers";
import { ItemRow, SortableRow } from "./ItemRow";
import { ItemPreview } from "./ItemPreview";
import { ListHeader } from "./ListHeader";
import { CheckedSection } from "./CheckedSection";
import { UndoSnackbar } from "./UndoSnackbar";
import { useHeaderCollapse } from "./useHeaderCollapse";
import { useListActions } from "./useListActions";
import type { Editing, ItemView, RowProps } from "./types";

export const ShoppingList = ({
  headerRight,
  syncing = false,
}: {
  headerRight?: ReactNode;
  syncing?: boolean;
}) => {
  const t = useTranslation();
  const table = useTable("items");
  // A nameless row is a partial resurrected by a concurrent edit to a deleted item, not data: add
  // rejects an empty name and rename keeps the old one, so absent can only mean ghost.
  const named = Object.keys(table).filter((id) => table[id]?.name);
  const orderedIds = sortedByPosition(named, (id) => table[id]?.position ?? "");

  const items: ItemView[] = orderedIds.map((id) => {
    const row = table[id];
    return {
      id,
      name: row.name ?? "",
      checked: row.checked,
      quantity: row.quantity,
    };
  });

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [showChecked, setShowChecked] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const scrolled = useHeaderCollapse(items.length);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameBtnRefs = useRef(new Map<string, HTMLButtonElement>());
  const registerNameBtn = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) nameBtnRefs.current.set(id, el);
    else nameBtnRefs.current.delete(id);
  }, []);
  // Reclaim focus to a row only when it dropped to <body>, so we don't steal focus moved on purpose
  // (button target = no soft keyboard).
  const restoreFocus = (id: string | undefined) => {
    if (!id) return;
    requestAnimationFrame(() => {
      if (focusDropped()) nameBtnRefs.current.get(id)?.focus();
    });
  };

  const actions = useListActions({ items, setEditing, restoreFocus });

  // Reorder only when the field is idle (its soft keyboard dismissing would kill dnd-kit's touch
  // drag).
  // Sync blocks starting a drag, never one in progress — flipping an active sortable to disabled
  // cancels it.
  const dndDisabled = inputFocused || (syncing && activeId === null);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  // Checked first, then within each bucket by earliest match position, then A→Z.
  const matches = searching
    ? items
        .filter((i) => i.name.toLowerCase().includes(q))
        .sort((a, b) => {
          if (a.checked !== b.checked) return a.checked ? -1 : 1;
          const ai = a.name.toLowerCase().indexOf(q);
          const bi = b.name.toLowerCase().indexOf(q);
          return ai !== bi ? ai - bi : a.name.localeCompare(b.name);
        })
    : [];

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: long-press to lift a row, so a normal swipe still scrolls the list.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rowProps: RowProps = {
    editing,
    onEdit: setEditing,
    onToggle: actions.toggle,
    onRename: actions.rename,
    onDelete: actions.remove,
    onSetQuantity: actions.setQuantity,
    onRegisterNameBtn: registerNameBtn,
  };

  const submit = () => {
    if (actions.add(query.trim())) {
      setQuery("");
      inputRef.current?.focus();
    }
  };

  const activeItem = activeId ? items.find((i) => i.id === activeId) : undefined;

  const emptyClass = "py-8 text-center text-[14px] text-faint";

  return (
    <div>
      <ListHeader
        headerRight={headerRight}
        scrolled={scrolled}
        query={query}
        setQuery={setQuery}
        inputRef={inputRef}
        onSubmit={submit}
        onFocusChange={setInputFocused}
      />

      <div className="px-4 pb-4">
        {searching ? (
          matches.length === 0 ? (
            <p className={emptyClass}>{t("noMatches")}</p>
          ) : (
            <ul className="flex flex-col">
              {matches.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  q={q}
                  swipeLocked={activeId !== null}
                  syncing={syncing}
                  {...rowProps}
                />
              ))}
            </ul>
          )
        ) : (
          <>
            {unchecked.length === 0 ? (
              <p className={emptyClass}>
                {items.length === 0 ? (
                  <>
                    {t("emptyTitle")}
                    <br />
                    {t("emptySub")}
                  </>
                ) : (
                  t("allDone")
                )}
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={(e) => {
                  setActiveId(String(e.active.id));
                }}
                onDragEnd={(e) => {
                  setActiveId(null);
                  if (e.over) {
                    actions.reorder({ activeId: String(e.active.id), overId: String(e.over.id) });
                  }
                }}
                onDragCancel={() => {
                  setActiveId(null);
                }}
              >
                <SortableContext
                  items={unchecked.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="flex flex-col">
                    {unchecked.map((item) => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        q=""
                        dndDisabled={dndDisabled}
                        swipeLocked={activeId !== null}
                        syncing={syncing}
                        {...rowProps}
                      />
                    ))}
                  </ul>
                </SortableContext>
                <DragOverlay dropAnimation={prefersReducedMotion() ? null : undefined}>
                  {activeItem ? <ItemPreview item={activeItem} /> : null}
                </DragOverlay>
              </DndContext>
            )}

            {checked.length > 0 && (
              <CheckedSection
                checked={checked}
                showChecked={showChecked}
                onToggleShow={() => {
                  setShowChecked((v) => !v);
                }}
                onClearChecked={actions.clearChecked}
                swipeLocked={activeId !== null}
                syncing={syncing}
                rowProps={rowProps}
              />
            )}
          </>
        )}
      </div>

      {actions.undo && <UndoSnackbar name={actions.undo.row.name} onUndo={actions.undoDelete} />}
    </div>
  );
};
