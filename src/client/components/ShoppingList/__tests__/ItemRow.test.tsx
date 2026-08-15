import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemRow } from "client/components/ShoppingList/ItemRow";
import type { Editing, ItemView } from "client/components/ShoppingList/types";

const baseItem: ItemView = { id: "1", name: "Milk", checked: false, quantity: undefined };

const renderRow = (overrides: { item?: Partial<ItemView>; editing?: Editing; q?: string } = {}) => {
  const handlers = {
    onEdit: vi.fn(),
    onToggle: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onSetQuantity: vi.fn(),
    onRegisterNameBtn: vi.fn(),
  };
  const item = { ...baseItem, ...overrides.item };
  render(
    <ItemRow item={item} q={overrides.q ?? ""} editing={overrides.editing ?? null} {...handlers} />,
  );
  return { ...handlers, item, user: userEvent.setup() };
};

/** Query handles grouped so tests never call `screen.*` inline; parametrized by item name. */
const ui = {
  addQty: (name: string) => screen.getByRole("button", { name: `Add quantity to ${name}` }),
  editQty: (name: string) => screen.getByRole("button", { name: `Edit quantity of ${name}` }),
  incQty: (name: string) => screen.getByRole("button", { name: `Increase quantity of ${name}` }),
  decQty: (name: string) => screen.getByRole("button", { name: `Decrease quantity of ${name}` }),
  closeQty: (name: string) =>
    screen.getByRole("button", { name: `Close quantity editor for ${name}` }),
  checkoff: (name: string) => screen.getByRole("button", { name: `Check off ${name}` }),
  name: (name: string) => screen.getByRole("button", { name }),
  rename: (name: string) => screen.getByLabelText(`Rename ${name}`),
  del: (name: string) => screen.getByLabelText(`Delete ${name}`),
  text: (content: string) => screen.getByText(content),
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
      const btn = ui.editQty("Milk");
      expect(btn).toHaveTextContent("2");
      await user.click(btn);
      expect(onEdit).toHaveBeenCalledWith({ id: "1", mode: "qty" });
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
      await user.click(ui.closeQty("Milk"));
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
});
