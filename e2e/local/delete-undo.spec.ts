import { test, expect, gotoApp, addItem, checkbox, field, uncheckedNames } from "./fixtures";

test.describe("delete + undo", () => {
  test("deleting an item offers an undo that restores it", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Butter");
    await field(page).blur(); // a focused add field aria-disables the sortable rows

    // Delete is revealed only in edit mode: tap the name, then the Delete action.
    await page.getByRole("button", { name: "Butter", exact: true }).click();
    // Edit mode aria-disables the row (dnd lock); the Delete onClick still fires, so force past it.
    await page.getByLabel("Delete Butter").click({ force: true });
    await expect.poll(async () => uncheckedNames(page)).toEqual([]);

    await page.getByRole("button", { name: "Undo" }).click();

    await expect(checkbox(page, "Butter")).toBeVisible();
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Butter"]);
  });
});
