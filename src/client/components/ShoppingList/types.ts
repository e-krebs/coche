export interface ItemView {
  id: string;
  name: string;
  checked: boolean;
  quantity: number | undefined;
}

export type Editing = { id: string; mode: "name" | "qty" } | null;

export interface RowProps {
  editing: Editing;
  onEdit: (e: Editing) => void;
  onToggle: (id: string, checked: boolean) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onSetQuantity: (id: string, quantity: number | null) => void;
  onRegisterNameBtn: (id: string, el: HTMLButtonElement | null) => void;
}
