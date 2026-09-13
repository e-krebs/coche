import { test, expect, addItem, deletePill, signIn, startSwipe, uncheckedNames } from "./fixtures";

/**
 * `syncing` is `status === "connecting" && !everSynced`, so only the very first connection of a
 * signed-in session sets it — the local-only tier, whose status never leaves `disabled`, can't reach
 * this gate at all. Holding the ticket response open widens that window from milliseconds to as long
 * as the test needs.
 *
 * The gate is read from a ref the hook refreshes in a passive effect, so a stale read is a real
 * failure mode rather than a theoretical one. Releasing the ticket and repeating the same gesture is
 * what keeps the first half honest: the same swipe that moved nothing then deletes the row.
 *
 * Not covered, for want of a window to aim at: a swipe already in progress when the first sync
 * starts still completes. `syncing` is read at touchdown, and the status is `connecting` from the
 * first render, so there is no moment where a gesture can begin ahead of it.
 */
test.describe("the sync gate on swipe", () => {
  test.use({ hasTouch: true });

  test("no swipe starts while the first sync is in flight", async ({ page, context, makeUser }) => {
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await context.route("**/ws-ticket", async (route) => {
      await held;
      await route.continue();
    });

    await signIn(page, await makeUser());
    await expect(page.locator('span[data-status="connecting"]')).toBeAttached();
    await addItem(page, "Butter");

    const blocked = await startSwipe({ page, name: "Butter" });
    await blocked.move({ dx: -(blocked.threshold + 20) });
    expect(await blocked.transform()).toBe("");
    await expect(deletePill(page, "Butter")).toHaveCount(0);
    await blocked.release();
    await expect.poll(async () => uncheckedNames(page)).toEqual(["Butter"]);

    release();
    await expect(page.locator('span[data-status="synced"]')).toBeAttached({ timeout: 15_000 });

    const allowed = await startSwipe({ page, name: "Butter" });
    await allowed.move({ dx: -(allowed.threshold + 20) });
    await allowed.release();
    await expect.poll(async () => uncheckedNames(page)).toEqual([]);
  });
});
