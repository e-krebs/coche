import {
  test,
  expect,
  announcer,
  checkbox,
  gotoApp,
  addItem,
  field,
  fillScreen,
  openListEditor,
  row,
  scrollToSettledBottom,
  uncheckedNames,
  sheet,
  switchList,
} from "./fixtures";

/**
 * The keyboard tier. Everything here needs a real engine: `inert`, sequential focus navigation and
 * `:focus-visible` are all things jsdom either approximates or doesn't compute at all, so the unit
 * tier asserts where focus *lands* and this one asserts what the browser actually does with it.
 */
test.describe("keyboard", () => {
  const seed = async (page: Parameters<typeof gotoApp>[0]) => {
    await gotoApp(page);
    await addItem(page, "Apples");
    await addItem(page, "Bread");
    await field(page).blur();
    await expect(row(page, "Apples")).toHaveAttribute("data-draggable", "true");
  };

  test("a row's own controls keep their keys instead of lifting the row", async ({ page }) => {
    await seed(page);
    await page.locator('button[aria-label="Check off Apples"]').focus();
    await page.keyboard.press("Enter");
    // The item moving to the checked group is the toggle landing; before the activator was wired, the
    // same keypress lifted the row and swallowed the click.
    await expect(page.getByRole("button", { name: /^Checked \(1\)$/ })).toBeVisible();
    await expect(row(page, "Bread")).not.toHaveAttribute("aria-pressed", "true");
  });

  // The unit tier can't see this one: `animate` defers the mutation to a view transition, which jsdom
  // has no implementation of, so a restore that fires against the pre-mutation tree passes there.
  test("checking a row off hands focus to the next row, and says so", async ({ page }) => {
    await seed(page);
    await addItem(page, "Cheese");
    await field(page).blur();
    await checkbox(page, "Apples").focus();
    await page.keyboard.press(" ");
    await expect(checkbox(page, "Bread")).toBeFocused();
    await expect(announcer(page)).toHaveText("Checked off “Apples”.");
    // The point of the whole change: the same key again, with no re-focusing in between.
    await page.keyboard.press(" ");
    await expect(checkbox(page, "Cheese")).toBeFocused();
  });

  // A result row survives the toggle — search matches on the name, not the checked flag — so the row
  // is only re-sorted and the browser keeps focus on it. Nothing to walk down to, and the button that
  // states the change is still there, so the restore and the announcement both stand down.
  test("checking a search result keeps focus on the row, silently", async ({ page }) => {
    await seed(page);
    await field(page).fill("read");
    const checkoff = checkbox(page, "Bread");
    await checkoff.focus();
    await page.keyboard.press(" ");
    await expect(checkoff).toHaveAttribute("aria-pressed", "true");
    await expect(checkoff).toBeFocused();
    await expect(announcer(page)).toHaveText("");
  });

  // The other half of the reclaim's reveal rule: a tap must not move the page (check.spec.ts), and a
  // keyboard restore must still land on screen — and below the sticky header, which is what the row
  // controls' scroll-margin-top buys. The sixth row by rendered order, not the first, whose slot is
  // so near the top of the document that the reveal clamps at offset 0 and the clearance comes for
  // free — and not by name, since `fillScreen` submits without waiting and two rows minted from the
  // same last position land in an order the names don't predict.
  test("unchecking by keyboard brings the row back on screen, clear of the header", async ({
    page,
  }) => {
    await gotoApp(page);
    await fillScreen(page);
    await field(page).blur();
    const names = await uncheckedNames(page);
    const [sixth, seventh] = names.slice(5);
    await checkbox(page, sixth).click();
    await checkbox(page, seventh).click();
    await page.getByRole("button", { name: /^Checked \(2\)$/ }).click();
    await scrollToSettledBottom(page);

    // Out and straight back, so the button ends up focused by a real Tab press whatever the tab order
    // around it is. That press is what makes the restore below `:focus-visible`; a bare
    // `locator.focus()` would leave the modality a pointer one and fail this for the wrong reason.
    await checkbox(page, sixth).focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(checkbox(page, sixth)).toBeFocused();
    await page.keyboard.press(" ");

    // The row reaching the unchecked list is the mutation landing; the button keeps focus across the
    // remount, so `toBeFocused` alone would pass against the pre-transition tree.
    await expect.poll(async () => uncheckedNames(page)).toContain(sixth);
    await expect(checkbox(page, sixth)).toBeFocused();
    await expect(row(page, sixth)).toBeInViewport({ ratio: 1 });
    const clearsHeader = await page.evaluate((name) => {
      const btn = document.querySelector(`button[aria-label="Check off ${name}"]`)!;
      const header = document.querySelector("header")!;
      return btn.getBoundingClientRect().top >= header.getBoundingClientRect().bottom;
    }, sixth);
    expect(clearsHeader).toBe(true);
  });

  test("delete is reachable without a pointer", async ({ page }) => {
    await seed(page);
    await page.getByRole("button", { name: "Apples", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Rename Apples")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Delete Apples")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator('button[aria-label="Check off Apples"]')).toBeHidden();
  });

  // No sheet has an entry point beside the sidebar — picking is a click there and editing happens in
  // place, with no dialog to trap, escape or return focus from. desktop.spec.ts asserts what those
  // three become up there: Escape leaves edit mode, the toggle keeps focus, and nothing goes inert
  // until a confirmation opens.
  test.describe("the pick sheet", () => {
    test.skip(
      ({ viewport }) => (viewport?.width ?? 0) >= 1024,
      "the sidebar replaces the pick sheet above lg",
    );

    test("Tab stays inside the sheet while it is open", async ({ page }) => {
      await seed(page);
      await switchList(page).press("Enter");
      await expect(sheet(page)).toBeVisible();
      // 10 presses is well past the sheet's control count, so an escape would have happened by now.
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null),
      ).toBe(true);
    });

    test("the list behind the picker is inert", async ({ page }) => {
      await seed(page);
      await switchList(page).click();
      await expect(sheet(page)).toBeVisible();
      expect(
        await page.evaluate(() => {
          const el = document.querySelector('button[aria-label="Check off Apples"]');
          return el?.closest("[inert]") !== null;
        }),
      ).toBe(true);
    });

    test("closing the picker returns focus to the title that opened it", async ({ page }) => {
      await seed(page);
      await switchList(page).press("Enter");
      await expect(sheet(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet(page)).toBeHidden();
      await expect(switchList(page)).toBeFocused();
    });
  });

  // Space-then-Escape only: no arrow, so none of the KeyboardSensor timing that keeps arrow-driven
  // reorder out of this tier (see reorder.spec.ts). dnd-kit reads Escape as cancel, and the panel
  // stands down while a lift is in flight — so the edit session stays, whichever home it is in.
  test("Escape cancels a lift without ending the edit session", async ({ page }) => {
    await seed(page);
    await openListEditor(page);
    await page.getByRole("button", { name: /^Reorder / }).focus();
    await page.keyboard.press(" ");
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("New list name")).toBeVisible();
  });

  // The ring is a box-shadow from Tailwind's `ring-*`, and :focus-visible only matches on a keyboard
  // focus — neither is computable in jsdom, which is why this assertion lives here.
  test("every keyboard-focused control paints a focus ring", async ({ page }) => {
    await seed(page);
    const painted = async () =>
      page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "";
        const s = getComputedStyle(el);
        return `${s.boxShadow}|${s.outlineStyle}`;
      });

    await switchList(page).press("Tab");
    await switchList(page).focus();
    await page.keyboard.press("Tab");
    expect(await painted()).not.toBe("none|none");

    await page.locator('button[aria-label="Check off Apples"]').focus();
    await page.keyboard.press("Tab");
    expect(await painted()).not.toBe("none|none");
  });
});
