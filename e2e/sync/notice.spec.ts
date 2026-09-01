import { test, expect, addItem, signIn } from "./fixtures";

/**
 * The only tier that can reach a loud sync state: the local tier runs with no sync URL at all, so it
 * is permanently "local only". Offline is the state a phone actually hits, and the notice is the only
 * channel that reaches a finger — the badge alone can't be hovered.
 */
test.describe("sync notice", () => {
  test("names the offline state and keeps the list writable", async ({
    page,
    context,
    makeUser,
  }) => {
    await signIn(page, await makeUser());
    // The badge, not its label: the accessible name and the hover pill both carry the same words.
    await expect(page.locator('span[data-status="synced"]')).toBeAttached();

    await context.setOffline(true);

    await expect(page.getByText("Offline — changes are saved on this device")).toBeVisible();
    // The claim the notice makes, asserted rather than trusted.
    await addItem(page, "Milk");
  });
});
