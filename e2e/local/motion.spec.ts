import { test, expect, gotoApp, addItem, checkbox, switchList, sheet } from "./fixtures";

/**
 * Reduced motion is CSS plus one `startViewTransition` bypass, so jsdom computes none of it. Emulated
 * per-test rather than in a second Playwright project: one `emulateMedia` call needs no config, and
 * `fullyParallel` still applies.
 */
test.describe("reduced motion", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("the picker sheet does not animate in", async ({ page }) => {
    await gotoApp(page);
    await switchList(page).click();
    await expect(sheet(page)).toBeVisible();
    const panel = sheet(page).locator(".animate-sheet-in");
    expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });

  test("the checked fold does not transition", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Milk");
    await checkbox(page, "Milk").click();
    const fold = page.locator("[data-checked-list]").locator("xpath=../..");
    expect(await fold.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe("none");
  });

  // The View Transitions wrapper is skipped entirely under reduced motion, so the mutation has to
  // still land — that bypass is the one behavioural branch here, not just a style. The after-callback
  // it carries goes with it, so the focus restore has to survive the same branch.
  test("checking an item still updates the list and moves focus", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Bread");
    await addItem(page, "Cheese");
    await checkbox(page, "Bread").focus();
    await page.keyboard.press(" ");
    await expect(page.getByRole("button", { name: /^Checked \(1\)$/ })).toBeVisible();
    await expect(checkbox(page, "Cheese")).toBeFocused();
  });
});
