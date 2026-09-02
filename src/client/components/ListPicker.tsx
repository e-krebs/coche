import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  DndContext,
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useListRoster, type ListSummary } from "client/store/lists";
import { useTranslation } from "client/i18n/useTranslation";
import { AddIcon, DeleteIcon, DragIcon } from "client/components/icons";
import { ConfirmDialog } from "client/components/ConfirmDialog";
import { useOpenerFocus } from "client/components/focus";
import { RosterRows, rowBase } from "client/components/RosterRows";
import { prefersReducedMotion } from "./ShoppingList/helpers";

const iconBtn = `grid size-8 flex-none place-items-center rounded-full text-muted outline-hidden
  focus-visible:ring-2 focus-visible:ring-accent-text`;

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
    attributes: { roleDescription: t("sortableList") },
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
            // Both keys are the sheet's otherwise — Escape would close it, Enter submit nothing. Only
            // those two: Tab has to keep bubbling or the sheet's trap never sees it and focus walks
            // out of the modal.
            if (e.key !== "Enter" && e.key !== "Escape") return;
            e.stopPropagation();
            if (e.key === "Enter") onRename(e.currentTarget.value);
            else onRename(null);
          }}
          className={`
            flex-1 rounded-lg border border-accent-text bg-accent-soft px-2.5 py-1.5 text-[15px]
            outline-hidden
            focus:ring-2 focus:ring-accent-text focus:ring-inset
          `}
        />
      ) : (
        <button
          type="button"
          onClick={onStartRename}
          data-rename-row
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
  initialEditing = false,
  onSelect,
  onClose,
}: {
  activeId: string;
  /** Open straight into edit mode — the sidebar's own Edit has nothing else to offer. */
  initialEditing?: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}) => {
  const t = useTranslation();
  const { lists, add, rename, remove, reorder } = useListRoster();
  const [editing, setEditing] = useState(initialEditing);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ListSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newName, setNewName] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);
  const newNameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const nameOf = (list: ListSummary) => list.name ?? t("appTitle");
  // The roster is never empty, and there is no zero-lists state to fall into.
  const canDelete = lists.length > 1;

  useOpenerFocus({ fallbackSelector: "[data-list-trigger]" });
  // The active row while picking. Opened straight into edit mode there is no checked row to aim at,
  // and leaving focus on the sidebar button that opened the sheet would put it outside the modal —
  // so Escape and the Tab trap, both handlers on the dialog, would never see a key. The first
  // rename row, not the header toggle that is first in document order: that one now reads "Done",
  // and answering a request to edit with the control that exits editing is a strange place to land.
  // oxlint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- post-render focus
  useEffect(() => {
    const sheet = sheetRef.current;
    const target =
      sheet?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      sheet?.querySelector<HTMLElement>("[data-rename-row]");
    target?.focus();
  }, []);

  const accessibility = useMemo(() => {
    const nameOf = (id: UniqueIdentifier) =>
      lists.find((l) => l.id === String(id))?.name ?? t("appTitle");
    const posOf = (id: UniqueIdentifier) => lists.findIndex((l) => l.id === String(id)) + 1;
    const total = lists.length;
    const announcements: Announcements = {
      onDragStart: ({ active }) => t("dragListStart", { name: nameOf(active.id) }),
      onDragOver: ({ active, over }) =>
        over
          ? t("dragListOver", { name: nameOf(active.id), position: posOf(over.id), total })
          : undefined,
      onDragEnd: ({ active, over }) =>
        over
          ? t("dragListEnd", { name: nameOf(active.id), position: posOf(over.id), total })
          : t("dragListCancel", { name: nameOf(active.id) }),
      onDragCancel: ({ active }) => t("dragListCancel", { name: nameOf(active.id) }),
    };
    return { announcements, screenReaderInstructions: { draggable: t("dragListInstructions") } };
  }, [t, lists]);

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
      if (dragging) return;
      // Escape over a half-typed list name clears the field rather than discarding it with the sheet
      // — only while that field is on screen, or a leftover name swallows the Escape that closes.
      if (editing && newName) {
        e.preventDefault();
        setNewName("");
        return;
      }
      onClose();
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

  // Creating stays in the sheet, whether by Enter or by the + button: you are managing lists, and
  // switching away would end the session after one. Focus returns to the field, which the + button
  // otherwise leaves stranded on itself as it disables.
  const create = () => {
    if (!add(newName)) return;
    setNewName("");
    newNameRef.current?.focus();
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
        className={`
          fixed inset-0 z-40 flex items-end justify-center
          sm:items-center
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
          // The dialog role sits on the full-screen wrapper, so a test measuring the panel itself
          // has nothing to aim at without this.
          data-sheet
          inert={confirming !== null}
          className={`
            relative z-10 max-h-[80dvh] w-full max-w-md animate-sheet-in overflow-y-auto
            rounded-t-2xl bg-header shadow-xl
            sm:animate-snackbar-in sm:rounded-2xl
          `}
        >
          <div
            className={`
              sticky top-0 flex items-center justify-between border-b border-hairline bg-header px-4
              py-3
            `}
          >
            <h2 id={titleId} className="text-[13px] font-medium tracking-wide text-muted uppercase">
              {t("lists")}
            </h2>
            <button
              type="button"
              // No aria-pressed: the label itself carries the state ("Edit lists" / "Done"), and pairing
              // a changing label with a pressed state announces "Done, toggle button, pressed".
              onClick={() => {
                setEditing((v) => !v);
                setRenaming(null);
              }}
              className={`
                rounded-full px-2 py-1 text-[14px] font-medium text-accent-text outline-hidden
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
                accessibility={accessibility}
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
                  ref={newNameRef}
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                  }}
                  placeholder={t("newListPlaceholder")}
                  aria-label={t("newList")}
                  autoComplete="off"
                  className={`
                    flex-1 rounded-full bg-canvas px-4 py-2 text-[15px] outline-hidden
                    focus:ring-2 focus:ring-accent-text focus:ring-inset
                  `}
                />
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  aria-label={t("createList")}
                  className={`
                    grid size-9 flex-none place-items-center rounded-full bg-accent text-on-accent
                    outline-hidden
                    focus-visible:ring-2 focus-visible:ring-accent-text
                    disabled:bg-canvas disabled:text-faint
                  `}
                >
                  <AddIcon className="size-5" />
                </button>
              </form>
            </>
          ) : (
            <RosterRows
              lists={lists}
              activeId={activeId}
              semantics="menu"
              onSelect={(id) => {
                onSelect(id);
                onClose();
              }}
            />
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
