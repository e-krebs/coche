import { test as base, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";
import { addItem, checkbox, field, row, uncheckedNames } from "../local/fixtures";

const backend = () => createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

// Clerk instance requires a password; sign-in still uses a backend-minted ticket, never this value.
const PASSWORD = "e2e-Test-Pw-8Kd2xQ!";

export interface TestUser {
  userId: string;
  email: string;
}

export const createTestUser = async (tag: string): Promise<TestUser> => {
  const email = `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}+clerk_test@example.com`;
  const user = await backend().users.createUser({
    emailAddress: [email],
    password: PASSWORD,
    skipPasswordChecks: true,
  });
  return { userId: user.id, email };
};

export const deleteTestUser = async (userId: string): Promise<void> => {
  await backend()
    .users.deleteUser(userId)
    .catch(() => {});
};

/**
 * Signs `page` in via a backend-minted ticket (no form). Don't navigate to "/" — the app routes
 * there client-side; a reload would drop the in-memory session. setupClerkTestingToken must run
 * before the first FAPI request so bot detection doesn't block it.
 */
export const signIn = async (page: Page, user: TestUser): Promise<void> => {
  await setupClerkTestingToken({ page });
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: user.email });
  await expect(field(page)).toBeVisible();
};

/** True when the shopping-<userId> IndexedDB replica exists. */
export const hasReplica = async (page: Page, userId: string): Promise<boolean> =>
  page.evaluate(async (uid) => {
    const dbs = await indexedDB.databases();
    return dbs.some((d) => d.name === `shopping-${uid}`);
  }, userId);

/**
 * Provisions fresh Clerk users per test (fresh listId => clean DO) and deletes them in teardown.
 */
export const test = base.extend<{ makeUser: (tag?: string) => Promise<TestUser> }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern here
  makeUser: async ({}, use) => {
    const created: string[] = [];
    await use(async (tag = "u") => {
      const user = await createTestUser(tag);
      created.push(user.userId);
      return user;
    });
    await Promise.all(created.map(async (id) => deleteTestUser(id)));
  },
});

export { expect, clerk, addItem, checkbox, field, row, uncheckedNames };
