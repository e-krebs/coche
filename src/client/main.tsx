import "./zodConfig";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { effectiveLocale } from "./i18n/localeStore";
import "./styles.css";

// Own scroll restoration (ShoppingList restores before paint); the browser's default "auto"
// competes and nudges the page after load.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

// Initial <html lang> from the mirror (last chosen locale, else browser); ListView reconciles the
// synced value once mounted.
document.documentElement.lang = effectiveLocale();

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
