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

  /**
   * The avatar's half of the cross-fade rides on a class handed to Clerk through `appearance`, and
   * Clerk injects its own styles after the app's: a release that animates the box itself would win
   * the cascade and silently drop the fade, putting the placeholder's glyph back under a photo at
   * full opacity.
   */
  test("Clerk leaves the avatar's fade-in in place", async ({ page, makeUser }) => {
    await signIn(page, await makeUser());

    const box = page.locator(".cl-userButtonAvatarBox").first();
    await expect(box).toBeVisible();

    expect(await box.evaluate((el) => getComputedStyle(el).animationName)).toBe("avatar-in");
  });
});
