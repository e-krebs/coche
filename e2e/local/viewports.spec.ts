import { test, expect, gotoApp } from "./fixtures";

/**
 * The two projects are the app's two shapes, and every responsive branch keys off a media query
 * rather than a width alone. This pins what each project actually reports, so a config edit can't
 * quietly turn the phone project into a second desktop and leave the coarse-pointer paths — swipe
 * to delete, the header's scroll reclaim — untested everywhere.
 */
test.describe("projects", () => {
  test("reports the pointer and width its name claims", async ({ page }, testInfo) => {
    await gotoApp(page);
    const media = await page.evaluate(() => ({
      width: window.innerWidth,
      fine: matchMedia("(pointer: fine)").matches,
      hover: matchMedia("(hover: hover)").matches,
    }));

    if (testInfo.project.name === "phone") {
      expect(media).toEqual({ width: 390, fine: false, hover: false });
    } else {
      expect(media.fine).toBe(true);
      expect(media.hover).toBe(true);
      expect(media.width).toBeGreaterThanOrEqual(768);
    }
  });
});
