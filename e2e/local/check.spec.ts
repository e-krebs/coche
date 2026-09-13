import {
  test,
  expect,
  gotoApp,
  addItem,
  checkbox,
  field,
  fillScreen,
  row,
  scrollToSettledBottom,
  uncheckedNames,
} from "./fixtures";

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

  // The focus reclaim used to reveal its target, and unchecking puts the row back above the section
  // it came from — so the page scrolled to the top and away from the finger. Two items stay checked
  // so the section survives the uncheck: losing it shrinks the document and clamps scroll, which
  // would read as a partial failure here. The uncheck has to be a real click, because `fillScreen`
  // ends on Enter and only a pointer press clears Blink's keyboard modality — the gate this relies on.
  test("unchecking leaves the page where it was", async ({ page }) => {
    await gotoApp(page);
    await fillScreen(page);
    await field(page).blur();
    // By rendered order, not by name: `fillScreen` submits without waiting, so two rows can be minted
    // from the same last position and land in an order the names don't predict. The first row is the
    // one whose slot is at the top of the list, a viewport away from the section it is checked into.
    const [first, second] = await uncheckedNames(page);
    await checkbox(page, first).click();
    await checkbox(page, second).click();
    await checkedToggle(page).click();

    await scrollToSettledBottom(page);
    await expect(checkbox(page, first)).toBeInViewport({ ratio: 1 });
    const geometry = async () =>
      page.evaluate(() => ({
        y: window.scrollY,
        max: document.documentElement.scrollHeight - window.innerHeight,
      }));
    const before = await geometry();

    await checkbox(page, first).click();
    // The row reaching the unchecked list is the mutation landing, and it has to be waited for: the
    // click focuses the button it hit straight away, so `toBeFocused` alone passes against the
    // pre-transition tree and every measurement after it races the reclaim.
    await expect.poll(async () => uncheckedNames(page)).toContain(first);
    await expect(checkbox(page, first)).toBeFocused();

    // The row went back to the top of the unchecked list, and the page did not follow it. The offset
    // itself still gives a little: sitting at the bottom, a checked section one row shorter clamps
    // it, and one row of content crossing the viewport may or may not be compensated by Chrome's
    // scroll anchoring. So the floor is the old offset, clamped to the new document, less a row —
    // two orders away from the jump to 0 this test exists for.
    await expect(row(page, first)).not.toBeInViewport();
    const after = await geometry();
    expect(after.y).toBeGreaterThanOrEqual(Math.min(before.y, after.max) - 48);
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
