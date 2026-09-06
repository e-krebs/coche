import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createShoppingStore } from "client/store/store";
import { DEFAULT_LIST_ID } from "client/store/schema";
import { ListPanel } from "client/components/ListPanel";
import type { ListSummary } from "client/store/lists";

type Store = ReturnType<typeof createShoppingStore>;
type Tables = Parameters<Store["setTables"]>[0];
type Wrapper = "sheet" | "sidebar";

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

/**
 * The panel is controlled from above on `editing` and `confirming`, and its home is a prop — so the
 * harness plays `ListView`. `matchMedia` is absent in jsdom, which is exactly why both homes are
 * reachable here at all.
 */
const setup = ({
  lists = {},
  items = {},
  activeId = DEFAULT_LIST_ID,
  wrapper = "sheet",
  editing = false,
  blocked = false,
}: {
  lists?: Tables["lists"];
  items?: Tables["items"];
  activeId?: string;
  wrapper?: Wrapper;
  editing?: boolean;
  blocked?: boolean;
} = {}) => {
  const store = createShoppingStore();
  store.setTables({ lists, items });
  const onSelect = vi.fn();
  const onDismiss = vi.fn();
  const onEditingChange = vi.fn();

  const Harness = ({ wrapper: home }: { wrapper: Wrapper }) => {
    const [mode, setMode] = useState(editing);
    const [confirming, setConfirming] = useState<ListSummary | null>(null);
    return (
      <Provider store={store}>
        <ListPanel
          activeId={activeId}
          wrapper={home}
          editing={mode}
          blocked={blocked}
          confirming={confirming}
          onSelect={onSelect}
          onEditingChange={(next) => {
            onEditingChange(next);
            setMode(next);
          }}
          onConfirming={setConfirming}
          // Dismissing takes the panel out of edit mode too, as `ListView`'s one mode does: there is
          // no state in which it is dismissed and still editing.
          onDismiss={() => {
            onDismiss();
            setMode(false);
          }}
        />
      </Provider>
    );
  };

  const { unmount, rerender } = render(<Harness wrapper={wrapper} />);
  return {
    store,
    onSelect,
    onDismiss,
    onEditingChange,
    unmount,
    swap: (home: Wrapper) => {
      rerender(<Harness wrapper={home} />);
    },
    user: userEvent.setup(),
  };
};

// The global cleanup only unmounts React trees, so a stand-in trigger left in `document.body` by an
// earlier case outlives it — and a focus restore's `document.querySelector` would find that one
// rather than the panel's own. Call it before rendering, never after: it would take a live node out
// from under React.
const dropStrayTriggers = () => {
  document.querySelectorAll("[data-list-trigger]").forEach((el) => {
    el.remove();
  });
};

// The app has exactly one header trigger. Sheet cases only: beside the list the panel renders a real
// one of its own.
const trigger = () => {
  dropStrayTriggers();
  const el = document.createElement("button");
  el.dataset.listTrigger = "";
  document.body.append(el);
  return el;
};

const twoLists: Tables["lists"] = {
  [DEFAULT_LIST_ID]: { createdAt: 1 },
  garden: { name: "Garden", position: "a0", createdAt: 2 },
};

// Query handles grouped so tests never call `screen.*` inline; parametrized by list name, and by
// home where the two differ — the pick rows are a menu in the sheet and plain navigation beside the
// list.
const ui = {
  pick: (wrapper: Wrapper, name: string) =>
    screen.getByRole(wrapper === "sheet" ? "menuitemradio" : "button", {
      name: new RegExp(`^${name},`),
    }),
  get edit() {
    return screen.getByRole("button", { name: "Edit lists" });
  },
  get done() {
    return screen.getByRole("button", { name: "Done" });
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
  querySheet: () => screen.queryByRole("dialog", { name: "Lists" }),
  get sidebar() {
    return screen.getByRole("navigation", { name: "Lists" });
  },
  // What a modal in front of the panel turns `inert`: the sheet's panel rather than its full-screen
  // dialog wrapper, and the sidebar's `nav` itself.
  surface: (wrapper: Wrapper) => {
    const el =
      wrapper === "sheet"
        ? document.querySelector<HTMLElement>("[data-sheet]")
        : screen.getByRole("navigation", { name: "Lists" });
    if (!el) throw new Error("No panel surface");
    return el;
  },
  // Scoped to the panel: the stand-in trigger the sheet's focus cases leave in `document.body`
  // outlives them, since the global cleanup only unmounts React trees.
  triggersIn: (root: HTMLElement) => root.querySelectorAll("[data-list-trigger]"),
  // Matched by attribute, not role: dnd-kit renders its own role="status" region alongside the
  // sortable rows, so a role lookup is ambiguous in edit mode.
  get announcer() {
    const el = document.querySelector<HTMLElement>("[data-lists-announcer]");
    if (!el) throw new Error("No announcer region");
    return el;
  },
};

describe.each(["sheet", "sidebar"] as const)("ListPanel in the %s", (wrapper) => {
  // The label is the state, so it carries the mode change on its own. No aria-pressed alongside it:
  // pairing a changing label with a pressed state announces "Done, toggle button, pressed".
  it("renames the edit toggle rather than marking it pressed", async () => {
    const { user, onEditingChange } = setup({ lists: twoLists, wrapper });
    expect(ui.edit).not.toHaveAttribute("aria-pressed");
    await user.click(ui.edit);
    expect(onEditingChange).toHaveBeenCalledWith(true);
    expect(ui.done).toBeInTheDocument();
  });

  // Beside the list the relabelled toggle is the only visual signal that the panel became an editor
  // — no dialog boundary, no focus move — so the flip is spoken at both widths.
  it("announces the flip into edit mode and back out of it", async () => {
    const { user } = setup({ lists: twoLists, wrapper });
    await user.click(ui.edit);
    expect(ui.announcer).toHaveTextContent("Editing lists.");
    await user.click(ui.done);
    expect(ui.announcer).toHaveTextContent("Done editing lists.");
  });

  // The nameless default list shows the app title, and each row its unchecked count only.
  it("names the default list and counts what is left to do", () => {
    setup({
      lists: twoLists,
      items: {
        a: item({ listId: DEFAULT_LIST_ID, name: "Milk" }),
        b: item({ listId: DEFAULT_LIST_ID, name: "Eggs", position: "a1", checked: true }),
      },
      wrapper,
    });
    expect(ui.pick(wrapper, "Coche")).toHaveAccessibleName("Coche, 1 item");
    expect(ui.pick(wrapper, "Garden")).toHaveAccessibleName("Garden, 0 items");
  });

  // A dialog in front of the panel promises the panel is unreachable; `inert` is what delivers it,
  // at both widths — above `lg` nothing else is doing that job.
  it("puts its own controls out of reach while a modal is in front", () => {
    setup({ lists: twoLists, wrapper, blocked: true });
    expect(ui.surface(wrapper)).toHaveAttribute("inert");
  });

  it("reports the list that was picked", async () => {
    const { onSelect, user } = setup({ lists: twoLists, wrapper });
    await user.click(ui.pick(wrapper, "Garden"));
    expect(onSelect).toHaveBeenCalledWith("garden");
  });

  describe("when a list is created", () => {
    it("adds it, trimmed, without leaving edit mode", async () => {
      const { store, onDismiss, user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.type(ui.newName, "  Hardware  {Enter}");
      const created = store
        .getRowIds("lists")
        .find((id) => store.getCell("lists", id, "name") === "Hardware");
      expect(created).toBeDefined();
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it("clears the field and puts focus back in it", async () => {
      const { user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.type(ui.newName, "Hardware");
      await user.click(ui.create);
      expect(ui.newName).toHaveValue("");
      expect(ui.newName).toHaveFocus();
    });

    it("rejects a blank name", async () => {
      const { store, user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.type(ui.newName, "   {Enter}");
      expect(ui.create).toBeDisabled();
      expect(store.getRowCount("lists")).toBe(2);
    });
  });

  describe("when a list is renamed", () => {
    it("writes the new name on Enter", async () => {
      const { store, user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.click(ui.name("Garden"));
      await user.clear(ui.rename("Garden"));
      await user.type(ui.rename("Garden"), " Shed {Enter}");
      expect(store.getCell("lists", "garden", "name")).toBe("Shed");
    });

    // Escape belongs to the input first: the panel's own handler would dismiss it.
    it("keeps the old name on Escape, without dismissing the panel", async () => {
      const { store, onDismiss, user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.click(ui.name("Garden"));
      await user.type(ui.rename("Garden"), "Shed{Escape}");
      expect(store.getCell("lists", "garden", "name")).toBe("Garden");
      expect(onDismiss).not.toHaveBeenCalled();
    });

    // The default list has no row until the migration writes one, and a rename is user intent.
    it("creates the default list's row when renaming it", async () => {
      const { store, user } = setup({
        lists: { garden: { name: "Garden", position: "a0", createdAt: 2 } },
        items: { a: item({ listId: DEFAULT_LIST_ID, name: "Milk" }) },
        wrapper,
        editing: true,
      });
      await user.click(ui.name("Coche"));
      await user.clear(ui.rename("Coche"));
      await user.type(ui.rename("Coche"), "Kitchen{Enter}");
      expect(store.getCell("lists", DEFAULT_LIST_ID, "name")).toBe("Kitchen");
    });

    // The field vanishing takes focus with it, and beside the list nothing behind is inert to catch
    // it — so tab order would restart from the top of the document.
    it("puts focus back on the row when the field closes", async () => {
      const { user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.click(ui.name("Garden"));
      await user.type(ui.rename("Garden"), "Shed{Escape}");
      expect(ui.name("Garden")).toHaveFocus();
    });

    // A click on dead space is a commit like any other. Only a field that has *gone* — taken out by
    // a change of home — must not commit, and one frame is what tells the two apart.
    it("commits a rename blurred to nowhere, and keeps the field usable", async () => {
      const { store, user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.click(ui.name("Garden"));
      await user.clear(ui.rename("Garden"));
      await user.type(ui.rename("Garden"), "Shed");
      ui.rename("Garden").blur();
      await waitFor(() => {
        expect(store.getCell("lists", "garden", "name")).toBe("Shed");
      });
      expect(ui.name("Shed")).toBeInTheDocument();
    });

    // The field's own value would go with the markup; the panel outlives the change of home, so the
    // draft has to live there — and the arriving home must not blur the field, which would commit a
    // name nobody confirmed.
    it("carries a rename in progress across a change of home", async () => {
      const { store, swap, user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.click(ui.name("Garden"));
      await user.clear(ui.rename("Garden"));
      await user.type(ui.rename("Garden"), "Shed");
      swap(wrapper === "sheet" ? "sidebar" : "sheet");
      expect(ui.rename("Garden")).toHaveValue("Shed");
      expect(store.getCell("lists", "garden", "name")).toBe("Garden");
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
        wrapper,
        editing: true,
      });
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
        wrapper,
        editing: true,
      });
      await user.click(ui.del("Garden"));
      await user.click(ui.confirm);
      expect(store.hasRow("lists", "garden")).toBe(false);
      expect(store.getRowIds("items")).toEqual(["b"]);
    });

    it("keeps everything on cancel", async () => {
      const { store, user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.click(ui.del("Garden"));
      await user.click(ui.cancel);
      expect(store.hasRow("lists", "garden")).toBe(true);
      expect(ui.queryDialog(/^Delete/)).toBeNull();
    });

    // Switching remounts the view under the panel, so leaving is deliberate rather than a side
    // effect that reads as a glitch.
    it("switches away and steps out when the deleted list was the active one", async () => {
      const { onSelect, onDismiss, user } = setup({
        lists: twoLists,
        activeId: "garden",
        wrapper,
        editing: true,
      });
      await user.click(ui.del("Garden"));
      await user.click(ui.confirm);
      expect(onSelect).toHaveBeenCalledWith(DEFAULT_LIST_ID);
      expect(onDismiss).toHaveBeenCalledOnce();
    });

    // The row simply goes; nothing else says it did.
    it("announces the list it removed", async () => {
      const { user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.click(ui.del("Garden"));
      await user.click(ui.confirm);
      expect(ui.announcer).toHaveTextContent("Deleted the list “Garden”.");
    });

    it("stays put when the deleted list was not the active one", async () => {
      const { onSelect, onDismiss, user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.click(ui.del("Garden"));
      await user.click(ui.confirm);
      expect(onSelect).not.toHaveBeenCalled();
      expect(onDismiss).not.toHaveBeenCalled();
      expect(ui.del("Coche")).toBeDisabled();
    });

    // There is no zero-lists state, so the rule is enforced in the UI as well as in the store.
    it("is unavailable for the last remaining list", () => {
      setup({ lists: { [DEFAULT_LIST_ID]: { createdAt: 1 } }, wrapper, editing: true });
      expect(ui.del("Coche")).toBeDisabled();
    });
  });

  describe("when Escape is pressed", () => {
    it("steps the panel out of its current job", async () => {
      const { onDismiss, user } = setup({ lists: twoLists, wrapper });
      ui.pick(wrapper, "Coche").focus();
      await user.keyboard("{Escape}");
      expect(onDismiss).toHaveBeenCalledOnce();
    });

    // The nested dialog stops its own keys — otherwise cancelling the confirmation would dismiss the
    // whole panel with it.
    it("cancels a confirmation and goes no further", async () => {
      const { store, onDismiss, user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.click(ui.del("Garden"));
      await user.keyboard("{Escape}");
      expect(ui.queryDialog(/^Delete/)).toBeNull();
      expect(onDismiss).not.toHaveBeenCalled();
      expect(store.hasRow("lists", "garden")).toBe(true);
    });

    // dnd-kit cancels a keyboard drag on Escape; the panel must not take that as its own cue.
    it("cancels a keyboard reorder and goes no further", async () => {
      const { onDismiss, user } = setup({ lists: twoLists, wrapper, editing: true });
      ui.reorder("Garden").focus();
      await user.keyboard("{ }{ArrowUp}{Escape}");
      expect(onDismiss).not.toHaveBeenCalled();
    });

    // Stepping out would discard the half-typed name with it.
    it("clears a half-typed new list name first", async () => {
      const { onDismiss, user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.type(ui.newName, "Hardware{Escape}");
      expect(ui.newName).toHaveValue("");
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it("steps out once the new list name is empty again", async () => {
      const { onDismiss, user } = setup({ lists: twoLists, wrapper, editing: true });
      await user.type(ui.newName, "Hardware{Escape}{Escape}");
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });
});

describe("ListPanel in the sheet", () => {
  it("names itself from its visible heading", () => {
    setup({ lists: twoLists });
    expect(ui.sheet).toHaveAccessibleName("Lists");
  });

  it("closes on the way to the list that was picked", async () => {
    const { onDismiss, user } = setup({ lists: twoLists });
    await user.click(ui.pick("sheet", "Garden"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  // The header trigger holds the anchor at this width; a second one would make the focus fallback
  // ambiguous.
  it("claims no focus anchor of its own", () => {
    setup({ lists: twoLists, editing: true });
    expect(ui.triggersIn(ui.sheet)).toHaveLength(0);
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

  // The sheet holds every other focusable in the test document, so native Tab would wrap inside it
  // whether or not the trap works. `trigger()` puts a focusable after the sheet in DOM order — the
  // only way an escape has somewhere to land.
  describe("when Tab is pressed", () => {
    it("stays inside the sheet", async () => {
      const { user } = setup({ lists: twoLists });
      const outside = trigger();
      ui.pick("sheet", "Coche").focus();
      for (let i = 0; i < 10; i++) await user.tab();
      expect(outside).not.toHaveFocus();
      expect(ui.sheet.contains(document.activeElement)).toBe(true);
    });

    // The rename input owns Enter and Escape, but Tab has to reach the sheet's trap.
    it("stays inside the sheet while renaming a list", async () => {
      const { user } = setup({ lists: twoLists, editing: true });
      const outside = trigger();
      await user.click(ui.name("Garden"));
      for (let i = 0; i < 10; i++) await user.tab();
      expect(outside).not.toHaveFocus();
      expect(ui.sheet.contains(document.activeElement)).toBe(true);
    });
  });
});

describe("ListPanel in the sidebar", () => {
  it("is a landmark rather than a dialog", () => {
    setup({ lists: twoLists, wrapper: "sidebar" });
    expect(ui.sidebar).toHaveAccessibleName("Lists");
    expect(ui.querySheet()).toBeNull();
  });

  // Nothing was destroyed under the reader — the toggle only relabels — so nothing needs rescuing,
  // and a focus move the reader didn't ask for would land them in a row they might rename.
  it("leaves focus on the toggle when edit mode opens in place", async () => {
    const { user } = setup({ lists: twoLists, wrapper: "sidebar" });
    await user.click(ui.edit);
    expect(ui.done).toHaveFocus();
  });

  // No row carries `aria-current` while editing, so the anchor four focus restores aim at moves to
  // the one control edit mode cannot lose. Exactly one, either way.
  it("moves its focus anchor to the toggle while editing", async () => {
    const { user } = setup({ lists: twoLists, wrapper: "sidebar" });
    expect(ui.triggersIn(ui.sidebar)).toHaveLength(1);
    await user.click(ui.edit);
    expect(ui.triggersIn(ui.sidebar)).toHaveLength(1);
    expect(ui.done).toHaveAttribute("data-list-trigger");
  });

  // Leaving edit mode destroys every control but the toggle, and Escape can be pressed from any of
  // them — so a focus that fell to <body> goes back to the anchor rather than restarting tab order.
  it("hands focus back to the anchor when Escape ends the edit session", async () => {
    dropStrayTriggers();
    const { user } = setup({ lists: twoLists, wrapper: "sidebar", editing: true });
    ui.reorder("Garden").focus();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(ui.pick("sidebar", "Coche")).toHaveFocus();
    });
  });

  it("keeps picking to itself, with nothing to close", async () => {
    const { onSelect, onDismiss, user } = setup({ lists: twoLists, wrapper: "sidebar" });
    await user.click(ui.pick("sidebar", "Garden"));
    expect(onSelect).toHaveBeenCalledWith("garden");
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
