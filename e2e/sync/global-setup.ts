import { clerkSetup } from "@clerk/testing/playwright";

/**
 * clerkSetup puts a Clerk Testing Token (bypasses bot detection) into process.env for spawned
 * workers to inherit.
 */
const globalSetup = async (): Promise<void> => {
  await clerkSetup({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY });
};

export default globalSetup;
