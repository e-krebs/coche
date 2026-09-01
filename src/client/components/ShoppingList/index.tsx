import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { sortedByPosition } from "client/store/reorder";
import { useTable } from "client/store/store";
import { useTranslation } from "client/i18n/useTranslation";
import { focusDropped } from "client/components/focus";
import { prefersReducedMotion } from "./helpers";
import { ItemRow, SortableRow } from "./ItemRow";
import { ItemPreview } from "./ItemPreview";
import { ListHeader } from "./ListHeader";
import { CheckedSection } from "./CheckedSection";
import { UndoSnackbar } from "./UndoSnackbar";
import { useHeaderCollapse } from "./useHeaderCollapse";
import { useListActions } from "./useListActions";
import type { Editing, ItemView, RestoreFocus, RowProps } from "./types";

/** Mount with `key={listId}`: a switch resets query, edit mode, the checked fold and the Undo buffer. */
export const ShoppingList = ({
  listId,
  listName,
  onPickList,
  headerRight,
  notice,
  syncing = false,
}: {
  listId: string;
  listName: string;
  onPickList: () => void;
  headerRight?: ReactNode;
  notice?: ReactNode;
  syncing?: boolean;
}) => {
  const t = useTranslation();
  const table = useTable("items");
  // A nameless row is a partial resurrected by a concurrent edit to a deleted item, not data: add
  // rejects an empty name and rename keeps the old one, so absent can only mean ghost.
  const mine = Object.keys(table).filter((id) => table[id]?.listId === listId && table[id]?.name);
  const orderedIds = sortedByPosition(mine, (id) => table[id]?.position ?? "");

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
  const scrolled = useHeaderCollapse({ listId, itemsLength: items.length });
  const inputRef = useRef<HTMLInputElement>(null);
  const nameBtnRefs = useRef(new Map<string, HTMLButtonElement>());
  const checkBtnRefs = useRef(new Map<string, HTMLButtonElement>());
  const registerNameBtn = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) nameBtnRefs.current.set(id, el);
    else nameBtnRefs.current.delete(id);
  }, []);
  const registerCheckBtn = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) checkBtnRefs.current.set(id, el);
    else checkBtnRefs.current.delete(id);
  }, []);
  // Reclaim focus to a row only when it dropped to <body>, so we don't steal focus moved on purpose
  // (button target = no soft keyboard). With no row to return to — the last item deleted, or a whole
  // section cleared out from under the button that cleared it — the header trigger is the only button
  // that always exists and stays visible at any scroll offset.
  const restoreFocus: RestoreFocus = ({ id, control = "name" } = {}) => {
    requestAnimationFrame(() => {
      if (!focusDropped()) return;
      const refs = control === "check" ? checkBtnRefs : nameBtnRefs;
      if (id !== undefined) refs.current.get(id)?.focus();
      // The target can be a collapsed checked row, and an inert subtree refuses focus silently.
      if (focusDropped()) document.querySelector<HTMLElement>("[data-list-trigger]")?.focus();
    });
  };

  // One permanently-mounted region, whose text is all that changes: a region and its content arriving
  // in the same commit is the case VoiceOver and NVDA routinely miss.
  const [announcement, setAnnouncement] = useState("");
  const announce = (message: string) => {
    setAnnouncement(message);
  };

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const actions = useListActions({ listId, items, searching, setEditing, restoreFocus, announce });

  // Reorder only when the field is idle (its soft keyboard dismissing would kill dnd-kit's touch
  // drag).
  // Sync blocks starting a drag but never one in progress: `activeId === null` is what scopes that,
  // since disabling a sortable only drops its listeners — the active sensor keeps its own listeners.
  const dndDisabled = inputFocused || (syncing && activeId === null);

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

  // dnd-kit's defaults are hardcoded English and interpolate `active.id` — the opaque TinyBase row id.
  // The item arrays are fresh each render, so this identity still churns; the memo keeps the shape in
  // one place rather than pretending to stabilise it.
  const announcements = useMemo<Announcements>(() => {
    const nameOf = (id: UniqueIdentifier) => items.find((i) => i.id === String(id))?.name ?? "";
    const posOf = (id: UniqueIdentifier) => unchecked.findIndex((i) => i.id === String(id)) + 1;
    const total = unchecked.length;
    return {
      onDragStart: ({ active }) => t("dragStart", { name: nameOf(active.id) }),
      onDragOver: ({ active, over }) =>
        over
          ? t("dragOver", { name: nameOf(active.id), position: posOf(over.id), total })
          : undefined,
      onDragEnd: ({ active, over }) =>
        over
          ? t("dragEnd", { name: nameOf(active.id), position: posOf(over.id), total })
          : t("dragCancel", { name: nameOf(active.id) }),
      onDragCancel: ({ active }) => t("dragCancel", { name: nameOf(active.id) }),
    };
  }, [t, items, unchecked]);
  const accessibility = useMemo(
    () => ({ announcements, screenReaderInstructions: { draggable: t("dragInstructions") } }),
    [announcements, t],
  );

  const rowProps: RowProps = {
    editing,
    onEdit: setEditing,
    onToggle: actions.toggle,
    onRename: actions.rename,
    onDelete: actions.remove,
    onSetQuantity: actions.setQuantity,
    onRegisterNameBtn: registerNameBtn,
    onRegisterCheckBtn: registerCheckBtn,
  };

  const submit = () => {
    if (actions.add(query.trim())) {
      setQuery("");
      inputRef.current?.focus();
    }
  };

  const activeItem = activeId ? items.find((i) => i.id === activeId) : undefined;

  const emptyClass = "py-8 text-center text-[14px] text-muted";

  return (
    <div>
      {/* marked so a test can tell it from dnd-kit's own role="status" region */}
      <p data-announcer role="status" aria-live="polite" aria-atomic className="sr-only">
        {announcement}
      </p>
      <ListHeader
        listName={listName}
        onPickList={onPickList}
        headerRight={headerRight}
        notice={notice}
        scrolled={scrolled}
        query={query}
        setQuery={setQuery}
        inputRef={inputRef}
        onSubmit={submit}
        onFocusChange={setInputFocused}
      />

      {/* The header stays outside, so it keeps its banner role and the items get the main landmark */}
      <main className="px-4 pb-4">
        {searching ? (
          matches.length === 0 ? (
            <p className={emptyClass}>{t("noMatches")}</p>
          ) : (
            <ul
              aria-label={t("searchResults", { count: matches.length })}
              className="flex flex-col"
            >
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
                accessibility={accessibility}
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
                  <ul data-sortable-list className="flex flex-col">
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
      </main>

      {actions.undo && (
        <UndoSnackbar
          name={actions.undo.row.name}
          onUndo={actions.undoDelete}
          onPause={actions.pauseUndo}
          onResume={actions.resumeUndo}
        />
      )}
    </div>
  );
};
