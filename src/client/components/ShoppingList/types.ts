export interface ItemView {
  id: string;
  name: string;
  checked: boolean;
  quantity: number | undefined;
}

export type Editing = { id: string; mode: "name" | "qty" } | null;

/**
 * Which of a row's two focusable controls a focus restore aims at. `name` for a mutation that leaves
 * the row in place, `check` for one that walks down the list.
 */
export type RowControl = "name" | "check";

export type RestoreFocus = (target?: { id?: string; control?: RowControl }) => void;

export interface RowProps {
  editing: Editing;
  onEdit: (e: Editing) => void;
  onToggle: (id: string, checked: boolean) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onSetQuantity: (id: string, quantity: number | null) => void;
  onRegisterNameBtn: (id: string, el: HTMLButtonElement | null) => void;
  onRegisterCheckBtn: (id: string, el: HTMLButtonElement | null) => void;
}
