import { test as base, expect, type Page } from "@playwright/test";

export const TEST_USER = "user_e2e_local";

const CSP_MARKER = "CSP_VIOLATION";

/**
 * Seeds a cached identity and blocks all non-localhost network so the app runs local-only (no
 * Worker, no Clerk). Also fails any test where the enforced CSP (public/_headers) blocks
 * something — a regression here is otherwise silent (the browser just drops the request/script).
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(
      (args) => {
        localStorage.setItem("shopping:userId", args.uid);
        window.addEventListener("securitypolicyviolation", (e) => {
          console.error(`${args.marker} ${e.violatedDirective} ${e.blockedURI}`);
        });
      },
      { uid: TEST_USER, marker: CSP_MARKER },
    );
    await context.route("**/*", async (route) => {
      const host = new URL(route.request().url()).hostname;
      if (host === "localhost" || host === "127.0.0.1") await route.continue();
      else await route.abort();
    });
    await use(context);
  },
  page: async ({ page }, use) => {
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().startsWith(CSP_MARKER)) violations.push(msg.text());
    });
    await use(page);
    expect(violations, "unexpected CSP violation(s)").toEqual([]);
  },
});

export { expect };

export const field = (page: Page) => page.getByLabel("Add or find an item");

/**
 * Match the aria-label attribute (CSS), not the accessible name — the sortable <li> also contains
 * "Check off <name>".
 */
export const checkbox = (page: Page, name: string) =>
  page.locator(`button[aria-label="Check off ${name}"]`);

/**
 * The list's polite live region. Matched by attribute: dnd-kit mounts a `role="status"` region of its
 * own alongside the sortable list, so a role lookup is ambiguous whenever there are unchecked items.
 */
export const announcer = (page: Page) => page.locator("[data-announcer]");

export const gotoApp = async (page: Page): Promise<void> => {
  await page.goto("/");
  await expect(field(page)).toBeVisible();
};

export const addItem = async (page: Page, name: string): Promise<void> => {
  await field(page).fill(name);
  await field(page).press("Enter");
  await expect(checkbox(page, name)).toBeVisible();
};

/**
 * The control that always names the active list: the header title on a phone, the sidebar's current
 * row beside the list. Matched by attribute, which both carry — its accessible name is deliberately
 * the list name, so a role+name lookup would collide with an item of the same name. Pressing it
 * opens the picker only on the phone; use `pickList` to switch at either width.
 */
export const switchList = (page: Page) => page.locator("[data-list-trigger]");

/** The `<h1>`, which is the active list's name at every width — a button only on the phone. */
export const listTitle = (page: Page) => page.getByRole("heading", { level: 1 });

export const sidebar = (page: Page) => page.locator("[data-list-sidebar]");

/**
 * Which home the roster has. Read from the viewport rather than by counting the sidebar, so a
 * helper called before first paint can't silently take the phone branch and then fail looking for a
 * trigger that was never going to be there.
 */
const isWide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** The header's first band, which carries `data-scrolled` once the header has shrunk. */
export const titleBand = (page: Page) => page.locator("header > div").first();

/**
 * The picker's panel. `sheet` matches the `role="dialog"` wrapper, whose box is the whole viewport
 * at every breakpoint — so anything measuring where the panel sits needs this instead.
 */
export const sheetPanel = (page: Page) => page.locator("[data-sheet]");

/**
 * Enough rows that the document outgrows either project's viewport — a page that can't scroll
 * leaves `scrollY` at 0 and makes any assertion about the header's collapse vacuous. Submits
 * without waiting on each row, then waits once for the last.
 */
export const fillScreen = async (page: Page): Promise<void> => {
  for (let i = 0; i < 24; i += 1) {
    await field(page).fill(`Item ${i}`);
    await field(page).press("Enter");
  }
  await expect(checkbox(page, "Item 23")).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.body.scrollHeight - window.innerHeight))
    .toBeGreaterThan(200);
};

/**
 * The open picker. Scope list-row lookups to it: the header trigger's accessible name is the active
 * list's name, so an unscoped `{ name: "Garden" }` matches it too.
 */
export const sheet = (page: Page) => page.getByRole("dialog", { name: "Lists" });

/**
 * Opens the sheet in edit mode, from whichever surface owns the roster: the sidebar's own Edit goes
 * straight there, while the phone has to open the pick sheet first and flip it.
 */
export const openListEditor = async (page: Page): Promise<void> => {
  if (isWide(page)) {
    await sidebar(page).getByRole("button", { name: "Edit lists" }).click();
  } else {
    await switchList(page).click();
    await sheet(page).getByRole("button", { name: "Edit lists" }).click();
  }
  await expect(page.getByLabel("New list name")).toBeVisible();
};

/**
 * Creates a list from the picker's Edit mode and then switches to it. Creating deliberately stays in
 * the sheet, so landing on the new list is a second, explicit step — and Done leaves the sheet in
 * pick mode at either width, so the last step is the same one.
 */
export const createList = async (page: Page, name: string): Promise<void> => {
  await openListEditor(page);
  await page.getByLabel("New list name").fill(name);
  await page.getByRole("button", { name: "Create list" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${name},`) }).click();
  await expect(listTitle(page)).toHaveText(name);
};

/** Switches list: one click in the sidebar, or the sheet's menu on the phone. */
export const pickList = async (page: Page, name: string): Promise<void> => {
  if (isWide(page)) {
    await sidebar(page)
      .getByRole("button", { name: new RegExp(`^${name},`) })
      .click();
  } else {
    await switchList(page).click();
    await page.getByRole("menuitemradio", { name: new RegExp(`^${name},`) }).click();
  }
  await expect(listTitle(page)).toHaveText(name);
};

/**
 * Unchecked item names (or the search results), in display order. Excludes the checked section's
 * list: the unchecked one renders no `ul` at all when empty, so a bare `.first()` silently falls
 * through to the checked names. Scoped to `main`, so neither the picker's list nor the sidebar's
 * roster can win — the sidebar comes *first* in the DOM.
 */
export const uncheckedNames = async (page: Page): Promise<string[]> =>
  page
    .locator("main ul:not([data-checked-list])")
    .first()
    .locator('button[aria-label^="Check off "]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.slice("Check off ".length)));

/** The sortable <li> wrapping an item. */
export const row = (page: Page, name: string) => page.locator("li", { has: checkbox(page, name) });

export const waitForServiceWorker = async (page: Page): Promise<void> => {
  await page.evaluate(async () => navigator.serviceWorker.ready.then(() => undefined));
};

/**
 * Wait for a non-zero Y translate (move applied) before dropping — poll-based to avoid
 * fixed-timeout flake. The generous ceiling is for worker contention: the default 5s is enough for
 * this drag in isolation but not always with the whole suite running in parallel.
 */
export const waitForDragShift = async (page: Page): Promise<unknown> =>
  page.waitForFunction(
    () =>
      [...document.querySelectorAll<HTMLElement>("li[data-draggable]")].some((li) => {
        const m = /translate3d\(\s*-?\d+px,\s*(-?\d+)px/.exec(li.style.transform || "");
        return !!m && Number(m[1]) !== 0;
      }),
    undefined,
    { timeout: 20_000 },
  );
