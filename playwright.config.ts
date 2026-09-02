import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;
const PORT = 5199;

// Production build + preview (not dev) so the PWA service worker is active for the offline cold-boot spec.
export default defineConfig({
  testDir: "./e2e/local",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  // Two shapes, because the app now has two. Until the responsive tiers landed this ran everything
  // at Desktop Chrome's 1280 — a phone-shaped app tested at a width it never had. Every spec runs
  // in both; the handful of cases that only hold at one width skip themselves on the other, rather
  // than a whole file being ignored here.
  projects: [
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `yarn build:e2e && yarn preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
