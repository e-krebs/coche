import type { Page } from "@playwright/test";
import { test, expect, gotoApp, createList, fillScreen, switchList, titleBand } from "./fixtures";

/**
 * Clerk is unreachable in this tier (the fixtures abort every non-localhost request), so the avatar
 * never arrives — which is exactly the cold-load shape the header used to break on. Band 1's side
 * columns are fixed at one avatar wide, so the title has to sit dead centre with the seat still
 * empty, and stay there when the list name changes length.
 */
const CENTRE_TOLERANCE = 1;

const titleOffset = async (page: Page): Promise<number> => {
  const title = await switchList(page).boundingBox();
  const header = await page.locator("header").boundingBox();
  if (!title || !header) throw new Error("header or title not laid out");
  return title.x + title.width / 2 - (header.x + header.width / 2);
};

test.describe("header", () => {
  // The whole file is the phone's header: above `lg` the sidebar owns switching, so the title is
  // left-aligned text in a two-column band and has no centring left to drift.
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) >= 1024,
    "the wide header has no centred title to measure",
  );

  test("centres the list title with the avatar's seat still empty", async ({ page }) => {
    await gotoApp(page);
    expect(Math.abs(await titleOffset(page))).toBeLessThanOrEqual(CENTRE_TOLERANCE);
  });

  test("keeps the title centred across list names of different lengths", async ({ page }) => {
    await gotoApp(page);
    const short = await titleOffset(page);
    // Long enough to squeeze the side columns: with elastic ones, the title's own track eats the
    // free space and the rails end up asymmetric (0 on the left, one avatar on the right).
    await createList(page, "A considerably longer list name that keeps going");
    const long = await titleOffset(page);
    expect(Math.abs(long - short)).toBeLessThanOrEqual(CENTRE_TOLERANCE);
  });

  // The other half of the pair in desktop.spec.ts: a phone still reclaims the vertical room, which
  // is what makes freezing the shrink above md a deliberate choice rather than a lost feature. The
  // centring tests above hold at every width and deliberately keep running in both projects — the
  // drift they guard against is a property of the band's fixed side columns, not of its height.
  test("shrinks the title band once the page scrolls past the fold", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) >= 768, "the shrink is frozen above md");
    await gotoApp(page);
    await expect(titleBand(page)).not.toHaveAttribute("data-scrolled");
    await fillScreen(page);
    await page.mouse.wheel(0, 400);
    await expect(titleBand(page)).toHaveAttribute("data-scrolled");
  });
});
