import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createShoppingStore } from "client/store/store";
import { DEFAULT_LIST_ID } from "client/store/schema";
import { ShoppingList } from "client/components/ShoppingList";

const setup = () => {
  const store = createShoppingStore();
  const onPickList = vi.fn();
  render(
    <Provider store={store}>
      <ShoppingList listId={DEFAULT_LIST_ID} listName="Coche" onPickList={onPickList} />
    </Provider>,
  );
  return { store, onPickList, user: userEvent.setup() };
};

const names = (store: ReturnType<typeof createShoppingStore>) =>
  store.getRowIds("items").map((id) => store.getCell("items", id, "name"));

/** Query handles grouped so tests never call `screen.*` inline; parametrized by item name. */
const ui = {
  get field() {
    return screen.getByLabelText("Add or find an item");
  },
  addQty: (name: string) => screen.getByRole("button", { name: `Add quantity to ${name}` }),
  incQty: (name: string) => screen.getByRole("button", { name: `Increase quantity of ${name}` }),
  decQty: (name: string) => screen.getByRole("button", { name: `Decrease quantity of ${name}` }),
  get clearChecked() {
    return screen.getByRole("button", { name: "Clear checked" });
  },
  get undo() {
    return screen.getByRole("button", { name: "Undo" });
  },
  get checkedToggle() {
    return screen.getByRole("button", { name: /Checked \(\d+\)/ });
  },
  get listTitle() {
    return screen.getByRole("heading", { level: 1 });
  },
  get switchList() {
    return screen.getByRole("button", { name: "Coche" });
  },
  checkoff: (name: string) => screen.getByRole("button", { name: `Check off ${name}` }),
  queryCheckoff: (name: string) => screen.queryByRole("button", { name: `Check off ${name}` }),
  name: (name: string) => screen.getByRole("button", { name }),
  rename: (name: string) => screen.getByLabelText(`Rename ${name}`),
  del: (name: string) => screen.getByLabelText(`Delete ${name}`),
  queryDel: (name: string) => screen.queryByLabelText(`Delete ${name}`),
  byNames: (re: RegExp) => screen.getAllByRole("button", { name: re }),
};

describe("ShoppingList", () => {
  // The trigger is the title, in the band that shrinks on scroll rather than vanishing — so it stays
  // reachable at any scroll position. It carries no aria-label: the list name has to *be* the
  // heading's accessible name, or heading navigation and voice control both lose it.
  describe("when the list name is tapped", () => {
    it("names the list and asks the parent to open the picker", async () => {
      const { onPickList, user } = setup();
      expect(ui.listTitle).toHaveAccessibleName("Coche");
      await user.click(ui.switchList);
      expect(onPickList).toHaveBeenCalledOnce();
    });
  });

  describe("when adding an item", () => {
    it("trims surrounding whitespace and rejects empty names", async () => {
      const { store, user } = setup();
      await user.type(ui.field, "  Milk  {Enter}");
      expect(names(store)).toEqual(["Milk"]);
      await user.type(ui.field, "   {Enter}");
      expect(names(store)).toEqual(["Milk"]);
    });
  });

  describe("when toggling an item", () => {
    it("persists the checked state to the store", async () => {
      const { store, user } = setup();
      await user.type(ui.field, "Eggs{Enter}");
      await user.click(ui.checkoff("Eggs"));
      const id = store.getRowIds("items")[0];
      expect(store.getCell("items", id, "checked")).toBe(true);
    });
  });

  describe("when renaming via tap-to-edit", () => {
    it("writes the new name to the store", async () => {
      const { store, user } = setup();
      await user.type(ui.field, "Buter{Enter}");
      await user.click(ui.name("Buter"));
      const editInput = ui.rename("Buter");
      fireEvent.change(editInput, { target: { value: "Butter" } });
      fireEvent.keyDown(editInput, { key: "Enter" });
      const id = store.getRowIds("items")[0];
      expect(store.getCell("items", id, "name")).toBe("Butter");
    });
  });

  describe("when adjusting quantity", () => {
    it("opens a stepper on add, increments, and clears on decrement to zero", async () => {
      const { store, user } = setup();
      await user.type(ui.field, "Apples{Enter}");
      const id = store.getRowIds("items")[0];
      const qty = () => store.getCell("items", id, "quantity");
      expect(qty()).toBeUndefined();
      await user.click(ui.addQty("Apples"));
      expect(qty()).toBe(1);
      await user.click(ui.incQty("Apples"));
      expect(qty()).toBe(2);
      await user.click(ui.decQty("Apples"));
      await user.click(ui.decQty("Apples"));
      expect(qty()).toBeUndefined();
    });
  });

  describe("when tapping an item name", () => {
    it("reveals the Delete action only then (edit mode)", async () => {
      const { store, user } = setup();
      await user.type(ui.field, "Butter{Enter}");
      expect(ui.queryDel("Butter")).toBeNull();
      await user.click(ui.name("Butter"));
      await user.click(ui.del("Butter"));
      expect(names(store)).toEqual([]);
    });
  });

  describe("when focus moves to the row's Delete button", () => {
    it("retains edit mode (keyboard delete path)", async () => {
      const { user } = setup();
      await user.type(ui.field, "Butter{Enter}");
      await user.click(ui.name("Butter"));
      const editInput = ui.rename("Butter");
      const del = ui.del("Butter");
      fireEvent.blur(editInput, { relatedTarget: del });
      expect(ui.del("Butter")).toBeInTheDocument();
    });
  });

  describe("when a rename is committed", () => {
    // A checked row isn't sortable, so focus drops to <body> as in a real browser, exercising the
    // focus-return effect.
    it("returns focus to the item", async () => {
      const { user } = setup();
      await user.type(ui.field, "Butter{Enter}");
      await user.click(ui.checkoff("Butter"));
      await user.click(ui.checkedToggle);
      await user.click(ui.name("Butter"));
      const editInput = ui.rename("Butter");
      editInput.focus();
      fireEvent.keyDown(editInput, { key: "Enter" });
      expect(ui.name("Butter")).toHaveFocus();
    });
  });

  describe("when an item is deleted", () => {
    it("offers an Undo that restores it", async () => {
      const { store, user } = setup();
      await user.type(ui.field, "Butter{Enter}");
      await user.click(ui.name("Butter"));
      await user.click(ui.del("Butter"));
      expect(names(store)).toEqual([]);
      await user.click(ui.undo);
      expect(names(store)).toEqual(["Butter"]);
    });
  });

  describe("when typing in the combined field", () => {
    it("filters the list, and a match can be checked off", async () => {
      const { store, user } = setup();
      const f = ui.field;
      await user.type(f, "Milk{Enter}");
      await user.type(f, "Bread{Enter}");
      await user.type(f, "Butter{Enter}");

      await user.type(f, "bu");
      expect(ui.queryCheckoff("Milk")).toBeNull();
      expect(ui.queryCheckoff("Bread")).toBeNull();

      await user.click(ui.checkoff("Butter"));
      const id = store
        .getRowIds("items")
        .find((i) => store.getCell("items", i, "name") === "Butter")!;
      expect(store.getCell("items", id, "checked")).toBe(true);
    });
  });

  describe("when an item is checked", () => {
    it("moves it to a folded section revealed on expand", async () => {
      const { user } = setup();
      await user.type(ui.field, "Milk{Enter}");
      await user.click(ui.checkoff("Milk"));
      expect(ui.queryCheckoff("Milk")).toBeNull();
      await user.click(ui.checkedToggle);
      expect(ui.checkoff("Milk")).toBeInTheDocument();
    });
  });

  describe("when clearing checked items", () => {
    it("removes only the checked items", async () => {
      const { store, user } = setup();
      const f = ui.field;
      await user.type(f, "Apples{Enter}");
      await user.type(f, "Bread{Enter}");
      await user.click(ui.checkoff("Apples"));
      await user.click(ui.checkedToggle);
      await user.click(ui.clearChecked);
      expect(names(store)).toEqual(["Bread"]);
    });
  });

  describe("when search results are ordered", () => {
    const order = () => ui.byNames(/^(Ancho|Anise|Banana|Mango)$/).map((b) => b.textContent);

    const seed = async (user: ReturnType<typeof userEvent.setup>) => {
      const f = ui.field;
      await user.type(f, "Banana{Enter}");
      await user.type(f, "Ancho{Enter}");
      await user.type(f, "Mango{Enter}");
      await user.type(f, "Anise{Enter}");
      await user.type(f, "an");
    };

    it("sorts by earliest match position, then alphabetically", async () => {
      const { user } = setup();
      await seed(user);
      expect(order()).toEqual(["Ancho", "Anise", "Banana", "Mango"]);
    });

    it("floats checked matches to the top", async () => {
      const { user } = setup();
      await seed(user);
      await user.click(ui.checkoff("Banana"));
      expect(order()).toEqual(["Banana", "Ancho", "Anise", "Mango"]);
    });
  });
});
