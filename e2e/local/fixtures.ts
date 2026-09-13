import { test as base, expect, type Locator, type Page } from "@playwright/test";

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
 * the list name, so a role+name lookup would collide with an item of the same name — except while
 * the sidebar is editing, where no row is current and the panel's Done toggle holds the anchor
 * instead. Pressing it opens the sheet only on the phone; use `pickList` to switch at either width.
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
 * The sheet's panel. `sheet` matches the `role="dialog"` wrapper, whose box is the whole viewport
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
 * Scrolls to the bottom and waits for the document to stay that tall. The checked fold animates the
 * document taller over 200ms, so one scroll lands short of the bottom it aimed at and anything
 * measured straight after it moves again. Settled means two polls a beat apart read the same height.
 */
export const scrollToSettledBottom = async (page: Page): Promise<void> => {
  let previous = -1;
  await expect
    .poll(async () => {
      const height = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        return document.documentElement.scrollHeight;
      });
      const settled = height === previous;
      previous = height;
      return settled;
    })
    .toBe(true);
};

/**
 * The open sheet. Scope list-row lookups to it: the header trigger's accessible name is the active
 * list's name, so an unscoped `{ name: "Garden" }` matches it too.
 */
export const sheet = (page: Page) => page.getByRole("dialog", { name: "Lists" });

/**
 * Puts the lists panel in edit mode, wherever it lives: the sidebar flips in place, while the phone
 * has to open the pick sheet first and flip that. The wide branch also pins down that no modal came
 * with it — a sheet over the sidebar would satisfy the field alone.
 */
export const openListEditor = async (page: Page): Promise<void> => {
  if (isWide(page)) {
    await sidebar(page).getByRole("button", { name: "Edit lists" }).click();
    await expect(sidebar(page).getByLabel("New list name")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } else {
    await switchList(page).click();
    await sheet(page).getByRole("button", { name: "Edit lists" }).click();
    await expect(page.getByLabel("New list name")).toBeVisible();
  }
};

/**
 * A list's row in edit mode, the one that opens its rename. Scoped to the edit rows at both widths
 * by attribute: the header title's accessible name is the active list's, so an unscoped lookup
 * collides with it.
 */
export const editRow = (page: Page, name: string) =>
  page.locator("[data-list-editor]").getByRole("button", { name, exact: true });

/**
 * Switches list: one click in the sidebar, or the sheet's menu on the phone.
 *
 * Declared before `createList`, which finishes through it.
 */
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
 * Creates a list from the panel's edit mode and then switches to it. Creating deliberately leaves the
 * panel where it is, so landing on the new list is a second, explicit step — and Done means different
 * things at the two widths: the pick sheet on a phone, a sidebar back to picking beside the list.
 */
export const createList = async (page: Page, name: string): Promise<void> => {
  await openListEditor(page);
  await page.getByLabel("New list name").fill(name);
  await page.getByRole("button", { name: "Create list" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  if (isWide(page)) {
    await pickList(page, name);
  } else {
    await page.getByRole("menuitemradio", { name: new RegExp(`^${name},`) }).click();
    await expect(listTitle(page)).toHaveText(name);
  }
};

/**
 * Unchecked item names (or the search results), in display order. Excludes the checked section's
 * list: the unchecked one renders no `ul` at all when empty, so a bare `.first()` silently falls
 * through to the checked names. Scoped to `main`, so neither the sheet's rows nor the sidebar's can
 * win — the sidebar comes *first* in the DOM.
 */
export const uncheckedNames = async (page: Page): Promise<string[]> =>
  page
    .locator("main ul:not([data-checked-list])")
    .first()
    .locator('button[aria-label^="Check off "]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.slice("Check off ".length)));

/** The sortable <li> wrapping an item. */
export const row = (page: Page, name: string) => page.locator("li", { has: checkbox(page, name) });

/** The row content the swipe translates. The delete pill is its sibling, and comes first. */
export const swipeSurface = (page: Page, name: string) => row(page, name).locator("> div").last();

/**
 * The delete pill, mounted only while a swipe is open. Narrowed to a `div` because the row's icons
 * carry `aria-hidden` too.
 */
export const deletePill = (page: Page, name: string) => row(page, name).locator("div[aria-hidden]");

interface Finger {
  id: number;
  x: number;
  y: number;
}

/**
 * Dispatches one touch event carrying real `Touch` objects, constructed in the page. Playwright's
 * own `locator.dispatchEvent("touchmove", …)` cannot drive the swipe: the touches it takes stay
 * plain objects, so the hook reads `clientX` as `undefined` and every move is a silent no-op — a
 * spring-back or cancel case written that way then passes with no gesture at all. `bubbles` is
 * load-bearing too, because the hook's end and cancel listeners sit on `window`.
 */
const dispatchTouch = async ({
  target,
  type,
  touches,
  changed = touches,
}: {
  target: Locator;
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel";
  touches: Finger[];
  changed?: Finger[];
}): Promise<void> =>
  target.evaluate(
    (el, args) => {
      const make = (f: Finger) =>
        new Touch({ identifier: f.id, target: el, clientX: f.x, clientY: f.y });
      const down = args.touches.map(make);
      el.dispatchEvent(
        new TouchEvent(args.type, {
          touches: down,
          targetTouches: down,
          changedTouches: args.changed.map(make),
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { type, touches, changed },
  );

/**
 * Puts one finger down on a row and returns the gesture. `move` takes deltas from the touchdown
 * point, which is the frame the hook measures in — under 8px in both axes stays below its axis lock
 * and moves nothing. `threshold` is how far left a release must have travelled to delete rather than
 * spring back.
 */
export const startSwipe = async ({
  page,
  name,
  id = 1,
}: {
  page: Page;
  name: string;
  id?: number;
}) => {
  const target = swipeSurface(page, name);
  const box = (await target.boundingBox())!;
  const start: Finger = { id, x: box.x + box.width - 8, y: box.y + box.height / 2 };
  let at = start;
  await dispatchTouch({ target, type: "touchstart", touches: [start] });
  return {
    threshold: box.width / 3,
    move: async ({ dx = 0, dy = 0 }: { dx?: number; dy?: number }): Promise<void> => {
      at = { id, x: start.x + dx, y: start.y + dy };
      await dispatchTouch({ target, type: "touchmove", touches: [at] });
    },
    release: async (): Promise<void> =>
      dispatchTouch({ target, type: "touchend", touches: [], changed: [at] }),
    /** A system interruption: an edge back-swipe, the notification shade, an app switch. */
    interrupt: async (): Promise<void> =>
      dispatchTouch({ target, type: "touchcancel", touches: [], changed: [at] }),
    /** A second finger landing elsewhere, which reaches the hook's window listener alone. */
    secondFinger: async (): Promise<void> => {
      const other: Finger = { id: id + 1, x: 20, y: 20 };
      await dispatchTouch({
        target: page.locator("header"),
        type: "touchstart",
        touches: [at, other],
        changed: [other],
      });
    },
    transform: async (): Promise<string> => target.evaluate((el) => el.style.transform),
    transition: async (): Promise<string> => target.evaluate((el) => el.style.transition),
  };
};

interface Crossing {
  names: string[];
  /** Whether the sidebar was still in the document on the frame those animations were running. */
  mounted: boolean;
}

declare global {
  interface Window {
    sidebarAnimations?: Promise<Crossing>;
  }
}

/**
 * Arms a watcher for the crossing's animations — the sidebar's slide and the header's, which carries
 * the title — and returns the read. It has to be armed before the resize that starts them: they live
 * around 250ms, so a list read afterwards is empty and an assertion made there passes with no
 * animation at all. Resolves on the first frame that has one, or empty after two seconds, which is
 * the shape a reduced-motion case needs, where nothing is the expected answer. Matched by name, so
 * an unrelated animation (the sync badge's own pulse) can't resolve it early.
 */
export const watchSidebar = async (page: Page): Promise<() => Promise<Crossing>> => {
  await page.evaluate(() => {
    window.sidebarAnimations = new Promise((resolve) => {
      const deadline = performance.now() + 2000;
      const tick = () => {
        const names = document
          .getAnimations()
          .flatMap((a) =>
            a instanceof CSSAnimation && /^(sidebar|header)-(in|out)$/.test(a.animationName)
              ? [a.animationName]
              : [],
          );
        const mounted = document.querySelector("[data-list-sidebar]") !== null;
        if (names.length > 0 || performance.now() > deadline) resolve({ names, mounted });
        else requestAnimationFrame(tick);
      };
      tick();
    });
  });
  return async () =>
    page.evaluate(async () => (await window.sidebarAnimations) ?? { names: [], mounted: false });
};

/** Whether a crossing is still in flight, which is what the sidebar's two animations key on. */
export const crossing = async (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.hasAttribute("data-crossing"));

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
