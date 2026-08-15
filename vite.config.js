import { createReadStream } from "node:fs";
import { cp, mkdir, readdir } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import tsconfigPaths from "vite-tsconfig-paths";
import { DEV_FILE, readCspFile } from "./scripts/csp.mjs";

const CLERK_JS_DIST = join(import.meta.dirname, "node_modules/@clerk/clerk-js/dist");
// The loader + its code-split browser chunks — skip source maps and the legacy/headless variants.
const isClerkBrowserFile = (name) => name.endsWith(".js") && name.includes("clerk.browser");

/**
 * Serves @clerk/clerk-js's browser dist same-origin under /clerk-js/ — dev via middleware, build by
 * copying the files into the output. The loader resolves its chunks relative to its own URL, so the
 * whole set must sit together at this one fixed path.
 */
const clerkJsSameOrigin = () => ({
  name: "clerk-js-same-origin",
  configureServer(server) {
    server.middlewares.use("/clerk-js", (req, res) => {
      const file = join(CLERK_JS_DIST, decodeURIComponent((req.url ?? "").split("?")[0]));
      // Trailing sep so a sibling like `dist-evil` can't satisfy the prefix; then serve only the
      // browser files (which also rejects a null-byte-suffixed name before createReadStream sees it).
      if (!file.startsWith(CLERK_JS_DIST + sep)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      if (!isClerkBrowserFile(basename(file))) {
        res.statusCode = 404;
        res.end();
        return;
      }
      let stream;
      try {
        stream = createReadStream(file);
      } catch {
        res.statusCode = 404; // a null byte in the path throws synchronously in the ReadStream ctor
        res.end();
        return;
      }
      stream.on("open", () => {
        res.setHeader("Content-Type", "text/javascript");
        stream.pipe(res);
      });
      stream.on("error", () => {
        res.statusCode = 404;
        res.end();
      });
    });
  },
  async writeBundle(options) {
    const destDir = join(options.dir ?? "dist", "clerk-js");
    await mkdir(destDir, { recursive: true });
    const names = (await readdir(CLERK_JS_DIST)).filter(isClerkBrowserFile);
    await Promise.all(names.map((name) => cp(join(CLERK_JS_DIST, name), join(destDir, name))));
  },
});

export default defineConfig(({ command }) => {
  // `command` is "serve" for both `vite dev` and `vite preview`, "build" for `vite build` — so
  // this applies the same dev CSP to both local servers and skips it for the prod build (whose
  // policy scripts/gen-headers.mjs resolves into dist/_headers after the bundle is written).
  const cspHeaders = {};
  if (command === "serve") {
    const { name, value } = readCspFile(DEV_FILE);
    cspHeaders[name] = value;
  }

  return {
    server: {
      port: 3000,
      headers: cspHeaders,
    },
    preview: {
      headers: cspHeaders,
    },
    base: "/",
    // tanstackRouter must precede viteReact so generated routes are transformed.
    plugins: [
      tsconfigPaths(),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routesDirectory: "src/client/routes",
        generatedRouteTree: "src/client/routeTree.gen.ts",
      }),
      viteReact(),
      tailwindcss(),
      clerkJsSameOrigin(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon-dark.svg",
          "favicon-light.svg",
          "favicon.png",
          "apple-touch-icon.png",
        ],
        manifest: {
          name: "Coche",
          short_name: "Coche",
          description: "Offline-first, per-user shopping list",
          theme_color: "#ffffff",
          background_color: "#f1f3f4",
          display: "standalone",
          start_url: "/",
          // "any"-purpose circles + a full-bleed maskable the OS masks to its own shape. Dev server injects no manifest — test the real install on a production build (yarn preview).
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
          // clerk-js is same-origin but runtime-cached, not precached — keeps the ~55 chunks out of
          // the install; offline boot rides the cached-identity gate, not clerk-js (see ADR 0005).
          globIgnores: ["clerk-js/**"],
          navigateFallback: "/index.html",
          runtimeCaching: [
            {
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && url.pathname.startsWith("/clerk-js/"),
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "clerk-js",
                cacheableResponse: { statuses: [0, 200] },
                expiration: { maxEntries: 60, maxAgeSeconds: 604800 },
              },
            },
          ],
        },
      }),
    ],
  };
});
