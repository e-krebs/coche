import { test, expect, gotoApp, addItem, checkbox } from "./fixtures";

test.describe("multi-tab", () => {
  test("a second tab loads the items the first tab persisted", async ({ context }) => {
    const a = await context.newPage();
    await gotoApp(a);
    await addItem(a, "Milk");
    await addItem(a, "Bread");

    // Reload A to flush TinyBase's async autoSave to IndexedDB before B loads, else B's
    // startAutoLoad races it.
    await a.reload();
    await expect(checkbox(a, "Milk")).toBeVisible();
    await expect(checkbox(a, "Bread")).toBeVisible();

    const b = await context.newPage();
    await gotoApp(b);
    await expect(checkbox(b, "Milk")).toBeVisible();
    await expect(checkbox(b, "Bread")).toBeVisible();
  });
});
