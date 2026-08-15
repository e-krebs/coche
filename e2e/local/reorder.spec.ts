import {
  test,
  expect,
  gotoApp,
  addItem,
  uncheckedNames,
  row,
  field,
  waitForDragShift,
} from "./fixtures";

const seed = async (page: Parameters<typeof gotoApp>[0]) => {
  await gotoApp(page);
  await addItem(page, "Apples");
  await addItem(page, "Bread");
  await addItem(page, "Cream");
  // Adding leaves focus in the add field, which disables dnd — blur it and confirm dnd re-enables.
  await field(page).blur();
  await expect(row(page, "Apples")).not.toHaveAttribute("aria-disabled", "true");
};

test.describe("reorder", () => {
  // Keyboard reorder isn't e2e-tested: same commitReorder + persistence path, and KeyboardSensor
  // arrow timing is flaky. Unit-covered.
  test("pointer drag reorder persists across reload", async ({ page }) => {
    await seed(page);

    const src = row(page, "Cream");
    const dst = row(page, "Apples");
    const s = (await src.boundingBox())!;

    // hover() positions the pointer as MouseSensor expects; two moves trip the 6px activation
    // threshold.
    await src.hover();
    await page.mouse.down();
    await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2 + 8);
    await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2 + 16);
    await expect(src).toHaveClass(/opacity-30/);
    await dst.hover();
    await waitForDragShift(page);
    await page.mouse.up();

    await expect.poll(async () => uncheckedNames(page)).toEqual(["Cream", "Apples", "Bread"]);
    await page.reload();
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Cream", "Apples", "Bread"]);
  });
});
