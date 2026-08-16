import { type CSSProperties, useCallback, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS, useCombinedRefs } from "@dnd-kit/utilities";
import { AddIcon, CheckIcon, DeleteIcon, MinusIcon } from "client/components/icons";
import { useTranslation } from "client/i18n/useTranslation";
import { focusDropped } from "client/components/focus";
import { prefersReducedMotion } from "./helpers";
import { useSwipeToDelete } from "./useSwipeToDelete";
import type { ItemView, RowProps } from "./types";

type SortableBag = {
  setNodeRef: (node: HTMLElement | null) => void;
  // Partial: a disabled row is handed back the full attribute set anyway (only `listeners` are
  // dropped), so it has to be narrowed to keep the <li> a plain listitem rather than a dead tab stop.
  attributes: Partial<ReturnType<typeof useSortable>["attributes"]>;
  listeners: ReturnType<typeof useSortable>["listeners"];
  style: CSSProperties;
  isDragging: boolean;
  disabled: boolean;
};

interface ItemRowProps extends RowProps {
  item: ItemView;
  q: string;
  sortable?: SortableBag;
  // Collapsed: keep the view-transition-name so checking animates the move in, but hide via opacity
  // — a named element ignores its ancestor's overflow clip during a transition, so the clip won't.
  collapsed?: boolean;
  // A drag is in progress — swipe and drag are mutually exclusive.
  swipeLocked?: boolean;
  // Syncing blocks starting a swipe, but checked at gesture start so it can't cancel one in
  // progress.
  syncing?: boolean;
}

/**
 * Stop a control's press from reaching the row's drag sensor so it doesn't arm a long-press drag.
 */
const stopDrag = {
  onMouseDown: (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
  },
  onTouchStart: (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
  },
};

const Highlighted = ({ name, q }: { name: string; q: string }) => {
  const i = name.toLowerCase().indexOf(q);
  if (!q || i < 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, i)}
      <mark className="rounded-[3px] bg-accent px-px text-on-accent">
        {name.slice(i, i + q.length)}
      </mark>
      {name.slice(i + q.length)}
    </>
  );
};

export const SortableRow = ({
  dndDisabled,
  ...props
}: Omit<ItemRowProps, "sortable"> & { dndDisabled: boolean }) => {
  // Also lock the row being renamed so a long-press on its input doesn't lift it.
  const disabled = dndDisabled || props.editing?.id === props.item.id;
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.item.id, disabled });

  // The row itself is the drag activator (ADR 0008), but the KeyboardSensor only enforces that when
  // it has an activator node to compare the event target against. With none, its
  // `event.target !== activator` guard never runs and Space/Enter on any child button lifts the row
  // — preventDefault-ing the button's own click — instead of activating the button.
  const setRowRef = useCombinedRefs(setNodeRef, setActivatorNodeRef);

  const sortable: SortableBag = {
    setNodeRef: setRowRef,
    // Drop the whole set: role="button" and tabIndex={0} would otherwise survive on a row that can no
    // longer be dragged, leaving a tab stop that does nothing while the add/search field is focused or
    // the row is being renamed. aria-disabled goes too — it only carries meaning on a widget, and the
    // row is a plain listitem again. `data-draggable` remains the signal for styling and tests.
    attributes: disabled ? {} : attributes,
    listeners,
    style: {
      transform: CSS.Translate.toString(transform),
      transition: prefersReducedMotion() ? undefined : transition,
    },
    isDragging,
    disabled,
  };
  return <ItemRow {...props} sortable={sortable} />;
};

export const ItemRow = ({
  item,
  q,
  sortable,
  collapsed,
  swipeLocked,
  syncing,
  editing,
  onEdit,
  onToggle,
  onRename,
  onDelete,
  onSetQuantity,
  onRegisterNameBtn,
}: ItemRowProps) => {
  const t = useTranslation();
  const nameEditing = editing?.id === item.id && editing.mode === "name";
  const qtyEditing = editing?.id === item.id && editing.mode === "qty";
  const { quantity } = item;
  const swipe = useSwipeToDelete({
    onDelete: () => {
      onDelete(item.id);
    },
    enabled: !nameEditing && !swipeLocked,
    syncing,
  });

  const nameBtnRef = useRef<HTMLButtonElement | null>(null);
  const qtyBtnRef = useRef<HTMLButtonElement | null>(null);
  const wasNameEditing = useRef(false);
  const wasQtyEditing = useRef(false);
  const setNameBtn = useCallback(
    (el: HTMLButtonElement | null) => {
      nameBtnRef.current = el;
      onRegisterNameBtn(item.id, el);
    },
    [item.id, onRegisterNameBtn],
  );
  // Reclaim focus to the row's control when an edit closes and focus fell to <body>; left alone if
  // moved on purpose. Runs after the render that unmounts the input — post-render focus/DOM
  // synchronization, which belongs in an Effect. Doing it in the close handler would need flushSync
  // to unmount the focused input from within its own event, a fragile re-entrant pattern.
  // https://react.dev/learn/synchronizing-with-effects
  // oxlint-disable react-you-might-not-need-an-effect/no-event-handler
  useEffect(() => {
    if (wasNameEditing.current && !nameEditing && focusDropped()) nameBtnRef.current?.focus();
    wasNameEditing.current = nameEditing;
  }, [nameEditing]);
  useEffect(() => {
    if (wasQtyEditing.current && !qtyEditing && focusDropped()) qtyBtnRef.current?.focus();
    wasQtyEditing.current = qtyEditing;
  }, [qtyEditing]);
  // oxlint-enable react-you-might-not-need-an-effect/no-event-handler

  return (
    <li
      ref={sortable?.setNodeRef}
      style={{ ...sortable?.style, viewTransitionName: `item-${item.id}` }}
      {...sortable?.attributes}
      {...sortable?.listeners}
      data-draggable={(sortable && !sortable.disabled) || undefined}
      data-dragging={sortable?.isDragging || undefined}
      data-collapsed={collapsed || undefined}
      className={`
        relative overflow-hidden rounded-[10px]
        data-collapsed:opacity-0
        data-draggable:cursor-grab data-draggable:active:cursor-grabbing
        data-dragging:opacity-30
      `}
    >
      {(swipe.dx < 0 || swipe.releasing) && (
        <div
          data-reached={swipe.reached || undefined}
          className={`
            pointer-events-none absolute inset-y-0 right-3 flex items-center justify-center
            overflow-hidden rounded-full bg-danger-soft text-white
            data-reached:bg-danger
          `}
          style={{
            width: Math.max(0, -swipe.dx - 24),
            transition: prefersReducedMotion()
              ? undefined
              : swipe.swiping
                ? "background-color 0.15s ease-out"
                : "width 0.3s cubic-bezier(0.34, 1.15, 0.64, 1), background-color 0.15s ease-out",
          }}
          aria-hidden
        >
          <span className="inline-flex" data-reached-bump={swipe.reached || undefined}>
            <DeleteIcon className="size-5" />
          </span>
        </div>
      )}
      <div
        ref={swipe.ref}
        style={swipe.style}
        className="relative flex items-center gap-3.5 bg-canvas px-2 py-2.5"
      >
        <button
          type="button"
          aria-label={t("mark", { name: item.name })}
          aria-pressed={item.checked}
          data-checked={item.checked || undefined}
          {...stopDrag}
          onClick={() => {
            onToggle(item.id, !item.checked);
          }}
          className={`
            grid size-5.5 flex-none place-items-center rounded-full border-[1.5px] border-muted
            text-transparent
            data-checked:border-accent data-checked:bg-accent data-checked:text-on-accent
          `}
        >
          <CheckIcon className="size-3.75" />
        </button>

        {nameEditing ? (
          <input
            autoFocus
            defaultValue={item.name}
            aria-label={t("rename", { name: item.name })}
            onBlur={(e) => {
              // Keep editing when focus moves to the row's Delete button, so keyboard users can Tab
              // to it (else delete is touch/mouse only).
              if (
                e.relatedTarget instanceof Node &&
                e.currentTarget.closest("li")?.contains(e.relatedTarget)
              )
                return;
              onRename(item.id, e.target.value);
              onEdit(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(item.id, e.currentTarget.value);
                onEdit(null);
              }
              if (e.key === "Escape") onEdit(null);
            }}
            className={`
              flex-1 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[15px] ring-2 ring-accent-text
              outline-none ring-inset
            `}
          />
        ) : (
          <button
            type="button"
            ref={setNameBtn}
            data-checked={item.checked || undefined}
            onClick={() => {
              onEdit({ id: item.id, mode: "name" });
            }}
            className={`
              flex-1 text-left text-[15px]
              data-checked:text-faint data-checked:line-through
            `}
          >
            {q ? <Highlighted name={item.name} q={q} /> : item.name}
          </button>
        )}

        {nameEditing ? null : qtyEditing && quantity !== undefined ? (
          <div className="flex flex-none items-center gap-2 text-[14px] tabular-nums" {...stopDrag}>
            <button
              type="button"
              aria-label={t("decreaseQuantity", { name: item.name })}
              onClick={() => {
                if (quantity <= 1) {
                  onSetQuantity(item.id, null);
                  onEdit(null);
                } else onSetQuantity(item.id, quantity - 1);
              }}
              className={`
                grid size-7 place-items-center rounded-full border border-hairline text-muted
              `}
            >
              <MinusIcon className="size-4" />
            </button>
            <button
              type="button"
              aria-label={t("closeQuantity", { name: item.name })}
              onClick={() => {
                onEdit(null);
              }}
              className="min-w-5 text-center"
            >
              {quantity}
            </button>
            <button
              type="button"
              aria-label={t("increaseQuantity", { name: item.name })}
              onClick={() => {
                onSetQuantity(item.id, quantity + 1);
              }}
              className={`
                grid size-7 place-items-center rounded-full border border-hairline text-muted
              `}
            >
              <AddIcon className="size-4" />
            </button>
          </div>
        ) : quantity !== undefined ? (
          <button
            type="button"
            aria-label={t("editQuantity", { name: item.name })}
            ref={qtyBtnRef}
            {...stopDrag}
            onClick={() => {
              onEdit({ id: item.id, mode: "qty" });
            }}
            className={`
              flex size-7 flex-none items-center justify-center rounded-full border border-hairline
              text-[14px] font-medium text-muted tabular-nums
            `}
          >
            {quantity}
          </button>
        ) : (
          <button
            type="button"
            aria-label={t("addQuantity", { name: item.name })}
            ref={qtyBtnRef}
            {...stopDrag}
            onClick={() => {
              onSetQuantity(item.id, 1);
              onEdit({ id: item.id, mode: "qty" });
            }}
            className={`
              grid size-7 flex-none place-items-center rounded-full border border-hairline
              text-[15px] font-medium text-faint
            `}
          >
            #
          </button>
        )}

        {nameEditing && (
          <button
            type="button"
            aria-label={t("delete", { name: item.name })}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              onDelete(item.id);
            }}
            className="grid size-7.5 flex-none place-items-center rounded-full text-faint"
          >
            <DeleteIcon className="size-4.5" />
          </button>
        )}
      </div>
    </li>
  );
};
