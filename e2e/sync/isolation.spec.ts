import { test, expect, addItem, checkbox, signIn } from "./fixtures";

test.describe("isolation", () => {
  // Different users => different listIds, so lists never cross. The same-user second device proves
  // sync is live, so the other user's absence is isolation, not latency.
  test("one user's items never reach another user's list", async ({ page, browser, makeUser }) => {
    const userA = await makeUser("a");
    const userB = await makeUser("b");

    await signIn(page, userA); // A's first device

    const ctxA2 = await browser.newContext();
    const pageA2 = await ctxA2.newPage();
    await signIn(pageA2, userA); // A's second device

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signIn(pageB, userB);

    try {
      await addItem(page, "Avocado");
      await expect(checkbox(pageA2, "Avocado")).toBeVisible(); // reaches A's other device...
      await expect(checkbox(pageB, "Avocado")).toHaveCount(0); // ...but never user B

      await addItem(pageB, "Broccoli");
      await expect(checkbox(pageB, "Broccoli")).toBeVisible();
      await expect(checkbox(page, "Broccoli")).toHaveCount(0);
    } finally {
      await ctxA2.close();
      await ctxB.close();
    }
  });
});
