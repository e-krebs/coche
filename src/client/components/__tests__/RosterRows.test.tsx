import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RosterRows } from "client/components/RosterRows";
import { DEFAULT_LIST_ID } from "client/store/schema";
import type { ListSummary } from "client/store/lists";

const list = (id: string, name: string | undefined, count = 0): ListSummary => ({
  id,
  name,
  position: "a0",
  createdAt: 0,
  count,
  total: count,
});

const lists = [list(DEFAULT_LIST_ID, undefined, 3), list("garden", "Garden", 0)];

/**
 * The sidebar and the picker sheet share one row rendering under two role sets, and `matchMedia` is
 * absent in jsdom — so `semantics` is a prop precisely to make both reachable here.
 */
const setup = ({
  semantics,
  activeId = DEFAULT_LIST_ID,
}: {
  semantics: "menu" | "nav";
  activeId?: string;
}) => {
  const onSelect = vi.fn();
  render(
    <RosterRows lists={lists} activeId={activeId} semantics={semantics} onSelect={onSelect} />,
  );
  return { onSelect, user: userEvent.setup() };
};

const ui = {
  radio: (name: string) => screen.getByRole("menuitemradio", { name: new RegExp(`^${name},`) }),
  button: (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) }),
  queryMenu: () => screen.queryByRole("menu"),
  get triggers() {
    return document.querySelectorAll("[data-list-trigger]");
  },
};

describe("RosterRows", () => {
  // The nameless default list renders the app title, and each row shows its unchecked count only —
  // the number you'd act on, so 0 reads as "nothing to do here".
  it("names the default list and counts what is left to do", () => {
    setup({ semantics: "nav" });
    expect(ui.button("Coche")).toHaveAccessibleName("Coche, 3 items");
    expect(ui.button("Garden")).toHaveAccessibleName("Garden, 0 items");
  });

  describe("in the picker sheet", () => {
    // A menu, not a radiogroup: arrows must rove without selecting, since selecting closes the sheet.
    it("is a menu with a roving tabindex", () => {
      setup({ semantics: "menu" });
      expect(ui.queryMenu()).not.toBeNull();
      expect(ui.radio("Coche")).toHaveAttribute("aria-checked", "true");
      expect(ui.radio("Coche")).toHaveAttribute("tabindex", "0");
      expect(ui.radio("Garden")).toHaveAttribute("aria-checked", "false");
      expect(ui.radio("Garden")).toHaveAttribute("tabindex", "-1");
    });

    // The sheet's own trigger holds the attribute at this width; a second one would make the focus
    // fallback ambiguous.
    it("claims no focus anchor", () => {
      setup({ semantics: "menu" });
      expect(ui.triggers).toHaveLength(0);
    });
  });

  describe("in the sidebar", () => {
    // A persistent region is navigation, not a transient menu: ordinary buttons in normal tab order.
    it("drops the menu semantics for aria-current", () => {
      setup({ semantics: "nav" });
      expect(ui.queryMenu()).toBeNull();
      expect(ui.button("Coche")).toHaveAttribute("aria-current", "true");
      expect(ui.button("Coche")).not.toHaveAttribute("aria-checked");
      expect(ui.button("Garden")).not.toHaveAttribute("aria-current");
      expect(ui.button("Garden")).not.toHaveAttribute("tabindex");
    });

    // The control that always exists and always names the active list, which four focus restores
    // fall back to. Exactly one, and on the active row.
    it("carries the focus anchor on the active row alone", () => {
      setup({ semantics: "nav", activeId: "garden" });
      expect(ui.triggers).toHaveLength(1);
      expect(ui.button("Garden")).toHaveAttribute("data-list-trigger");
    });
  });

  it("reports the list that was picked", async () => {
    const { onSelect, user } = setup({ semantics: "nav" });
    await user.click(ui.button("Garden"));
    expect(onSelect).toHaveBeenCalledWith("garden");
  });
});
