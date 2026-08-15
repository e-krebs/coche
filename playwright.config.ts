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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `nub run build:e2e && nub run preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
