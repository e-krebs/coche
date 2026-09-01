import { test, expect, signIn } from "./fixtures";

/**
 * The seat's size and Clerk's `userButtonAvatarBox` are set from the same value, but on opposite
 * sides of a dependency: a Clerk release that changes its own sizing scale would leave the dashed
 * placeholder peeking out from behind the avatar, permanently and silently. This is the only tier
 * with a real avatar to measure against.
 */
test.describe("account seat", () => {
  test("Clerk's avatar covers the seat exactly", async ({ page, makeUser }) => {
    await signIn(page, await makeUser());

    const seat = page.locator(".group\\/account");
    const avatar = seat.locator("img, .cl-userButtonAvatarBox").first();
    await expect(avatar).toBeVisible();

    const seatBox = await seat.boundingBox();
    const avatarBox = await avatar.boundingBox();
    if (!seatBox || !avatarBox) throw new Error("seat or avatar not laid out");

    expect(Math.abs(avatarBox.width - seatBox.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(avatarBox.height - seatBox.height)).toBeLessThanOrEqual(0.5);
  });
});
