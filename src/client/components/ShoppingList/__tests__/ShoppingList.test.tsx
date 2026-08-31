import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  get main() {
    return screen.getByRole("main");
  },
  // Matched by attribute, not role: dnd-kit renders its own role="status" region alongside the
  // sortable list, so a role lookup is ambiguous whenever there are unchecked items.
  get status() {
    const el = document.querySelector<HTMLElement>("[data-announcer]");
    if (!el) throw new Error("No announcer region");
    return el;
  },
  results: (name: string) => screen.getByRole("list", { name }),
  /** dnd-kit's own live region, which it mounts inside the DndContext and names by id. */
  get dndLiveRegion() {
    const el = document.querySelector<HTMLElement>('[id^="DndLiveRegion"]');
    if (!el) throw new Error("No dnd-kit live region");
    return el;
  },
  row: (name: string) => {
    const el = ui.checkoff(name).closest("li");
    if (!el) throw new Error(`No row element for "${name}"`);
    return el;
  },
  get checkedHeading() {
    return screen.getByRole("heading", { level: 2, name: /Checked \(\d+\)/ });
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

  // One region, mounted from the start and only ever swapping text: a region that arrives with its
  // content in the same commit is the case screen readers routinely miss.
  describe("the status region", () => {
    it("exists and is empty before anything happens", () => {
      setup();
      expect(ui.status).toHaveTextContent("");
    });

    it("keeps the same node while its text changes", async () => {
      const { user } = setup();
      const before = ui.status;
      await user.type(ui.field, "Milk{Enter}");
      await user.click(ui.name("Milk"));
      await user.click(ui.del("Milk"));
      expect(ui.status).toBe(before);
      expect(ui.status).toHaveTextContent("Deleted “Milk”. Undo is available.");
    });

    // Focus lands on the neighbour, so nothing else says the row went or that Undo exists.
    it("announces a delete and the undo window", async () => {
      const { user } = setup();
      await user.type(ui.field, "Milk{Enter}");
      await user.type(ui.field, "Bread{Enter}");
      await user.click(ui.name("Milk"));
      await user.click(ui.del("Milk"));
      expect(ui.status).toHaveTextContent("Deleted “Milk”. Undo is available.");
    });

    it("names the results list with its match count instead of announcing every keystroke", async () => {
      const { user } = setup();
      await user.type(ui.field, "Milk{Enter}");
      await user.type(ui.field, "Mango{Enter}");
      await user.type(ui.field, "m");
      expect(ui.results("2 matches")).toBeInTheDocument();
      expect(ui.status).toHaveTextContent("");
    });
  });

  // dnd-kit's defaults are hardcoded English and interpolate the opaque TinyBase row id.
  describe("keyboard reorder announcements", () => {
    it("names the item and its position rather than its row id", async () => {
      const { user } = setup();
      await user.type(ui.field, "Milk{Enter}");
      await user.type(ui.field, "Bread{Enter}");
      ui.field.blur();
      // A focused add field disables dnd, and re-enabling is a state update — the row is only a
      // focusable drag target once that has landed.
      await waitFor(() => {
        expect(ui.row("Milk")).toHaveAttribute("tabindex", "0");
      });
      ui.row("Milk").focus();
      await user.keyboard(" ");
      await waitFor(() => {
        expect(ui.dndLiveRegion).toHaveTextContent(/Milk/);
      });
      expect(ui.dndLiveRegion).not.toHaveTextContent(/draggable item/);
      // Release the lift: an abandoned drag leaves dnd-kit holding document-level listeners, which
      // breaks whichever test runs next.
      await user.keyboard("{Escape}");
    });
  });

  describe("landmarks and headings", () => {
    it("puts the items in a main landmark, leaving the header its banner role", () => {
      setup();
      expect(ui.main).toBeInTheDocument();
      expect(ui.main).not.toContainElement(ui.switchList);
    });

    it("heads the checked group with an h2 under the list's h1", async () => {
      const { user } = setup();
      await user.type(ui.field, "Milk{Enter}");
      await user.click(ui.checkoff("Milk"));
      expect(ui.listTitle).toHaveAccessibleName("Coche");
      expect(ui.checkedHeading).toBeInTheDocument();
    });

    it("points the checked disclosure at the panel it expands", async () => {
      const { user } = setup();
      await user.type(ui.field, "Milk{Enter}");
      await user.click(ui.checkoff("Milk"));
      expect(ui.checkedToggle).toHaveAttribute("aria-expanded", "false");
      const panelId = ui.checkedToggle.getAttribute("aria-controls");
      expect(panelId).toBeTruthy();
      expect(document.getElementById(panelId ?? "")).toBeInTheDocument();
      await user.click(ui.checkedToggle);
      expect(ui.checkedToggle).toHaveAttribute("aria-expanded", "true");
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

  // The row unmounts into the checked section, destroying the button that was just pressed — the most
  // frequent keyboard action in the app, and the one place focus used to land on <body>.
  describe("when an item is checked off", () => {
    const seedThree = async (user: ReturnType<typeof userEvent.setup>) => {
      const f = ui.field;
      await user.type(f, "Milk{Enter}");
      await user.type(f, "Bread{Enter}");
      await user.type(f, "Eggs{Enter}");
    };

    // The next row slides into the vacated slot, so focus doesn't move on screen and Space walks down.
    it("moves focus to the next unchecked row's check-off button", async () => {
      const { user } = setup();
      await seedThree(user);
      await user.click(ui.checkoff("Bread"));
      await waitFor(() => {
        expect(ui.checkoff("Eggs")).toHaveFocus();
      });
    });

    it("moves focus up when the last unchecked row is checked", async () => {
      const { user } = setup();
      await seedThree(user);
      await user.click(ui.checkoff("Eggs"));
      await waitFor(() => {
        expect(ui.checkoff("Bread")).toHaveFocus();
      });
    });

    // Nothing unchecked is left, and the row's new home is the collapsed section, which is inert.
    it("falls back to the header trigger when no unchecked row remains", async () => {
      const { user } = setup();
      await user.type(ui.field, "Milk{Enter}");
      await user.click(ui.checkoff("Milk"));
      await waitFor(() => {
        expect(ui.switchList).toHaveFocus();
      });
    });

    // The button carrying aria-pressed is gone before the flip can be spoken, and focus lands on a
    // different item — without this the change is inaudible.
    it("announces which item was checked off", async () => {
      const { user } = setup();
      await seedThree(user);
      await user.click(ui.checkoff("Bread"));
      expect(ui.status).toHaveTextContent("Checked off “Bread”.");
    });
  });

  describe("when an item is unchecked", () => {
    // It remounts in the unchecked list, so the item itself is the target — and its refocused button
    // states the change, which is why there is no announcement to match the check-off.
    it("returns focus to the same item", async () => {
      const { user } = setup();
      await user.type(ui.field, "Milk{Enter}");
      await user.click(ui.checkoff("Milk"));
      await user.click(ui.checkedToggle);
      await user.click(ui.checkoff("Milk"));
      await waitFor(() => {
        expect(ui.checkoff("Milk")).toHaveFocus();
      });
    });

    // The region still names the *second* item, so nothing was said for the uncheck in between.
    it("says nothing", async () => {
      const { user } = setup();
      await user.type(ui.field, "Milk{Enter}");
      await user.type(ui.field, "Bread{Enter}");
      await user.click(ui.checkoff("Milk"));
      await user.click(ui.checkoff("Bread"));
      await user.click(ui.checkedToggle);
      await user.click(ui.checkoff("Milk"));
      expect(ui.status).toHaveTextContent("Checked off “Bread”.");
    });
  });

  // The rendered rows are the matches, in their own order, so the walk-down has nothing to walk; and
  // the row survives the toggle, so its own button speaks the change.
  describe("when a search result is checked off", () => {
    it("neither retargets focus nor announces", async () => {
      const { user } = setup();
      const f = ui.field;
      await user.type(f, "Milk{Enter}");
      await user.type(f, "Bread{Enter}");
      await user.type(f, "Breeze{Enter}");
      await user.type(f, "bre");
      await user.click(ui.checkoff("Bread"));
      expect(ui.checkoff("Bread")).toHaveAttribute("aria-pressed", "true");
      expect(ui.status).toHaveTextContent("");
      expect(ui.switchList).not.toHaveFocus();
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

    // The section unmounts with its last checked row, taking the button that was just clicked, so
    // there is no row to fall back to — focus would otherwise land on <body>.
    it("returns focus to the header trigger", async () => {
      const { user } = setup();
      await user.type(ui.field, "Apples{Enter}");
      await user.click(ui.checkoff("Apples"));
      await user.click(ui.checkedToggle);
      await user.click(ui.clearChecked);
      await waitFor(() => {
        expect(ui.switchList).toHaveFocus();
      });
    });
  });

  describe("when the only item is deleted", () => {
    // There is no neighbour to move to, so the same fallback carries focus.
    it("returns focus to the header trigger", async () => {
      const { user } = setup();
      await user.type(ui.field, "Milk{Enter}");
      await user.click(ui.name("Milk"));
      await user.click(ui.del("Milk"));
      await waitFor(() => {
        expect(ui.switchList).toHaveFocus();
      });
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
