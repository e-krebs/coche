import type { Page } from "@playwright/test";
import {
  test,
  expect,
  gotoApp,
  addItem,
  checkbox,
  createList,
  fillScreen,
  listTitle,
  pickList,
  row,
  sheetPanel,
  sidebar,
  switchList,
  titleBand,
  uncheckedNames,
} from "./fixtures";

/**
 * The desktop half of the responsive tiers. Runs in both projects and skips itself on the phone
 * one: the point is what changes above `md`, and the phone project is the control it changes from.
 */
const DESKTOP_MIN = 768;

/** The phone cap, 28rem — what "wider than a phone" is measured against. */
const PHONE_CAP = 28 * 16;

const widthOf = async (page: Page, selector: string): Promise<number> => {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} not laid out`);
  return box.width;
};

test.describe("desktop layout", () => {
  test.skip(
    ({ viewport }) => !viewport || viewport.width < DESKTOP_MIN,
    "the phone-width run is this spec's control, not its subject",
  );

  test("gives the list more room than the phone column", async ({ page }) => {
    await gotoApp(page);
    // Wider than the phone cap rather than an exact width, so a design tweak doesn't re-pin this.
    expect(await widthOf(page, "main")).toBeGreaterThan(PHONE_CAP);
  });

  test("never shrinks the title band, however far the page scrolls", async ({ page }) => {
    await gotoApp(page);
    await fillScreen(page);
    await page.mouse.wheel(0, 400);
    // The attribute is the shrink's single source, set synchronously by the scroll handler — so
    // this needs no wait, and asserting on it can't race the 300ms transition it drives.
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(44);
    await expect(titleBand(page)).not.toHaveAttribute("data-scrolled");
  });

  test("offers a Delete on the row that the keyboard steps over", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Butter");
    const del = row(page, "Butter").getByLabel("Delete Butter");
    await expect(del).toHaveAttribute("tabindex", "-1");
    // Faded out, not hidden: Playwright counts an `opacity: 0` element as visible, and the reveal
    // is a transition on that property.
    await expect(del).toHaveCSS("opacity", "0");
    await row(page, "Butter").hover();
    await expect(del).toHaveCSS("opacity", "1");
    await del.click();
    await expect(checkbox(page, "Butter")).toHaveCount(0);
  });

  // The reveal is scoped to the row's own named group. A bare `group` would have been answered by
  // any ancestor carrying one — and the checked section is exactly that, so hovering its heading
  // used to light up the Delete on every row inside it.
  test("reveals only the hovered row's Delete", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Milk");
    await addItem(page, "Eggs");
    await checkbox(page, "Milk").click();
    const fold = page.getByRole("button", { name: /Checked \(\d+\)/ });
    await fold.click();
    const checkedDel = row(page, "Milk").getByLabel("Delete Milk");
    await fold.hover();
    await expect(checkedDel).toHaveCSS("opacity", "0");
    await row(page, "Eggs").hover();
    await expect(checkedDel).toHaveCSS("opacity", "0");
    await row(page, "Milk").hover();
    await expect(checkedDel).toHaveCSS("opacity", "1");
  });

  // The Delete suppresses mousedown so its own row's editor can't blur-and-close before the click
  // lands. Suppressing it for *another* row's editor would drop the rename that editor is holding.
  test("commits a pending rename when another row's Delete is clicked", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Apples");
    await addItem(page, "Bread");
    await page.getByRole("button", { name: "Apples", exact: true }).click();
    await page.getByLabel("Rename Apples").fill("Apricots");
    await row(page, "Bread").hover();
    await row(page, "Bread").getByLabel("Delete Bread").click();
    await expect(checkbox(page, "Apricots")).toBeVisible();
    await expect(checkbox(page, "Apples")).toHaveCount(0);
  });

  test("stands the roster beside the list instead of over it", async ({ page }) => {
    await gotoApp(page);
    await expect(sidebar(page)).toBeVisible();
    // A nav landmark rather than a menu: this roster is persistent navigation, not a transient
    // menu, so the row you're on is `aria-current` and every row is an ordinary tab stop.
    await expect(sidebar(page).getByRole("button", { name: /^Coche,/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("hands the title back to the heading it always was", async ({ page }) => {
    await gotoApp(page);
    await expect(listTitle(page)).toHaveText("Coche");
    // The sidebar is the switcher now, so the title claims no dialog and takes no focus.
    await expect(listTitle(page).getByRole("button")).toHaveCount(0);
    await expect(switchList(page)).toHaveAttribute("aria-current", "true");
  });

  test("switches list in one click, with no dialog in the way", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Milk");
    await createList(page, "Garden");
    await addItem(page, "Compost");
    await pickList(page, "Coche");
    expect(await uncheckedNames(page)).toEqual(["Milk"]);
    await pickList(page, "Garden");
    expect(await uncheckedNames(page)).toEqual(["Compost"]);
  });

  test("opens the sheet straight into edit mode, and hands focus back on close", async ({
    page,
  }) => {
    await gotoApp(page);
    await addItem(page, "Milk");
    const edit = sidebar(page).getByRole("button", { name: "Edit lists" });
    await edit.click();
    // Straight into edit mode: picking is the sidebar's job, so there is nothing else to offer.
    await expect(page.getByLabel("New list name")).toBeVisible();
    // Both the list and the roster behind the sheet are unreachable, not just the list.
    await expect(page.locator("[inert] [data-list-sidebar]")).toHaveCount(1);
    await expect(page.locator('[inert] button[aria-label="Check off Milk"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(sheetPanel(page)).toHaveCount(0);
    await expect(edit).toBeFocused();
  });
});

// Wide and coarse — a large tablet — is the combination neither project has: `phone` is
// narrow-and-coarse, `desktop` wide-and-fine. It is also the only place the sidebar's own freeze of
// the header shrink is observable, since a precise pointer freezes it at `md` already.
test.describe("large tablet layout", () => {
  test.use({ viewport: { width: 1024, height: 800 }, hasTouch: true });

  test("keeps the sidebar and stops shrinking the header", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "both projects share this fixed viewport");
    await gotoApp(page);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await expect(sidebar(page)).toBeVisible();
    await fillScreen(page);
    await page.mouse.wheel(0, 400);
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(44);
    await expect(titleBand(page)).not.toHaveAttribute("data-scrolled");
  });
});

// The centred picker lives in the band between `sm` and the sidebar's `lg`, which is neither
// project's width — so it gets its own, and runs once.
test.describe("tablet layout", () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test("centres the list picker instead of sliding it off the bottom edge", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "both projects share this fixed viewport");
    await gotoApp(page);
    await switchList(page).click();
    const box = await sheetPanel(page).boundingBox();
    const view = page.viewportSize();
    if (!box || !view) throw new Error("picker or viewport not laid out");
    // A bottom sheet ends flush with the viewport floor; a centred dialog leaves room under it.
    expect(view.height - (box.y + box.height)).toBeGreaterThan(16);
  });
});
