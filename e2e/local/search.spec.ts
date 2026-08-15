import { test, expect, gotoApp, addItem, field, uncheckedNames } from "./fixtures";

test.describe("search", () => {
  test("filters the list and shows a no-match message", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Milk");
    await addItem(page, "Bread");
    await addItem(page, "Butter");

    await field(page).fill("bu");
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Butter"]);

    await field(page).fill("zzz");
    await expect(page.getByText("No matches found.")).toBeVisible();

    await field(page).fill("");
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Milk", "Bread", "Butter"]);
  });
});
