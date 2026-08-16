import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  radio: (name: string) => screen.getByRole("menuitemradio", { name: new RegExp(`^${name},`) }),
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
  reorder: (name: string) => screen.getByRole("button", { name: `Reorder ${name}` }),
  name: (name: string) => screen.getByRole("button", { name }),
  del: (name: string) => screen.getByRole("button", { name: `Delete ${name}` }),
  get confirm() {
    return screen.getByRole("button", { name: "Delete" });
  },
  get cancel() {
    return screen.getByRole("button", { name: "Cancel" });
  },
  // alertdialog, not dialog — Testing Library matches the exact role, not what it inherits from.
  queryDialog: (name: RegExp) => screen.queryByRole("alertdialog", { name }),
  get sheet() {
    return screen.getByRole("dialog", { name: "Lists" });
  },
};

describe("ListPicker", () => {
  it("names the sheet from its visible heading", () => {
    setup({ lists: twoLists });
    expect(ui.sheet).toHaveAccessibleName("Lists");
  });

  // The toggle swaps the body between a menu and a sortable roster, so the label change alone leaves
  // the state unannounced.
  it("reports edit mode as a pressed toggle", async () => {
    const { user } = setup({ lists: twoLists });
    expect(ui.edit).toHaveAttribute("aria-pressed", "false");
    await user.click(ui.edit);
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
  });

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

  // Creating is a management action, not navigation: switching away or closing would end the session
  // after one list, so the sheet stays put and the field is ready for the next name.
  describe("when a list is created", () => {
    const named = (store: Store, name: string) =>
      store.getRowIds("lists").find((l) => store.getCell("lists", l, "name") === name);

    it("trims the name and stays open, on Enter and on the + button alike", async () => {
      const { store, onSelect, onClose, user } = setup({ lists: twoLists });
      await user.click(ui.edit);

      await user.type(ui.newName, "  Hardware  {Enter}");
      expect(named(store, "Hardware")).toBeDefined();

      await user.type(ui.newName, "Garden");
      await user.click(ui.create);
      expect(named(store, "Garden")).toBeDefined();

      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    // The + button disables itself the moment the field clears, stranding focus on a dead control.
    it("clears the field and keeps focus in it", async () => {
      const { user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      await user.type(ui.newName, "Hardware");
      await user.click(ui.create);
      expect(ui.newName).toHaveValue("");
      expect(ui.newName).toHaveFocus();
    });

    it("rejects a blank name", async () => {
      const { store, user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      await user.type(ui.newName, "   {Enter}");
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
      // Every item, checked included — that is what the delete destroys. Wired as the description, so
      // assistive tech gets it on arrival rather than only if the user reads past the title.
      expect(dialog).toHaveTextContent("Its 2 items go with it.");
      expect(dialog).toHaveAccessibleDescription(/Its 2 items go with it\./);
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

    // Switching remounts the view under the sheet, so closing is deliberate rather than a side effect
    // that reads as a glitch.
    it("switches away and closes when the deleted list was the active one", async () => {
      const { onSelect, onClose, user } = setup({ lists: twoLists, activeId: "garden" });
      await user.click(ui.edit);
      await user.click(ui.del("Garden"));
      await user.click(ui.confirm);
      expect(onSelect).toHaveBeenCalledWith(DEFAULT_LIST_ID);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("stays open when the deleted list was not the active one", async () => {
      const { onSelect, onClose, user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      await user.click(ui.del("Garden"));
      await user.click(ui.confirm);
      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(ui.del("Coche")).toBeDisabled();
    });

    // There is no zero-lists state, so the rule is enforced in the UI as well as in the store.
    it("is unavailable for the last remaining list", async () => {
      const { user } = setup({ lists: { [DEFAULT_LIST_ID]: { createdAt: 1 } } });
      await user.click(ui.edit);
      expect(ui.del("Coche")).toBeDisabled();
    });
  });

  describe("when it closes", () => {
    it("returns focus to the opener", async () => {
      const opener = trigger();
      opener.focus();
      const { unmount } = setup({ lists: twoLists });
      unmount();
      await waitFor(() => {
        expect(opener).toHaveFocus();
      });
    });

    // A switch remounts the header in the same commit that closes the sheet, so the opener is still
    // connected during cleanup and dies right after — hence the deferred restore. Without the
    // fallback, focus lands on <body> and a keyboard user has to Tab in from the top.
    it("falls back to the trigger that replaced the opener the switch destroyed", async () => {
      const opener = trigger();
      opener.focus();
      const { unmount } = setup({ lists: twoLists });
      unmount();
      opener.remove();
      const replacement = trigger();
      await waitFor(() => {
        expect(replacement).toHaveFocus();
      });
    });
  });

  describe("when Escape is pressed", () => {
    it("closes the sheet", async () => {
      const { onClose, user } = setup({ lists: twoLists });
      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledOnce();
    });

    // The nested dialog stops its own keys — otherwise cancelling the confirmation would close the
    // whole picker with it.
    it("cancels a confirmation without closing the sheet", async () => {
      const { store, onClose, user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      await user.click(ui.del("Garden"));
      await user.keyboard("{Escape}");
      expect(ui.queryDialog(/^Delete/)).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(store.hasRow("lists", "garden")).toBe(true);
    });

    // dnd-kit cancels a keyboard drag on Escape; the sheet must not take that as its own cue.
    it("cancels a keyboard reorder without closing the sheet", async () => {
      const { onClose, user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      ui.reorder("Garden").focus();
      await user.keyboard("{ }{ArrowUp}{Escape}");
      expect(onClose).not.toHaveBeenCalled();
    });

    // Closing the sheet would discard the half-typed name with it.
    it("clears a half-typed new list name instead of closing", async () => {
      const { onClose, user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      await user.type(ui.newName, "Hardware{Escape}");
      expect(ui.newName).toHaveValue("");
      expect(onClose).not.toHaveBeenCalled();
    });

    it("closes once the new list name is empty again", async () => {
      const { onClose, user } = setup({ lists: twoLists });
      await user.click(ui.edit);
      await user.type(ui.newName, "Hardware{Escape}{Escape}");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  // The sheet holds every other focusable in the test document, so native Tab would wrap inside it
  // whether or not the trap works. `trigger()` puts a focusable after the sheet in DOM order — the
  // only way an escape has somewhere to land.
  describe("when Tab is pressed", () => {
    it("stays inside the sheet", async () => {
      const { user } = setup({ lists: twoLists });
      const outside = trigger();
      ui.radio("Coche").focus();
      for (let i = 0; i < 10; i++) await user.tab();
      expect(outside).not.toHaveFocus();
      expect(ui.sheet.contains(document.activeElement)).toBe(true);
    });

    // The rename input owns Enter and Escape, but Tab has to reach the sheet's trap.
    it("stays inside the sheet while renaming a list", async () => {
      const { user } = setup({ lists: twoLists });
      const outside = trigger();
      await user.click(ui.edit);
      await user.click(ui.name("Garden"));
      for (let i = 0; i < 10; i++) await user.tab();
      expect(outside).not.toHaveFocus();
      expect(ui.sheet.contains(document.activeElement)).toBe(true);
    });
  });
});
