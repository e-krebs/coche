import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageDialog } from "client/components/LanguageDialog";
import type { Locale } from "client/i18n";

// No store Provider: the dialog only reads the locale it is handed and translates through the
// localStorage mirror, which needs nothing above it.
const setup = ({ locale = "en" }: { locale?: Locale } = {}) => {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const { unmount } = render(
    <LanguageDialog locale={locale} onSelect={onSelect} onClose={onClose} />,
  );
  return { onSelect, onClose, unmount, user: userEvent.setup() };
};

// The real opener is a Clerk menu item that unmounts with its popover; the header trigger is what the
// restore falls back to. Both are stand-ins here — see the same helper in ListPicker.test.tsx.
const trigger = () => {
  document.querySelectorAll("[data-list-trigger]").forEach((el) => {
    el.remove();
  });
  const el = document.createElement("button");
  el.dataset.listTrigger = "";
  document.body.append(el);
  return el;
};

const opener = () => {
  const el = document.createElement("button");
  document.body.append(el);
  el.focus();
  return el;
};

const ui = {
  radio: (label: string) => screen.getByRole("radio", { name: label }),
  get dialog() {
    return screen.getByRole("dialog", { name: "Language" });
  },
};

describe("LanguageDialog", () => {
  it("reports the active locale as the checked radio", () => {
    setup({ locale: "fr" });
    expect(ui.radio("Français")).toHaveAttribute("aria-checked", "true");
    expect(ui.radio("English")).toHaveAttribute("aria-checked", "false");
  });

  it("selects a locale on click", async () => {
    const { onSelect, user } = setup();
    await user.click(ui.radio("Français"));
    expect(onSelect).toHaveBeenCalledWith("fr");
  });

  it("focuses the active radio on open", () => {
    setup({ locale: "fr" });
    expect(ui.radio("Français")).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const { onClose, user } = setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  describe("when arrows rove the radios", () => {
    // Roving without selecting: a radiogroup would normally select on arrow, but choosing a language
    // is what closes the dialog, so the first arrow press would end the interaction.
    it("moves focus without changing the selection", async () => {
      const { onSelect, user } = setup();
      await user.keyboard("{ArrowDown}");
      expect(ui.radio("Français")).toHaveFocus();
      expect(ui.radio("Français")).toHaveAttribute("aria-checked", "false");
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("wraps around both ends", async () => {
      const { user } = setup();
      await user.keyboard("{ArrowUp}");
      expect(ui.radio("Français")).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(ui.radio("English")).toHaveFocus();
    });
  });

  describe("when Tab is pressed", () => {
    it("stays inside the dialog", async () => {
      const { user } = setup();
      const outside = trigger();
      for (let i = 0; i < 5; i++) await user.tab();
      expect(outside).not.toHaveFocus();
      expect(ui.dialog.contains(document.activeElement)).toBe(true);
    });
  });

  describe("when it closes", () => {
    it("returns focus to the opener", async () => {
      const button = opener();
      const { unmount } = setup();
      unmount();
      await waitFor(() => {
        expect(button).toHaveFocus();
      });
    });

    // The Clerk menu item that opened it is gone by then, so the captured node is detached and the
    // fallback is the only way focus lands on a control rather than <body>.
    it("falls back to the header trigger when the opener is destroyed", async () => {
      const button = opener();
      const { unmount } = setup();
      unmount();
      button.remove();
      const fallback = trigger();
      await waitFor(() => {
        expect(fallback).toHaveFocus();
      });
    });
  });
});
