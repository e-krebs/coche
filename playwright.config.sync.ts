import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Sync e2e tier: real Clerk dev instance + local wrangler Worker (needs real network, unlike the hermetic local-only tier).
// CLERK_SECRET_KEY loads from gitignored .dev.vars locally / CI env; dotenv won't override an already-set value, and Playwright re-imports this config per worker so every worker sees it.
loadEnv({ path: ".dev.vars" });
loadEnv({ path: ".env.e2e-sync" });
// @clerk/testing reads CLERK_PUBLISHABLE_KEY (not the VITE_-prefixed one).
process.env.CLERK_PUBLISHABLE_KEY ||= process.env.VITE_CLERK_PUBLISHABLE_KEY;

const CI = !!process.env.CI;
const APP_PORT = 5200; // distinct from local-only 5199 so a stale preview isn't reused
const WORKER_PORT = 8787; // matches VITE_SYNC_URL in .env.e2e-sync
const APP_ORIGIN = `http://localhost:${APP_PORT}`;

export default defineConfig({
  testDir: "./e2e/sync",
  // Serial: single wrangler dev + shared real Clerk instance; multi-context specs — calm beats racing.
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/sync/global-setup.ts",
  use: {
    baseURL: APP_ORIGIN,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // DEV=true routes to the plain DO namespace (jurisdiction('eu') throws in workerd) and allows the preview origin (token's azp). Secrets load from .dev.vars.
      command: `nubx wrangler dev --port ${WORKER_PORT} --var DEV:true --var ALLOWED_ORIGINS:${APP_ORIGIN} --var CLERK_AUTHORIZED_PARTIES:${APP_ORIGIN} --persist-to .wrangler/e2e-state`,
      port: WORKER_PORT, // TCP-ready check — the Worker has no 2xx health route
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: { WRANGLER_SEND_METRICS: "false" },
    },
    {
      command: `nub run build:e2e:sync && nub run preview --port ${APP_PORT} --strictPort`,
      url: APP_ORIGIN,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
