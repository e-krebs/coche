const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

export const env = {
  clerkPublishableKey,
  // Worker base URL (e.g. http://localhost:8787). Unset => local-only, no sync.
  syncUrl: import.meta.env.VITE_SYNC_URL,
} as const;
