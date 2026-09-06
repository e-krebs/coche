import { type KeyboardEvent, type ReactNode } from "react";

/**
 * The lists standing beside the list instead of over it. Nothing modal lives here — no scrim, no
 * Tab trap, no focus restore: the surface never goes away, so there is nothing to hand focus back
 * to. It widens while editing, where every row has to hold a drag handle, a rename field and a
 * delete alongside the name.
 */
export const ListSidebarWrapper = ({
  titleId,
  editing,
  blocked,
  onKeyDown,
  children,
}: {
  titleId: string;
  editing: boolean;
  blocked: boolean;
  onKeyDown: (e: KeyboardEvent) => void;
  children: ReactNode;
}) => (
  <nav
    aria-labelledby={titleId}
    data-list-sidebar
    data-editing={editing || undefined}
    inert={blocked}
    onKeyDown={onKeyDown}
    // `overflow-y` forces `overflow-x` to `auto`, and mid-transition an edit row is wider than the
    // column — so clip rather than offer a scrollbar that lasts 300ms.
    className={`
      sticky top-0 flex h-dvh w-68 flex-col overflow-x-hidden overflow-y-auto border-r
      border-hairline bg-header transition-[width] duration-300 ease-out
      data-editing:w-88
      motion-reduce:transition-none
    `}
  >
    {children}
  </nav>
);
