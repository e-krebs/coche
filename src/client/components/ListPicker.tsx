import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  DndContext,
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useListRoster, type ListSummary } from "client/store/lists";
import { useTranslation } from "client/i18n/useTranslation";
import { AddIcon, CheckIcon, DeleteIcon, DragIcon } from "client/components/icons";
import { ConfirmDialog } from "client/components/ConfirmDialog";
import { useOpenerFocus } from "client/components/useOpenerFocus";
import { prefersReducedMotion } from "./ShoppingList/helpers";

const rowBase = `flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px]
  outline-none
  focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-accent-text
  focus-visible:ring-inset`;

const iconBtn = `grid size-8 flex-none place-items-center rounded-full text-faint outline-none
  focus-visible:ring-2 focus-visible:ring-accent-text`;

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
          grid size-4.5 flex-none place-items-center rounded-full border-2 border-faint
          text-transparent
          data-active:border-accent-text data-active:text-accent-text
        `}
      >
        <CheckIcon className="size-3" />
      </span>
      <span className="flex-1 truncate">{label}</span>
      <span className="flex-none text-[14px] text-faint tabular-nums">{list.count}</span>
    </button>
  );
};

const EditRow = ({
  list,
  label,
  renaming,
  canDelete,
  onStartRename,
  onRename,
  onDelete,
}: {
  list: ListSummary;
  label: string;
  renaming: boolean;
  canDelete: boolean;
  onStartRename: () => void;
  onRename: (name: string | null) => void;
  onDelete: () => void;
}) => {
  const t = useTranslation();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: list.id,
    disabled: renaming,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: prefersReducedMotion() ? undefined : transition,
      }}
      data-dragging={isDragging || undefined}
      className={`
        flex items-center gap-2 rounded-lg px-1
        data-dragging:opacity-30
      `}
    >
      <button
        type="button"
        aria-label={t("reorderList", { name: label })}
        {...attributes}
        {...listeners}
        className={`
          ${iconBtn}
          cursor-grab
          active:cursor-grabbing
        `}
      >
        <DragIcon className="size-5" />
      </button>
      {renaming ? (
        <input
          autoFocus
          defaultValue={label}
          aria-label={t("renameList", { name: label })}
          onBlur={(e) => {
            onRename(e.target.value);
          }}
          onKeyDown={(e) => {
            // Both keys are the sheet's otherwise — Escape would close it, Enter submit nothing.
            e.stopPropagation();
            if (e.key === "Enter") onRename(e.currentTarget.value);
            if (e.key === "Escape") onRename(null);
          }}
          className={`
            flex-1 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[15px] ring-2 ring-accent-text
            outline-none ring-inset
          `}
        />
      ) : (
        <button
          type="button"
          onClick={onStartRename}
          className={`
            ${rowBase}
            flex-1 py-2.5
          `}
        >
          <span className="flex-1 truncate">{label}</span>
        </button>
      )}
      <button
        type="button"
        disabled={!canDelete}
        aria-label={t("deleteList", { name: label })}
        onClick={onDelete}
        className={`
          ${iconBtn}
          disabled:text-hairline
        `}
      >
        <DeleteIcon className="size-4.5" />
      </button>
    </li>
  );
};

/**
 * Bottom sheet over the list: pick a list, or flip to Edit to create, rename, reorder and delete
 * them. Lives above the keyed <ShoppingList> so a switch can't unmount it mid-interaction.
 */
export const ListPicker = ({
  activeId,
  onSelect,
  onClose,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) => {
  const t = useTranslation();
  const { lists, add, rename, remove, reorder } = useListRoster();
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ListSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newName, setNewName] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);

  const nameOf = (list: ListSummary) => list.name ?? t("appTitle");
  // The roster is never empty, and there is no zero-lists state to fall into.
  const canDelete = lists.length > 1;

  useOpenerFocus({ fallbackSelector: "[data-list-trigger]" });
  // oxlint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- post-render focus
  useEffect(() => {
    sheetRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, []);

  const moveFocus = ({ delta, within }: { delta: number; within: string }) => {
    const els = [...(sheetRef.current?.querySelectorAll<HTMLElement>(within) ?? [])];
    const current = els.findIndex((el) => el === document.activeElement);
    els[(current + delta + els.length) % els.length]?.focus();
  };

  // Escape closes; Tab is trapped in the sheet; arrows rove the roster while picking (in edit mode
  // they belong to the rename input). Queried from the DOM rather than a ref list because edit mode
  // grows and drops controls.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      // dnd-kit cancels a keyboard drag on Escape; closing the sheet as well would take the whole
      // edit session with it.
      if (!dragging) onClose();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      moveFocus({ delta: e.shiftKey ? -1 : 1, within: "button:not([disabled]),input" });
      return;
    }
    if (editing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      moveFocus({ delta: 1, within: '[role="menuitemradio"]' });
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocus({ delta: -1, within: '[role="menuitemradio"]' });
    }
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Short delay even with a dedicated handle, so a scroll flick starting on it still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const create = () => {
    const id = add(newName);
    if (!id) return;
    setNewName("");
    onSelect(id); // a list you just made is a list you want to fill
    onClose();
  };

  const confirmDelete = () => {
    if (!confirming) return;
    const { id } = confirming;
    const next = lists.find((l) => l.id !== id)?.id;
    setConfirming(null);
    if (!remove(id)) return;
    // Deleting the list you're standing on switches away, and that remounts this view — so close
    // deliberately, rather than letting the remount do it and look like a glitch.
    if (id === activeId && next) {
      onSelect(next);
      onClose();
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-end justify-center"
        role="dialog"
        aria-modal="true"
        aria-label={t("lists")}
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
          ref={sheetRef}
          inert={confirming !== null}
          className={`
            animate-sheet-in relative z-10 max-h-[80dvh] w-full max-w-md overflow-y-auto
            rounded-t-2xl bg-header shadow-xl
          `}
        >
          <div
            className={`
              sticky top-0 flex items-center justify-between border-b border-hairline bg-header px-4
              py-3
            `}
          >
            <h2 className="text-[13px] font-medium tracking-wide text-muted uppercase">
              {t("lists")}
            </h2>
            <button
              type="button"
              onClick={() => {
                setEditing((v) => !v);
                setRenaming(null);
              }}
              className={`
                rounded-full px-2 py-1 text-[14px] font-medium text-accent-text outline-none
                focus-visible:ring-2 focus-visible:ring-accent-text
              `}
            >
              {editing ? t("doneEditingLists") : t("editLists")}
            </button>
          </div>

          {editing ? (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={() => {
                  setDragging(true);
                }}
                onDragCancel={() => {
                  setDragging(false);
                }}
                onDragEnd={(e) => {
                  setDragging(false);
                  if (e.over) {
                    reorder({ activeId: String(e.active.id), overId: String(e.over.id) });
                  }
                }}
              >
                <SortableContext
                  items={lists.map((l) => l.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="flex flex-col gap-0.5 p-1.5">
                    {lists.map((list) => (
                      <EditRow
                        key={list.id}
                        list={list}
                        label={nameOf(list)}
                        renaming={renaming === list.id}
                        canDelete={canDelete}
                        onStartRename={() => {
                          setRenaming(list.id);
                        }}
                        onRename={(name) => {
                          if (name !== null) rename({ id: list.id, name });
                          setRenaming(null);
                        }}
                        onDelete={() => {
                          setConfirming(list);
                        }}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  create();
                }}
                className="flex items-center gap-2 border-t border-hairline px-4 py-3"
              >
                <input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                  }}
                  placeholder={t("newListPlaceholder")}
                  aria-label={t("newList")}
                  autoComplete="off"
                  className={`
                    flex-1 rounded-full bg-canvas px-4 py-2 text-[15px] outline-none
                    focus:ring-2 focus:ring-accent-text focus:ring-inset
                  `}
                />
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  aria-label={t("createList")}
                  className={`
                    grid size-9 flex-none place-items-center rounded-full bg-accent text-on-accent
                    disabled:bg-canvas disabled:text-faint
                  `}
                >
                  <AddIcon className="size-5" />
                </button>
              </form>
            </>
          ) : (
            <div role="menu" aria-label={t("lists")} className="p-1.5">
              {lists.map((list) => (
                <PickRow
                  key={list.id}
                  list={list}
                  label={nameOf(list)}
                  active={list.id === activeId}
                  onSelect={() => {
                    onSelect(list.id);
                    onClose();
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title={t("deleteListTitle", { name: nameOf(confirming) })}
          body={
            confirming.total === 0
              ? t("deleteListEmpty")
              : t("deleteListBody", { count: confirming.total })
          }
          confirmLabel={t("confirmDelete")}
          onConfirm={confirmDelete}
          onCancel={() => {
            setConfirming(null);
          }}
        />
      )}
    </>
  );
};
