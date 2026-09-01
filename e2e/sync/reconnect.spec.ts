import { test, expect, signIn } from "./fixtures";

/**
 * A refused ticket is one attempt's verdict, not the truth — a token refresh that lost a race says
 * nothing about whether the reader is signed in. Before the retry existed, the first 401 was final
 * and only a reload restored sync. Refusing exactly one attempt needs no timing window: the retry
 * that follows reaches the real Worker.
 */
test.describe("reconnect", () => {
  test("a refused ticket doesn't stick", async ({ page, context, makeUser }) => {
    let refused = false;
    await context.route("**/ws-ticket", async (route) => {
      if (refused) {
        await route.continue();
        return;
      }
      refused = true;
      await route.fulfill({ status: 401, body: "unauthorized" });
    });

    await signIn(page, await makeUser());

    // Polled, not read once: the field is visible before the effect's ticket fetch leaves.
    await expect.poll(() => refused).toBe(true);
    await expect(page.locator('span[data-status="synced"]')).toBeAttached({ timeout: 15_000 });
  });
});
