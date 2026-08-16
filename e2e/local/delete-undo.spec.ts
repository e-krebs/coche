import { test, expect, gotoApp, addItem, checkbox, field, uncheckedNames } from "./fixtures";

test.describe("delete + undo", () => {
  test("deleting an item offers an undo that restores it", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Butter");
    await field(page).blur(); // a focused add field disables dnd on the sortable rows

    // Delete is revealed only in edit mode: tap the name, then the Delete action.
    await page.getByRole("button", { name: "Butter", exact: true }).click();
    await page.getByLabel("Delete Butter").click();
    await expect.poll(async () => uncheckedNames(page)).toEqual([]);

    await page.getByRole("button", { name: "Undo" }).click();

    await expect(checkbox(page, "Butter")).toBeVisible();
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Butter"]);
  });
});
