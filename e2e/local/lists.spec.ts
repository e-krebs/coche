import {
  test,
  expect,
  gotoApp,
  addItem,
  createList,
  field,
  pickList,
  switchList,
  uncheckedNames,
} from "./fixtures";

test.describe("lists", () => {
  // One store holds every list, so isolation is a filter rather than a boundary — the thing worth
  // asserting end to end.
  test("each list keeps its own items across a switch and a reload", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Milk");
    await expect(switchList(page)).toHaveText("Coche"); // nameless default list

    await createList(page, "Hardware");
    await expect.poll(async () => uncheckedNames(page)).toEqual([]);
    await addItem(page, "Nails");

    await pickList(page, "Coche");
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Milk"]);

    await page.reload();
    await expect(switchList(page)).toHaveText("Coche"); // the last-used list is remembered
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Milk"]);

    await pickList(page, "Hardware");
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Nails"]);
  });

  test("renaming a list retitles the header", async ({ page }) => {
    await gotoApp(page);
    await createList(page, "Garden");

    await switchList(page).click();
    await page.getByRole("button", { name: "Edit lists" }).click();
    await page.getByRole("button", { name: "Garden", exact: true }).click();
    await page.getByLabel("Rename Garden").fill("Shed");
    await page.getByLabel("Rename Garden").press("Enter");
    await page.getByRole("button", { name: "Done" }).click();
    await page.keyboard.press("Escape");

    await expect(switchList(page)).toHaveText("Shed");
  });

  test("deleting a list takes its items and lands on another", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Milk");
    await createList(page, "Hardware");
    await addItem(page, "Nails");
    await field(page).blur();

    await switchList(page).click();
    await page.getByRole("button", { name: "Edit lists" }).click();
    await page.getByRole("button", { name: "Delete Hardware" }).click();

    // Confirmed, not undone: the count is every item the delete destroys.
    const dialog = page.getByRole("dialog", { name: /^Delete “Hardware”\?$/ });
    await expect(dialog).toContainText("Its 1 item goes with it.");
    await dialog.getByRole("button", { name: "Delete" }).click();

    // The sheet stays open on delete — you may want to delete another — so assert in place: the row
    // is gone, and the last remaining list can't follow it.
    await expect(page.getByRole("button", { name: "Delete Hardware" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete Coche" })).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(switchList(page)).toHaveText("Coche");
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Milk"]);
  });
});
