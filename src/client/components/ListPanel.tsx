import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useListRoster, type ListSummary } from "client/store/lists";
import { useTranslation } from "client/i18n/useTranslation";
import { AddIcon, DeleteIcon, DragIcon } from "client/components/icons";
import { ConfirmDialog } from "client/components/ConfirmDialog";
import { focusDropped } from "client/components/focus";
import { ListRows, rowBase } from "client/components/ListRows";
import { ListSheetWrapper } from "client/components/ListSheetWrapper";
import { ListSidebarWrapper } from "client/components/ListSidebarWrapper";
import { prefersReducedMotion } from "client/components/ShoppingList/helpers";

const iconBtn = `grid size-9 flex-none place-items-center rounded-full text-muted outline-hidden
  focus-visible:ring-2 focus-visible:ring-accent-text`;

const EditRow = ({
  list,
  label,
  renaming,
  draft,
  canDelete,
  onStartRename,
  onDraft,
  onRename,
  onDelete,
}: {
  list: ListSummary;
  label: string;
  renaming: boolean;
  /**
   * The rename in progress, held by the panel rather than by the input: the input is torn down by
   * anything that reshapes the panel, and DOM state doesn't survive that.
   */
  draft: string;
  canDelete: boolean;
  onStartRename: () => void;
  onDraft: (draft: string) => void;
  onRename: (name: string | null) => void;
  onDelete: () => void;
}) => {
  const t = useTranslation();
  const renameBtn = useRef<HTMLButtonElement>(null);
  const wasRenaming = useRef(renaming);
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: list.id,
    disabled: renaming,
    attributes: { roleDescription: t("sortableList") },
  });

  // Reclaim focus to this row when its field closes and focus fell to <body>; left alone if moved on
  // purpose. Beside the list nothing behind is inert, so a dropped focus restarts tab order from the
  // top of the document rather than landing back in the panel.
  // https://react.dev/learn/synchronizing-with-effects
  // oxlint-disable react-you-might-not-need-an-effect/no-event-handler
  useEffect(() => {
    if (wasRenaming.current && !renaming && focusDropped()) renameBtn.current?.focus();
    wasRenaming.current = renaming;
  }, [renaming]);
  // oxlint-enable react-you-might-not-need-an-effect/no-event-handler

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
          value={draft}
          aria-label={t("renameList", { name: label })}
          onChange={(e) => {
            onDraft(e.target.value);
          }}
          onBlur={(e) => {
            // A blur with nowhere to go is two events at once: a click on dead space, which commits
            // like any other, and the field being taken out from under the reader by a resize
            // swapping the panel's home, which must not — that would write a name nobody confirmed.
            // Only the next frame tells them apart, by whether the field is still there.
            if (e.relatedTarget) {
              onRename(draft);
              return;
            }
            const field = e.currentTarget;
            requestAnimationFrame(() => {
              if (field.isConnected) onRename(draft);
            });
          }}
          onKeyDown={(e) => {
            // Both keys are the panel's otherwise — Escape would dismiss it, Enter submit nothing.
            // Only those two: Tab has to keep bubbling or the sheet's trap never sees it and focus
            // walks out of the modal.
            if (e.key !== "Enter" && e.key !== "Escape") return;
            e.stopPropagation();
            onRename(e.key === "Enter" ? draft : null);
          }}
          className={`
            min-w-0 flex-1 rounded-lg border border-accent-text bg-accent-soft px-2.5 py-1.5
            text-[15px] outline-hidden
            focus:ring-2 focus:ring-accent-text focus:ring-inset
          `}
        />
      ) : (
        <button
          ref={renameBtn}
          type="button"
          onClick={onStartRename}
          data-rename-row
          className={`
            ${rowBase}
            min-w-0 flex-1 py-2.5
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
 * The lists, in whichever home the width gives them: a modal sheet below `lg`, a sidebar above it.
 * One component for both, so they can't drift apart in what they show — and so two of them can't be
 * on screen at once. Everything but the chrome lives here: pick a list, or flip to Edit to create,
 * rename, reorder and delete them. Its state outlives a change of home, which is why the rename and
 * the new-list name are held here rather than in the fields.
 */
export const ListPanel = ({
  activeId,
  wrapper,
  editing,
  blocked,
  confirming,
  onSelect,
  onEditingChange,
  onConfirming,
  onDismiss,
}: {
  activeId: string;
  wrapper: "sheet" | "sidebar";
  editing: boolean;
  /** A modal is up in front of the panel, so its own controls are out of reach. */
  blocked: boolean;
  /** Owned above, so the page behind the confirmation can be made unreachable at every width. */
  confirming: ListSummary | null;
  onSelect: (id: string) => void;
  onEditingChange: (editing: boolean) => void;
  onConfirming: (list: ListSummary | null) => void;
  /**
   * Out of the panel's current job: the sheet closes, the sidebar drops back to picking — there is
   * nothing up there to close.
   */
  onDismiss: () => void;
}) => {
  const t = useTranslation();
  const { lists, add, rename, remove, reorder } = useListRoster();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const newNameRef = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(editing);
  const titleId = useId();

  const menu = wrapper === "sheet";
  const nameOf = (list: ListSummary) => list.name ?? t("appTitle");
  // The roster is never empty, and there is no zero-lists state to fall into.
  const canDelete = lists.length > 1;

  // Leaving edit mode takes six of its seven controls with it, and beside the list there is no inert
  // page to catch a dropped focus — so put it back on the anchor that survives.
  // https://react.dev/learn/synchronizing-with-effects
  // oxlint-disable react-you-might-not-need-an-effect/no-event-handler
  useEffect(() => {
    const left = wasEditing.current && !editing;
    wasEditing.current = editing;
    if (!left) return;
    requestAnimationFrame(() => {
      if (!focusDropped()) return;
      document.querySelector<HTMLElement>("[data-list-trigger]")?.focus();
    });
  }, [editing]);
  // oxlint-enable react-you-might-not-need-an-effect/no-event-handler

  const clearDrafts = () => {
    setRenaming(null);
    setRenameDraft("");
    setNewName("");
  };

  const setEditing = (next: boolean) => {
    clearDrafts();
    setAnnouncement(t(next ? "listsEditing" : "listsEditingDone"));
    onEditingChange(next);
  };

  const dismiss = () => {
    clearDrafts();
    // Escape leaves edit mode too, and the region has to change to be spoken at all — announcing
    // only the way in would go silent on the second trip through.
    if (editing) setAnnouncement(t("listsEditingDone"));
    onDismiss();
  };

  // Unmemoized for the same reason as the list's: `lists` is rebuilt every render, so a memo on it
  // recomputed every render anyway. Id-keyed rather than reusing `nameOf`, which takes the row.
  const dragName = (id: UniqueIdentifier) =>
    lists.find((l) => l.id === String(id))?.name ?? t("appTitle");
  const dragPos = (id: UniqueIdentifier) => lists.findIndex((l) => l.id === String(id)) + 1;
  const dragTotal = lists.length;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("dragListStart", { name: dragName(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("dragListOver", {
            name: dragName(active.id),
            position: dragPos(over.id),
            total: dragTotal,
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("dragListEnd", {
            name: dragName(active.id),
            position: dragPos(over.id),
            total: dragTotal,
          })
        : t("dragListCancel", { name: dragName(active.id) }),
    onDragCancel: ({ active }) => t("dragListCancel", { name: dragName(active.id) }),
  };
  const accessibility = {
    announcements,
    screenReaderInstructions: { draggable: t("dragListInstructions") },
  };

  // Escape is decided here, where what is in flight is known; the sheet's own handler takes Tab and
  // the arrows. A keyboard drag reads Escape as cancel (dnd-kit's), so leave it alone or the whole
  // edit session goes with it. A half-typed list name is cleared rather than discarded along with
  // the panel — only while that field is on screen, or a leftover name swallows the Escape.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || dragging) return;
    if (editing && newName) {
      e.preventDefault();
      setNewName("");
      return;
    }
    dismiss();
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Short delay even with a dedicated handle, so a scroll flick starting on it still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Creating stays in the panel, whether by Enter or by the + button: you are managing lists, and
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
    onConfirming(null);
    if (!remove(id)) return;
    setAnnouncement(t("listDeleted", { name: nameOf(confirming) }));
    // Deleting the list you're standing on switches away, and that remounts this view — so leave
    // deliberately, rather than letting the remount do it and look like a glitch.
    if (id === activeId && next) {
      onSelect(next);
      dismiss();
    }
  };

  // A lift preview, and beside the list a necessary one: the sidebar is `sticky`, so dnd-kit's
  // scroll compensation would slide the row itself away from the row it will land on when the page
  // scrolls mid-drag. The sheet is `fixed`, which keeps the page's scroll out of those sums.
  const draggingList = dragging ? lists.find((l) => l.id === dragging) : undefined;

  const body = (
    <>
      {/* Inside the panel, so a reader whose tree narrows to an open dialog still hears it */}
      <p data-lists-announcer role="status" aria-live="polite" aria-atomic className="sr-only">
        {announcement}
      </p>
      <div
        data-wrapper={wrapper}
        className={`
          sticky top-0 flex items-center justify-between bg-header px-4 pt-4 pb-2
          data-[wrapper=sheet]:border-b data-[wrapper=sheet]:border-hairline
          data-[wrapper=sheet]:py-3
        `}
      >
        <h2 id={titleId} className="text-[13px] font-medium tracking-wide text-muted uppercase">
          {t("lists")}
        </h2>
        <button
          type="button"
          // No aria-pressed: the label itself carries the state ("Edit lists" / "Done"), and pairing
          // a changing label with a pressed state announces "Done, toggle button, pressed".
          // While editing beside the list no row carries `aria-current`, so this button — the one
          // control edit mode cannot lose — is where a focus restore aims.
          data-list-trigger={(!menu && editing) || undefined}
          onClick={() => {
            setEditing(!editing);
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
            onDragStart={(e) => {
              setDragging(String(e.active.id));
            }}
            onDragCancel={() => {
              setDragging(null);
            }}
            onDragEnd={(e) => {
              setDragging(null);
              if (e.over) {
                reorder({ activeId: String(e.active.id), overId: String(e.over.id) });
              }
            }}
          >
            <SortableContext items={lists.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              {/* Marked rather than named: the surface around it is named "Lists" already */}
              <ul data-list-editor className="flex flex-col gap-0.5 p-1.5">
                {lists.map((list) => (
                  <EditRow
                    key={list.id}
                    list={list}
                    label={nameOf(list)}
                    renaming={renaming === list.id}
                    draft={renameDraft}
                    canDelete={canDelete}
                    onStartRename={() => {
                      setRenaming(list.id);
                      setRenameDraft(nameOf(list));
                    }}
                    onDraft={setRenameDraft}
                    onRename={(name) => {
                      if (name !== null) rename({ id: list.id, name });
                      setRenaming(null);
                    }}
                    onDelete={() => {
                      onConfirming(list);
                    }}
                  />
                ))}
              </ul>
            </SortableContext>
            {!menu && (
              <DragOverlay>
                {draggingList && (
                  <div
                    className={`
                      ${rowBase}
                      cursor-grabbing rounded-lg bg-header shadow-xl
                    `}
                  >
                    <DragIcon className="size-5 flex-none text-muted" />
                    <span className="flex-1 truncate">{nameOf(draggingList)}</span>
                  </div>
                )}
              </DragOverlay>
            )}
          </DndContext>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
            data-wrapper={wrapper}
            // Pinned in the sidebar, whose rows can outgrow the viewport: the primary action stays
            // on screen at any offset, as the heading does.
            className={`
              flex items-center gap-2 border-t border-hairline bg-header px-4 py-3
              data-[wrapper=sidebar]:sticky data-[wrapper=sidebar]:bottom-0
              data-[wrapper=sidebar]:mt-auto
            `}
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
                min-w-0 flex-1 rounded-full bg-canvas px-4 py-2 text-[15px] outline-hidden
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
        <ListRows
          lists={lists}
          activeId={activeId}
          semantics={menu ? "menu" : "nav"}
          onSelect={(id) => {
            onSelect(id);
            if (menu) dismiss();
          }}
        />
      )}
    </>
  );

  // The confirmation sits outside the wrapper: inside the sheet it would go inert along with the
  // panel it covers, and inside the sidebar — a stacking context, being sticky — a fixed overlay
  // could not rise above the list's own header.
  return (
    <>
      {menu ? (
        <ListSheetWrapper
          titleId={titleId}
          blocked={blocked}
          roving={!editing}
          onKeyDown={onKeyDown}
          onDismiss={dismiss}
        >
          {body}
        </ListSheetWrapper>
      ) : (
        <ListSidebarWrapper
          titleId={titleId}
          editing={editing}
          blocked={blocked}
          onKeyDown={onKeyDown}
        >
          {body}
        </ListSidebarWrapper>
      )}
      {confirming && (
        <ConfirmDialog
          title={t("deleteListTitle", { name: nameOf(confirming) })}
          body={
            confirming.total === 0
              ? t("deleteListEmpty")
              : t("deleteListBody", { count: confirming.total })
          }
          confirmLabel={t("confirmDelete")}
          // Confirming destroys the Delete that opened this, so focus needs somewhere else: the
          // first surviving row while editing — the anchor up there is the toggle that *ends* the
          // session, one keypress from a reader who is deleting a second list.
          fallbackSelector={editing ? "[data-rename-row]" : "[data-list-trigger]"}
          onConfirm={confirmDelete}
          onCancel={() => {
            onConfirming(null);
          }}
        />
      )}
    </>
  );
};
