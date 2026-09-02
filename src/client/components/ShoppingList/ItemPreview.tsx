import type { ItemView } from "./types";

/** The drag overlay's contents: a visual copy of the row being dragged, so it duplicates the source
 * row's text and is hidden from assistive tech. `hoverActions` has to match the row's, or the
 * quantity badge jumps by the width of the Delete slot the instant the lift commits. */
export const ItemPreview = ({ item, hoverActions }: { item: ItemView; hoverActions?: boolean }) => {
  return (
    <div
      aria-hidden
      className={`
        flex items-center gap-3.5 rounded-[10px] bg-header px-2 py-2.5 shadow-lg ring-1
        ring-hairline
      `}
    >
      <span className="size-5.5 flex-none rounded-full border-[1.5px] border-muted" />
      <span className="flex-1 text-[15px]">{item.name}</span>
      {item.quantity !== undefined ? (
        <span
          className={`
            grid size-7 flex-none place-items-center rounded-full border border-hairline text-[14px]
            font-medium text-muted tabular-nums
          `}
        >
          {item.quantity}
        </span>
      ) : null}
      {hoverActions ? <span className="size-7.5 flex-none" /> : null}
    </div>
  );
};
