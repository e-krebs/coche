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

      // The reload below is of a deep list URL the service worker has never seen — covered by
      // navigateFallback, and the reason this spec is the first one to run after a routing change.
      await expect(page).toHaveURL(/\/lists\/[^/]+$/);

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
