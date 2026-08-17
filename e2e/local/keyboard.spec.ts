import { test, expect, gotoApp, addItem, field, row, sheet, switchList } from "./fixtures";

/**
 * The keyboard tier. Everything here needs a real engine: `inert`, sequential focus navigation and
 * `:focus-visible` are all things jsdom either approximates or doesn't compute at all, so the unit
 * tier asserts where focus *lands* and this one asserts what the browser actually does with it.
 */
test.describe("keyboard", () => {
  const seed = async (page: Parameters<typeof gotoApp>[0]) => {
    await gotoApp(page);
    await addItem(page, "Apples");
    await addItem(page, "Bread");
    await field(page).blur();
    await expect(row(page, "Apples")).toHaveAttribute("data-draggable", "true");
  };

  test("a row's own controls keep their keys instead of lifting the row", async ({ page }) => {
    await seed(page);
    await page.locator('button[aria-label="Check off Apples"]').focus();
    await page.keyboard.press("Enter");
    // The item moving to the checked group is the toggle landing; before the activator was wired, the
    // same keypress lifted the row and swallowed the click.
    await expect(page.getByRole("button", { name: /^Checked \(1\)$/ })).toBeVisible();
    await expect(row(page, "Bread")).not.toHaveAttribute("aria-pressed", "true");
  });

  test("delete is reachable without a pointer", async ({ page }) => {
    await seed(page);
    await page.getByRole("button", { name: "Apples", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Rename Apples")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Delete Apples")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator('button[aria-label="Check off Apples"]')).toBeHidden();
  });

  test("Tab stays inside the picker while it is open", async ({ page }) => {
    await seed(page);
    await switchList(page).press("Enter");
    await expect(sheet(page)).toBeVisible();
    // 10 presses is well past the sheet's control count, so an escape would have happened by now.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null),
    ).toBe(true);
  });

  test("the list behind the picker is inert", async ({ page }) => {
    await seed(page);
    await switchList(page).click();
    await expect(sheet(page)).toBeVisible();
    expect(
      await page.evaluate(() => {
        const el = document.querySelector('button[aria-label="Check off Apples"]');
        return el?.closest("[inert]") !== null;
      }),
    ).toBe(true);
  });

  test("closing the picker returns focus to the title that opened it", async ({ page }) => {
    await seed(page);
    await switchList(page).press("Enter");
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    await expect(switchList(page)).toBeFocused();
  });

  // Space-then-Escape only: no arrow, so none of the KeyboardSensor timing that keeps arrow-driven
  // reorder out of this tier (see reorder.spec.ts).
  test("Escape cancels a lift without closing the sheet", async ({ page }) => {
    await seed(page);
    await switchList(page).click();
    await page.getByRole("button", { name: "Edit lists" }).click();
    await page.getByRole("button", { name: /^Reorder / }).focus();
    await page.keyboard.press(" ");
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeVisible();
  });

  // The ring is a box-shadow from Tailwind's `ring-*`, and :focus-visible only matches on a keyboard
  // focus — neither is computable in jsdom, which is why this assertion lives here.
  test("every keyboard-focused control paints a focus ring", async ({ page }) => {
    await seed(page);
    const painted = async () =>
      page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "";
        const s = getComputedStyle(el);
        return `${s.boxShadow}|${s.outlineStyle}`;
      });

    await switchList(page).press("Tab");
    await switchList(page).focus();
    await page.keyboard.press("Tab");
    expect(await painted()).not.toBe("none|none");

    await page.locator('button[aria-label="Check off Apples"]').focus();
    await page.keyboard.press("Tab");
    expect(await painted()).not.toBe("none|none");
  });
});
