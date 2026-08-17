import { test, expect, addItem, checkbox, uncheckedNames, field, row, signIn } from "./fixtures";

test.describe("sync-merge", () => {
  test("edits sync live between two contexts of the same user", async ({
    page,
    browser,
    makeUser,
  }) => {
    const user = await makeUser();
    await signIn(page, user);

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signIn(pageB, user);

    try {
      // A -> B
      await addItem(page, "Milk");
      await expect(checkbox(pageB, "Milk")).toBeVisible();

      // B -> A
      await addItem(pageB, "Bread");
      await expect(checkbox(page, "Bread")).toBeVisible();

      // Adding leaves focus in the add field, which disables dnd on the row; blur and wait before
      // clicking.
      await field(page).blur();
      await expect(row(page, "Milk")).toHaveAttribute("data-draggable", "true");
      await checkbox(page, "Milk").click();

      // Checking in A syncs to B: Milk leaves B's unchecked list.
      await expect.poll(async () => uncheckedNames(pageB)).toEqual(["Bread"]);
    } finally {
      await ctxB.close();
    }
  });
});
