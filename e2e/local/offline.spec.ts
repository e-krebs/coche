import {
  test,
  expect,
  gotoApp,
  addItem,
  checkbox,
  uncheckedNames,
  waitForServiceWorker,
} from "./fixtures";

test.describe("offline", () => {
  test.describe("when the app cold-boots with no network", () => {
    test("data persists and the list stays writable", async ({ page, context }) => {
      await gotoApp(page);
      await addItem(page, "Milk");
      await addItem(page, "Bread");

      // An online reload first proves the local write reached IndexedDB.
      await page.reload();
      await expect(checkbox(page, "Milk")).toBeVisible();
      await expect(checkbox(page, "Bread")).toBeVisible();

      await waitForServiceWorker(page);
      await context.setOffline(true);
      await page.reload();

      // Cold boot offline: shell from the SW, list rehydrated from IndexedDB.
      await expect(checkbox(page, "Milk")).toBeVisible();
      await expect(checkbox(page, "Bread")).toBeVisible();

      await addItem(page, "Eggs");
      expect(await uncheckedNames(page)).toEqual(["Milk", "Bread", "Eggs"]);
    });
  });
});
