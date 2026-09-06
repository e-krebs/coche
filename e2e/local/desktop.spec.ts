import type { Page } from "@playwright/test";
import {
  test,
  expect,
  gotoApp,
  addItem,
  checkbox,
  createList,
  editRow,
  fillScreen,
  listTitle,
  openListEditor,
  pickList,
  row,
  sheet,
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

  // Editing follows the lists into whichever home they have, so up here it happens in the sidebar
  // itself — no sheet, no scrim, and the list beside it stays live, because nothing is modal.
  test("turns the sidebar into the editor rather than opening a sheet", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Milk");
    const edit = sidebar(page).getByRole("button", { name: "Edit lists" });
    await edit.click();
    await expect(sidebar(page).getByLabel("New list name")).toBeVisible();
    await expect(
      sidebar(page)
        .getByRole("button", { name: /^Reorder / })
        .first(),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(sheetPanel(page)).toHaveCount(0);
    await expect(page.locator("[inert]")).toHaveCount(0);
    // Wider while editing: a row has to hold a drag handle, a rename field and a delete.
    expect(await widthOf(page, "[data-list-sidebar]")).toBeGreaterThan(17 * 16);
  });

  // Done drops back to picking, which is all the sidebar ever offers — and the toggle it was
  // pressed on is still there, so focus has nowhere it needs to be rescued to.
  test("steps back out of edit mode without going anywhere", async ({ page }) => {
    await gotoApp(page);
    await openListEditor(page);
    const done = sidebar(page).getByRole("button", { name: "Done" });
    await done.click();
    await expect(sidebar(page).getByLabel("New list name")).toHaveCount(0);
    await expect(switchList(page)).toHaveAttribute("aria-current", "true");
    await expect(sidebar(page).getByRole("button", { name: "Edit lists" })).toBeFocused();
  });

  // Escape is the keyboard's way out, mirroring what it does to the sheet below `lg`.
  test("leaves edit mode on Escape", async ({ page }) => {
    await gotoApp(page);
    await openListEditor(page);
    await page.keyboard.press("Escape");
    await expect(sidebar(page).getByLabel("New list name")).toHaveCount(0);
  });

  // The anchor four focus restores aim at has to exist, and exactly once, in both modes: while
  // editing no row is `aria-current`, so it moves to the toggle.
  test("keeps exactly one focus anchor through edit mode", async ({ page }) => {
    await gotoApp(page);
    await expect(switchList(page)).toHaveCount(1);
    await openListEditor(page);
    await expect(switchList(page)).toHaveCount(1);
    await expect(switchList(page)).toHaveAccessibleName("Done");
  });

  // A fixed overlay nested in the sticky sidebar would be trapped in its stacking context, painting
  // under the list's own header — so the confirmation is a sibling of the panel, not a child.
  test("raises the delete confirmation above the sidebar it came from", async ({ page }) => {
    await gotoApp(page);
    await createList(page, "Garden");
    await openListEditor(page);
    await page.getByRole("button", { name: "Delete Garden" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.locator("[data-list-sidebar] [role=alertdialog]")).toHaveCount(0);
    // The page behind it is unreachable at this width too, where no sheet is doing that job.
    await expect(page.locator("[data-list-sidebar][inert]")).toHaveCount(1);
    await expect(page.locator("[inert] main")).toHaveCount(1);
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

  // The tier where a capped bar is visible as a floating card: wide enough to outgrow the column,
  // too narrow for the sidebar to be the thing holding the header in. Checked at both caps — the
  // phone one binds from `sm` to `md`, a range neither project's viewport reaches.
  test("runs the header bar edge to edge, with its content still in the column", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "both projects share this fixed viewport");
    await gotoApp(page);

    const measure = async (width: number) => {
      await page.setViewportSize({ width, height: 800 });
      const bar = await page.locator("header").boundingBox();
      const band = await titleBand(page).boundingBox();
      if (!bar || !band) throw new Error(`header not laid out at ${width}`);
      // The item column's content box, so a padding tweak moves both edges together instead of
      // failing here.
      const column = await page.locator("main").evaluate((el) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          left: box.left + parseFloat(style.paddingLeft),
          right: box.right - parseFloat(style.paddingRight),
        };
      });
      return { bar, band, column };
    };

    for (const width of [600, 900]) {
      const { bar, band, column } = await measure(width);
      expect({ x: bar.x, width: bar.width }, `bar at ${width}`).toEqual({ x: 0, width });
      expect(band.width, `band capped at ${width}`).toBeLessThan(bar.width);
      expect(band.x, `band left at ${width}`).toBeCloseTo(column.left, 0);
      expect(band.x + band.width, `band right at ${width}`).toBeCloseTo(column.right, 0);
    }
  });

  test("centres the lists sheet instead of sliding it off the bottom edge", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "both projects share this fixed viewport");
    await gotoApp(page);
    await switchList(page).click();
    const box = await sheetPanel(page).boundingBox();
    const view = page.viewportSize();
    if (!box || !view) throw new Error("sheet or viewport not laid out");
    // A bottom sheet ends flush with the viewport floor; a centred dialog leaves room under it.
    expect(view.height - (box.y + box.height)).toBeGreaterThan(16);
  });
});

// Resizing past `lg` with the sheet open is the one way to ask for two lists panels at once. Starts
// below the threshold and crosses it in-test, so it needs a viewport of its own and runs once.
test.describe("crossing into the sidebar's width", () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test("hands picking to the sidebar instead of leaving a sheet over it", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "both projects share this fixed viewport");
    await gotoApp(page);
    await switchList(page).click();
    await expect(sheet(page)).toBeVisible();

    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(sidebar(page)).toBeVisible();
    await expect(sheetPanel(page)).toHaveCount(0);
    // The anchor changed seat with the lists: the title that opened the sheet is a heading up here,
    // so the restore falls through to the sidebar's current row.
    await expect(switchList(page)).toBeFocused();

    // And a sheet nobody re-opened does not come back when the sidebar leaves again.
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(sheetPanel(page)).toHaveCount(0);
    await expect(sidebar(page)).toHaveCount(0);
  });

  test("carries an edit session across, drafts and all", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "both projects share this fixed viewport");
    await gotoApp(page);
    await createList(page, "Garden");
    await openListEditor(page);
    await page.getByLabel("New list name").fill("Hardw");
    await editRow(page, "Garden").click();
    await page.getByLabel("Rename Garden").fill("Shed");

    // Nothing beside the list creates, renames, reorders or deletes, so the editor is nobody's
    // duplicate: it follows the lists into their other home rather than being dismissed.
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(sidebar(page).getByLabel("New list name")).toHaveValue("Hardw");
    await expect(page.getByLabel("Rename Garden")).toHaveValue("Shed");
    await expect(editRow(page, "Garden")).toHaveCount(0);
  });
});
