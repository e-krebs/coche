import { useEffect } from "react";
import { Outlet, createRootRoute, useRouter } from "@tanstack/react-router";
import { ClerkProvider } from "@clerk/clerk-react";
import { dark as darkTheme } from "@clerk/themes";
import { enUS, frFR } from "@clerk/localizations";
import { env } from "client/env";
import { useMediaQuery } from "client/components/media";
import { useSignOutTeardown } from "client/store/teardown";
import { usePersistedLocale } from "client/i18n/localeStore";

// Same-origin clerk-js: the Vite plugin mirrors @clerk/clerk-js's browser dist under this path in
// both dev and build; the loader resolves its code-split chunks relative to this URL.
const CLERK_JS_URL = "/clerk-js/clerk.browser.js";

/** Follow prefers-color-scheme so Clerk's menu/sign-in aren't a white card on a dark app. */
const PREFERS_DARK = "(prefers-color-scheme: dark)";

const TeardownWatcher = () => {
  useSignOutTeardown();
  return null;
};

const RootComponent = () => {
  const router = useRouter();
  const prefersDark = useMediaQuery(PREFERS_DARK);
  const locale = usePersistedLocale();

  // At the root so every screen gets the right lang, not just the list; main.tsx seeds it before
  // mount, this keeps it in sync.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <ClerkProvider
      publishableKey={env.clerkPublishableKey}
      clerkJSUrl={CLERK_JS_URL}
      telemetry={{ disabled: true }}
      signInUrl="/sign-in"
      afterSignOutUrl="/sign-in"
      localization={locale === "fr" ? frFR : enUS}
      appearance={{
        theme: prefersDark ? darkTheme : undefined,
        variables: { colorPrimary: prefersDark ? "#fcd34d" : "#b7791f" },
      }}
      routerPush={(to) => {
        router.history.push(to);
      }}
      routerReplace={(to) => {
        router.history.replace(to);
      }}
    >
      <TeardownWatcher />
      <Outlet />
    </ClerkProvider>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
