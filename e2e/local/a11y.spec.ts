import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect, gotoApp, addItem, checkbox, field, switchList, sheet } from "./fixtures";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * The two rules that the whole-row drag activator trips, by design — see
 * ../../docs/adr/0008-dnd-kit-reorder.md. Filtered per node rather than disabled per scan, so a *new*
 * violation of either rule anywhere else on the same screen still fails.
 */
const ADR_0008_RULES = new Set(["nested-interactive", "list"]);
const isSortableRow = (html: string) => html.includes("data-draggable");
const isSortableList = (html: string) => html.includes("data-sortable-list");

const scan = async (page: Page, within?: string) => {
  let builder = new AxeBuilder({ page }).withTags(WCAG);
  if (within) builder = builder.include(within);
  const { violations } = await builder.analyze();
  return violations
    .map((v) => ({
      id: v.id,
      nodes: ADR_0008_RULES.has(v.id)
        ? v.nodes.filter((n) => !isSortableRow(n.html) && !isSortableList(n.html))
        : v.nodes,
    }))
    .filter((v) => v.nodes.length > 0)
    .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.map((n) => n.html).join(" ~ ")}`);
};

/**
 * The runtime half of the accessibility gate — jsx-a11y reads JSX, axe reads the computed
 * accessibility tree of a rendered page, which is the only place the two can disagree. See
 * ../../docs/adr/0015-axe-e2e-gate.md.
 */
test.describe("axe", () => {
  // Reduced motion, so every surface is fully painted when it is measured. A dialog scanned mid
  // entrance animation is still partly transparent, and axe reports the scrim behind it as the
  // background — which fails colour-contrast on every element inside, including ones that pass.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("an empty list has no violations", async ({ page }) => {
    await gotoApp(page);
    expect(await scan(page)).toEqual([]);
  });

  test("a populated list has no violations", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Apples");
    await addItem(page, "Bread");
    await field(page).blur();
    expect(await scan(page)).toEqual([]);
  });

  // The one place `inert` and `aria-hidden` wrap focusable content, so worth scanning folded as well
  // as open.
  test("a collapsed checked section has no violations", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Apples");
    await addItem(page, "Bread");
    await checkbox(page, "Apples").click();
    await expect(page.getByRole("button", { name: /^Checked \(1\)$/ })).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test("an expanded checked section has no violations", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Apples");
    await checkbox(page, "Apples").click();
    await page.getByRole("button", { name: /^Checked \(1\)$/ }).click();
    expect(await scan(page)).toEqual([]);
  });

  test("search results have no violations", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Apples");
    await addItem(page, "Apricots");
    await field(page).fill("ap");
    expect(await scan(page)).toEqual([]);
  });

  test("a search with no matches has no violations", async ({ page }) => {
    await gotoApp(page);
    await addItem(page, "Apples");
    await field(page).fill("zzz");
    expect(await scan(page)).toEqual([]);
  });

  test("the picker has no violations while picking", async ({ page }) => {
    await gotoApp(page);
    await switchList(page).click();
    await expect(sheet(page)).toBeVisible();
    expect(await scan(page, '[role="dialog"]')).toEqual([]);
  });

  test("the picker has no violations in edit mode", async ({ page }) => {
    await gotoApp(page);
    await switchList(page).click();
    await page.getByRole("button", { name: "Edit lists" }).click();
    expect(await scan(page, '[role="dialog"]')).toEqual([]);
  });

  // The one dialog this tier can't reach is the language chooser: Clerk's network is blocked here, so
  // the UserButton that opens it never renders. It is unit-covered instead.
  test("the delete confirmation has no violations", async ({ page }) => {
    await gotoApp(page);
    await switchList(page).click();
    await page.getByRole("button", { name: "Edit lists" }).click();
    await page.getByLabel("New list name").fill("Hardware");
    await page.getByRole("button", { name: "Create list" }).click();
    await page.getByRole("button", { name: "Delete Hardware" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    expect(await scan(page, '[role="alertdialog"]')).toEqual([]);
  });
});
