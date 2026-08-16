import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ItemRow, SortableRow } from "client/components/ShoppingList/ItemRow";
import type { Editing, ItemView } from "client/components/ShoppingList/types";

const baseItem: ItemView = { id: "1", name: "Milk", checked: false, quantity: undefined };

const makeHandlers = () => ({
  onEdit: vi.fn(),
  onToggle: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onSetQuantity: vi.fn(),
  onRegisterNameBtn: vi.fn(),
});

const renderRow = (overrides: { item?: Partial<ItemView>; editing?: Editing; q?: string } = {}) => {
  const handlers = makeHandlers();
  const item = { ...baseItem, ...overrides.item };
  render(
    <ItemRow item={item} q={overrides.q ?? ""} editing={overrides.editing ?? null} {...handlers} />,
  );
  return { ...handlers, item, user: userEvent.setup() };
};

/**
 * Only the KeyboardSensor is wired: the pointer sensors need layout jsdom doesn't compute, and the
 * keyboard path is what the activator guard governs.
 */
const SortableHarness = ({
  item,
  dndDisabled,
  editing,
  handlers,
}: {
  item: ItemView;
  dndDisabled: boolean;
  editing: Editing;
  handlers: ReturnType<typeof makeHandlers>;
}) => {
  const sensors = useSensors(
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext sensors={sensors}>
      <SortableContext items={[item.id]}>
        <ul>
          <SortableRow item={item} q="" dndDisabled={dndDisabled} editing={editing} {...handlers} />
        </ul>
      </SortableContext>
    </DndContext>
  );
};

const renderSortableRow = (
  overrides: { item?: Partial<ItemView>; editing?: Editing; dndDisabled?: boolean } = {},
) => {
  const handlers = makeHandlers();
  const item = { ...baseItem, ...overrides.item };
  render(
    <SortableHarness
      item={item}
      dndDisabled={overrides.dndDisabled ?? false}
      editing={overrides.editing ?? null}
      handlers={handlers}
    />,
  );
  return { ...handlers, item, user: userEvent.setup() };
};

/** Query handles grouped so tests never call `screen.*` inline; parametrized by item name. */
const ui = {
  addQty: (name: string) => screen.getByRole("button", { name: `Add quantity to ${name}` }),
  editQty: (name: string, count: number) =>
    screen.getByRole("button", { name: `Edit quantity of ${name}, currently ${count}` }),
  incQty: (name: string) => screen.getByRole("button", { name: `Increase quantity of ${name}` }),
  decQty: (name: string) => screen.getByRole("button", { name: `Decrease quantity of ${name}` }),
  closeQty: (name: string, count: number) =>
    screen.getByRole("button", {
      name: `Close quantity editor for ${name}, currently ${count}`,
    }),
  checkoff: (name: string) => screen.getByRole("button", { name: `Check off ${name}` }),
  name: (name: string) => screen.getByRole("button", { name }),
  rename: (name: string) => screen.getByLabelText(`Rename ${name}`),
  del: (name: string) => screen.getByLabelText(`Delete ${name}`),
  text: (content: string) => screen.getByText(content),
  /** The <li> drag activator, reached from a child — it has no accessible name of its own. */
  rowOf: (name: string) => {
    const row = ui.checkoff(name).closest("li");
    if (!row) throw new Error(`No row element for "${name}"`);
    return row;
  },
};

describe("ItemRow", () => {
  describe("when the checkbox is clicked", () => {
    it("toggles the item to the opposite checked state", async () => {
      const { onToggle, user } = renderRow();
      await user.click(ui.checkoff("Milk"));
      expect(onToggle).toHaveBeenCalledWith("1", true);
    });

    it("reports aria-pressed=false when unchecked", () => {
      renderRow();
      expect(ui.checkoff("Milk")).toHaveAttribute("aria-pressed", "false");
    });

    it("reports aria-pressed=true when checked", () => {
      renderRow({ item: { checked: true } });
      expect(ui.checkoff("Milk")).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("when the name is tapped", () => {
    it("opens name editing", async () => {
      const { onEdit, user } = renderRow();
      await user.click(ui.name("Milk"));
      expect(onEdit).toHaveBeenCalledWith({ id: "1", mode: "name" });
    });
  });

  describe("when a query matches the name", () => {
    it("wraps the matched substring in a <mark>", () => {
      renderRow({ q: "il" });
      const mark = ui.text("il");
      expect(mark.tagName).toBe("MARK");
      expect(ui.name("Milk")).toBeInTheDocument();
    });

    it("renders no <mark> without a query", () => {
      renderRow({ q: "" });
      expect(document.querySelector("mark")).toBeNull();
    });
  });

  describe("when there is no quantity", () => {
    it("offers an add-quantity button that opens the stepper at 1", async () => {
      const { onSetQuantity, onEdit, user } = renderRow();
      await user.click(ui.addQty("Milk"));
      expect(onSetQuantity).toHaveBeenCalledWith("1", 1);
      expect(onEdit).toHaveBeenCalledWith({ id: "1", mode: "qty" });
    });
  });

  describe("when a quantity is set but not being edited", () => {
    it("shows the value and opens the stepper on click", async () => {
      const { onEdit, user } = renderRow({ item: { quantity: 2 } });
      const btn = ui.editQty("Milk", 2);
      expect(btn).toHaveTextContent("2");
      await user.click(btn);
      expect(onEdit).toHaveBeenCalledWith({ id: "1", mode: "qty" });
    });

    // The aria-label overrides the button's text, so without the value in the label the number is
    // unreachable to assistive tech.
    it("carries the value in its accessible name, not only its text", () => {
      renderRow({ item: { quantity: 3 } });
      expect(ui.editQty("Milk", 3)).toHaveAccessibleName("Edit quantity of Milk, currently 3");
    });
  });

  describe("when editing the quantity", () => {
    const editingQty: Editing = { id: "1", mode: "qty" };

    it("increments", async () => {
      const { onSetQuantity, user } = renderRow({ item: { quantity: 2 }, editing: editingQty });
      await user.click(ui.incQty("Milk"));
      expect(onSetQuantity).toHaveBeenCalledWith("1", 3);
    });

    it("decrements without dropping below one", async () => {
      const { onSetQuantity, user } = renderRow({ item: { quantity: 2 }, editing: editingQty });
      await user.click(ui.decQty("Milk"));
      expect(onSetQuantity).toHaveBeenCalledWith("1", 1);
    });

    it("clears the quantity when decrementing the last unit", async () => {
      const { onSetQuantity, onEdit, user } = renderRow({
        item: { quantity: 1 },
        editing: editingQty,
      });
      await user.click(ui.decQty("Milk"));
      expect(onSetQuantity).toHaveBeenCalledWith("1", null);
      expect(onEdit).toHaveBeenCalledWith(null);
    });

    it("closes the stepper on the value button", async () => {
      const { onEdit, user } = renderRow({ item: { quantity: 2 }, editing: editingQty });
      await user.click(ui.closeQty("Milk", 2));
      expect(onEdit).toHaveBeenCalledWith(null);
    });
  });

  describe("when editing the name", () => {
    const editingName: Editing = { id: "1", mode: "name" };

    it("commits the new name on Enter", () => {
      const { onRename, onEdit } = renderRow({ editing: editingName });
      const input = ui.rename("Milk");
      fireEvent.change(input, { target: { value: "Butter" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onRename).toHaveBeenCalledWith("1", "Butter");
      expect(onEdit).toHaveBeenCalledWith(null);
    });

    it("cancels on Escape without renaming", () => {
      const { onRename, onEdit } = renderRow({ editing: editingName });
      fireEvent.keyDown(ui.rename("Milk"), { key: "Escape" });
      expect(onRename).not.toHaveBeenCalled();
      expect(onEdit).toHaveBeenCalledWith(null);
    });

    it("reveals a Delete action that removes the item", async () => {
      const { onDelete, user } = renderRow({ editing: editingName });
      await user.click(ui.del("Milk"));
      expect(onDelete).toHaveBeenCalledWith("1");
    });
  });

  describe("when the row is sortable", () => {
    it("toggles on Enter from the check-off button rather than lifting the row", async () => {
      const { onToggle, user } = renderSortableRow();
      ui.checkoff("Milk").focus();
      await user.keyboard("{Enter}");
      expect(onToggle).toHaveBeenCalledWith("1", true);
      expect(ui.rowOf("Milk")).not.toHaveAttribute("aria-pressed", "true");
    });

    it("toggles on Space from the check-off button rather than lifting the row", async () => {
      const { onToggle, user } = renderSortableRow();
      ui.checkoff("Milk").focus();
      await user.keyboard(" ");
      expect(onToggle).toHaveBeenCalledWith("1", true);
      expect(ui.rowOf("Milk")).not.toHaveAttribute("aria-pressed", "true");
    });

    it("opens name editing on Enter from the name button", async () => {
      const { onEdit, user } = renderSortableRow();
      ui.name("Milk").focus();
      await user.keyboard("{Enter}");
      expect(onEdit).toHaveBeenCalledWith({ id: "1", mode: "name" });
    });

    it("lifts the row when Space comes from the row itself", async () => {
      const { onToggle, user } = renderSortableRow();
      ui.rowOf("Milk").focus();
      await user.keyboard(" ");
      expect(ui.rowOf("Milk")).toHaveAttribute("aria-pressed", "true");
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("is a focusable drag target while dragging is enabled", () => {
      renderSortableRow();
      expect(ui.rowOf("Milk")).toHaveAttribute("role", "button");
      expect(ui.rowOf("Milk")).toHaveAttribute("tabindex", "0");
    });
  });

  describe("when dragging is disabled", () => {
    it("leaves the row a plain list item rather than a dead tab stop", () => {
      renderSortableRow({ dndDisabled: true });
      const row = ui.rowOf("Milk");
      expect(row).not.toHaveAttribute("role");
      expect(row).not.toHaveAttribute("tabindex");
      expect(row).not.toHaveAttribute("aria-disabled");
      expect(row).not.toHaveAttribute("data-draggable");
    });
  });

  describe("when the row is not sortable at all", () => {
    it("renders as a plain list item", () => {
      render(
        <ul>
          <ItemRow item={baseItem} q="" editing={null} {...makeHandlers()} />
        </ul>,
      );
      const row = ui.rowOf("Milk");
      expect(row).not.toHaveAttribute("role");
      expect(row).not.toHaveAttribute("tabindex");
    });
  });
});
