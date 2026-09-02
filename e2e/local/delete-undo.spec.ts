import { test, expect, gotoApp, addItem, checkbox, field, uncheckedNames } from "./fixtures";

test.describe("delete + undo", () => {
  test("deleting an item offers an undo that restores it", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Butter");
    await field(page).blur(); // a focused add field disables dnd on the sortable rows

    // The path a finger has besides swiping: tap the name, then the Delete the editor reveals. On a
    // precise pointer the same button is also on the resting row, revealed by hover.
    await page.getByRole("button", { name: "Butter", exact: true }).click();
    await page.getByLabel("Delete Butter").click();
    await expect.poll(async () => uncheckedNames(page)).toEqual([]);

    await page.getByRole("button", { name: "Undo" }).click();

    await expect(checkbox(page, "Butter")).toBeVisible();
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Butter"]);
  });
});
