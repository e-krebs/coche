import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createShoppingStore } from "client/store/store";
import { DEFAULT_LIST_ID } from "client/store/schema";
import { ListPicker } from "client/components/ListPicker";

type Store = ReturnType<typeof createShoppingStore>;
type Tables = Parameters<Store["setTables"]>[0];

const item = ({
  listId,
  name,
  position = "a0",
  checked = false,
}: {
  listId: string;
  name: string;
  position?: string;
  checked?: boolean;
}) => ({ listId, name, position, checked, createdAt: 0 });

const setup = ({
  lists = {},
  items = {},
  activeId = DEFAULT_LIST_ID,
}: { lists?: Tables["lists"]; items?: Tables["items"]; activeId?: string } = {}) => {
  const store = createShoppingStore();
  store.setTables({ lists, items });
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const { unmount } = render(
    <Provider store={store}>
      <ListPicker activeId={activeId} onSelect={onSelect} onClose={onClose} />
    </Provider>,
  );
  return { store, onSelect, onClose, unmount, user: userEvent.setup() };
};

// The app has exactly one header trigger, and the global cleanup only unmounts React trees — so drop
// any left by an earlier test before adding this one's.
const trigger = () => {
  document.querySelectorAll("[data-list-trigger]").forEach((el) => {
    el.remove();
  });
  const el = document.createElement("button");
  el.dataset.listTrigger = "";
  document.body.append(el);
  return el;
};

const twoLists: Tables["lists"] = {
  [DEFAULT_LIST_ID]: { createdAt: 1 },
  garden: { name: "Garden", position: "a0", createdAt: 2 },
};

// Query handles grouped so tests never call `screen.*` inline; parametrized by list name.
const ui = {
  radio: (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name},`) }),
  get edit() {
    return screen.getByRole("button", { name: "Edit lists" });
  },
  get newName() {
    return screen.getByLabelText("New list name");
  },
  get create() {
    return screen.getByRole("button", { name: "Create list" });
  },
  rename: (name: string) => screen.getByLabelText(`Rename ${name}`),
  name: (name: string) => screen.getByRole("button", { name }),
  del: (name: string) => screen.getByRole("button", { name: `Delete ${name}` }),
  get confirm() {
    return screen.getByRole("button", { name: "Delete" });
  },
  get cancel() {
    return screen.getByRole("button", { name: "Cancel" });
  },
  queryDialog: (name: RegExp) => screen.queryByRole("dialog", { name }),
};

describe("ListPicker", () => {
  // An absent lists.name is the default list, not missing data — the migration never writes that
  // cell, so the app title stands in.
  it("names a nameless list with the app title and counts its unchecked items", () => {
    setup({
      lists: twoLists,
      items: {
        a: item({ listId: DEFAULT_LIST_ID, name: "Milk" }),
        b: item({ listId: DEFAULT_LIST_ID, name: "Bread", position: "a1", checked: true }),
        c: item({ listId: "garden", name: "Seeds" }),
      },
    });
    expect(ui.radio("Coche")).toHaveAccessibleName("Coche, 1 item"); // the checked one doesn't count
    expect(ui.radio("Garden")).toHaveAccessibleName("Garden, 1 item");
  });

  describe("when a list is picked", () => {
    it("switches to it and closes", async () => {
      const { onSelect, onClose, user } = setup({ lists: twoLists });
      await user.click(ui.radio("Garden"));
      expect(onSelect).toHaveBeenCalledWith("garden");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe("when a list is created", () => {
    it("trims the name, switches to the new list, and closes", async () => {
      const { store, onSelect, onClose, user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      await user.type(ui.newName, "  Hardware  ");
      await user.click(ui.create);

      const id = store
        .getRowIds("lists")
        .find((l) => store.getCell("lists", l, "name") === "Hardware");
      expect(id).toBeDefined();
      expect(onSelect).toHaveBeenCalledWith(id);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("rejects a blank name", async () => {
      const { store, user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      await user.type(ui.newName, "   ");
      expect(ui.create).toBeDisabled();
      expect(store.getRowCount("lists")).toBe(2);
    });
  });

  describe("when a list is renamed", () => {
    it("writes the new name on Enter", async () => {
      const { store, user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      await user.click(ui.name("Garden"));
      await user.clear(ui.rename("Garden"));
      await user.type(ui.rename("Garden"), " Shed {Enter}");
      expect(store.getCell("lists", "garden", "name")).toBe("Shed");
    });

    // Escape belongs to the input first: the sheet's own handler would close the whole picker.
    it("keeps the old name on Escape, without closing the sheet", async () => {
      const { store, onClose, user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      await user.click(ui.name("Garden"));
      await user.type(ui.rename("Garden"), "Shed{Escape}");
      expect(store.getCell("lists", "garden", "name")).toBe("Garden");
      expect(onClose).not.toHaveBeenCalled();
    });

    // The default list has no row until the migration writes one, and a rename is user intent.
    it("creates the default list's row when renaming it", async () => {
      const { store, user } = setup({
        lists: { garden: { name: "Garden", position: "a0", createdAt: 2 } },
        items: { a: item({ listId: DEFAULT_LIST_ID, name: "Milk" }) },
      });
      await user.click(ui.edit);
      await user.click(ui.name("Coche"));
      await user.clear(ui.rename("Coche"));
      await user.type(ui.rename("Coche"), "Kitchen{Enter}");
      expect(store.getCell("lists", DEFAULT_LIST_ID, "name")).toBe("Kitchen");
    });
  });

  describe("when a list is deleted", () => {
    it("confirms first, naming the list and everything that goes with it", async () => {
      const { store, user } = setup({
        lists: twoLists,
        items: {
          a: item({ listId: "garden", name: "Seeds" }),
          b: item({ listId: "garden", name: "Soil", position: "a1", checked: true }),
        },
      });
      await user.click(ui.edit);
      await user.click(ui.del("Garden"));
      const dialog = ui.queryDialog(/^Delete “Garden”\?$/);
      expect(dialog).not.toBeNull();
      // Every item, checked included — that is what the delete destroys.
      expect(dialog).toHaveTextContent("Its 2 items go with it.");
      expect(store.hasRow("lists", "garden")).toBe(true);
    });

    it("removes the list and its items on confirm", async () => {
      const { store, user } = setup({
        lists: twoLists,
        items: {
          a: item({ listId: "garden", name: "Seeds" }),
          b: item({ listId: DEFAULT_LIST_ID, name: "Milk" }),
        },
      });
      await user.click(ui.edit);
      await user.click(ui.del("Garden"));
      await user.click(ui.confirm);
      expect(store.hasRow("lists", "garden")).toBe(false);
      expect(store.getRowIds("items")).toEqual(["b"]);
    });

    it("keeps everything on cancel", async () => {
      const { store, user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      await user.click(ui.del("Garden"));
      await user.click(ui.cancel);
      expect(store.hasRow("lists", "garden")).toBe(true);
      expect(ui.queryDialog(/^Delete/)).toBeNull();
    });

    it("switches away when the deleted list was the active one", async () => {
      const { onSelect, user } = setup({ lists: twoLists, activeId: "garden" });
      await user.click(ui.edit);
      await user.click(ui.del("Garden"));
      await user.click(ui.confirm);
      expect(onSelect).toHaveBeenCalledWith(DEFAULT_LIST_ID);
    });

    // There is no zero-lists state, so the rule is enforced in the UI as well as in the store.
    it("is unavailable for the last remaining list", async () => {
      const { user } = setup({ lists: { [DEFAULT_LIST_ID]: { createdAt: 1 } } });
      await user.click(ui.edit);
      expect(ui.del("Coche")).toBeDisabled();
    });
  });

  describe("when it closes", () => {
    it("returns focus to the opener", () => {
      const opener = trigger();
      opener.focus();
      const { unmount } = setup({ lists: twoLists });
      unmount();
      expect(opener).toHaveFocus();
    });

    // A switch remounts the header, so the opener node is gone by the time focus returns — without
    // the fallback, focus drops to <body> and a keyboard user has to Tab in from the top.
    it("falls back to the trigger that replaced a detached opener", () => {
      const opener = trigger();
      opener.focus();
      const { unmount } = setup({ lists: twoLists });
      opener.remove();
      const replacement = trigger();
      unmount();
      expect(replacement).toHaveFocus();
    });
  });

  describe("when Escape is pressed", () => {
    it("closes the sheet", async () => {
      const { onClose, user } = setup({ lists: twoLists });
      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
