import { test, expect, addItem, clerk, signIn, hasReplica } from "./fixtures";

test.describe("sign-out", () => {
  // Teardown is unit-covered (src/store/teardown.test.ts); this asserts the real sign-out
  // transition drives it — replica deleted, back to sign-in.
  test("signing out clears the local replica and returns to sign-in", async ({
    page,
    makeUser,
  }) => {
    const user = await makeUser();
    await signIn(page, user);

    await addItem(page, "Milk");
    expect(await hasReplica(page, user.userId)).toBe(true);

    await clerk.signOut({ page });

    await expect(page).toHaveURL(/\/sign-in/);
    await expect.poll(async () => hasReplica(page, user.userId)).toBe(false);
  });
});
