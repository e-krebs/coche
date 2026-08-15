import { test, expect, gotoApp, addItem, checkbox, field, uncheckedNames } from "./fixtures";

const checkedToggle = (page: Parameters<typeof gotoApp>[0]) =>
  page.getByRole("button", { name: /Checked \(\d+\)/ });

test.describe("check", () => {
  test("checking moves an item to the checked section and persists across reload", async ({
    page,
  }) => {
    await gotoApp(page);
    await addItem(page, "Milk");
    await addItem(page, "Bread");
    await field(page).blur(); // a focused add field aria-disables the sortable rows

    await checkbox(page, "Milk").click();

    // Milk leaves the unchecked list and a "Checked (1)" toggle appears.
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Bread"]);
    await expect(checkedToggle(page)).toBeVisible();

    await page.reload();

    // Checked state survives a cold reload from IndexedDB.
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Bread"]);
    await expect(checkedToggle(page)).toBeVisible();
  });

  test("unchecking returns an item to the unchecked list", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Milk");
    await field(page).blur();
    await checkbox(page, "Milk").click();
    await expect(checkedToggle(page)).toBeVisible();

    // The checked rows are inert until the section is expanded.
    await checkedToggle(page).click();
    await checkbox(page, "Milk").click();

    await expect.poll(async () => uncheckedNames(page)).toEqual(["Milk"]);
    await expect(checkedToggle(page)).toHaveCount(0);
  });

  test("clear checked removes only the checked items", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Milk");
    await addItem(page, "Bread");
    await field(page).blur();
    await checkbox(page, "Milk").click();

    await checkedToggle(page).click();
    await page.getByRole("button", { name: "Clear checked" }).click();

    await expect.poll(async () => uncheckedNames(page)).toEqual(["Bread"]);
    await expect(checkedToggle(page)).toHaveCount(0);
  });
});
