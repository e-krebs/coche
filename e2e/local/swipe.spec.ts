import {
  test,
  expect,
  addItem,
  deletePill,
  field,
  gotoApp,
  row,
  startSwipe,
  uncheckedNames,
} from "./fixtures";

/**
 * Swipe to delete, the coarse pointer's only destructive gesture. No unit tier can reach it: the
 * commit threshold is a third of the row's rendered width, and jsdom has no layout to measure. The
 * events come from `startSwipe`, which builds real `Touch` objects — see its note for why
 * Playwright's `dispatchEvent` cannot.
 *
 * A gesture that never registered leaves the row where it was, which is also what a spring-back
 * looks like. So the cases that assert survival wait for the pill to unmount first — 300ms of
 * spring-back, past the 200ms a commit would have taken to delete the row.
 */
test.describe("swipe to delete", () => {
  test.beforeEach(async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "the phone project is the touch-capable one, and TouchEvent needs it");
    await gotoApp(page);
    await addItem(page, "Butter");
    await field(page).blur();
  });

  test("the row follows the finger, with no transition to lag behind it", async ({ page }) => {
    const swipe = await startSwipe({ page, name: "Butter" });
    await swipe.move({ dx: -40 });

    await expect.poll(async () => swipe.transform()).toBe("translateX(-40px)");
    expect(await swipe.transition()).toBe("");
  });

  test("the pill grows behind the row, short of its trailing edge", async ({ page }) => {
    const swipe = await startSwipe({ page, name: "Butter" });
    await swipe.move({ dx: -40 });

    const pill = deletePill(page, "Butter");
    await expect(pill).toHaveCSS("width", "16px"); // the 24px inset the row keeps at its right
    await expect(pill).toHaveCSS("transition-property", "background-color");
  });

  test("the pill arms once the finger passes a third of the row", async ({ page }) => {
    const swipe = await startSwipe({ page, name: "Butter" });
    const pill = deletePill(page, "Butter");

    await swipe.move({ dx: -(swipe.threshold - 10) });
    await expect(pill).not.toHaveAttribute("data-reached");

    await swipe.move({ dx: -(swipe.threshold + 10) });
    await expect(pill).toHaveAttribute("data-reached", "true");
  });

  test("a release short of the threshold springs the row back", async ({ page }) => {
    const swipe = await startSwipe({ page, name: "Butter" });
    await swipe.move({ dx: -(swipe.threshold - 20) });
    await swipe.release();

    await expect.poll(async () => swipe.transform()).toBe("");
    expect(await swipe.transition()).toBe("transform 0.3s cubic-bezier(0.34, 1.15, 0.64, 1)");
    await expect(deletePill(page, "Butter")).toHaveCount(0);
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Butter"]);
  });

  test("a release past the threshold deletes the row and offers an undo", async ({ page }) => {
    const swipe = await startSwipe({ page, name: "Butter" });
    await swipe.move({ dx: -(swipe.threshold + 20) });
    await swipe.release();

    await expect.poll(async () => uncheckedNames(page)).toEqual([]);
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  test("a system interruption abandons the swipe instead of deleting", async ({ page }) => {
    const swipe = await startSwipe({ page, name: "Butter" });
    await swipe.move({ dx: -(swipe.threshold + 20) });
    await swipe.interrupt();

    await expect(deletePill(page, "Butter")).toHaveCount(0);
    await expect(row(page, "Butter")).toBeVisible();
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Butter"]);
  });

  test("a second finger abandons the swipe, and the release that follows deletes nothing", async ({
    page,
  }) => {
    const swipe = await startSwipe({ page, name: "Butter" });
    await swipe.move({ dx: -(swipe.threshold + 20) });
    await swipe.secondFinger();
    await swipe.release();

    await expect(deletePill(page, "Butter")).toHaveCount(0);
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Butter"]);
  });

  // The axis lock is why touchmove is non-passive rather than `touch-action: pan-y`: a vertical drag
  // has to keep scrolling the page. It locks for the whole gesture, so the horizontal move below
  // must move nothing either.
  test("a vertical drag never becomes a swipe", async ({ page }) => {
    const swipe = await startSwipe({ page, name: "Butter" });
    await swipe.move({ dy: 40 });
    await swipe.move({ dy: 40, dx: -200 });

    expect(await swipe.transform()).toBe("");
    await expect(deletePill(page, "Butter")).toHaveCount(0);
  });
});
