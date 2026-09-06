import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { tsconfigPaths: true },
        test: {
          name: "client",
          dir: "src/client",
          environment: "jsdom",
          setupFiles: ["./src/client/__tests__/setup.ts"],
          css: false,
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.toml" },
            miniflare: {
              bindings: {
                CLERK_SECRET_KEY: "sk_test_dummy",
                LIST_ID_SECRET: "test-list-secret",
                TICKET_SECRET: "test-ticket-secret",
                ALLOWED_ORIGINS: "http://localhost:3000",
                CLERK_AUTHORIZED_PARTIES: "http://localhost:3000",
                DEV: "true",
              },
            },
          }),
        ],
        resolve: { tsconfigPaths: true },
        test: {
          name: "server",
          dir: "src/server",
        },
      },
    ],
  },
});
