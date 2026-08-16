# 0001. Drop TanStack Start (SSR) for a static TanStack Router SPA

## Status

Accepted

## Context

The repo started as a TanStack Start (SSR) + Clerk scaffold. Once auth moves fully client-side
(Clerk React SDK) and data lives in TinyBase (client) + a Durable Object (server), no
server-side-rendering work remains — there's nothing left for SSR to buy. TanStack Start also has a
known SSR/SPA-mode breakage on Cloudflare Pages that a plain Router+Vite SPA sidesteps entirely.

## Decision

Drop `@tanstack/react-start` and SSR entirely. Use `@tanstack/react-router` (Router only) + Vite +
`@vitejs/plugin-react`, with `base: "/"` and a plain client entry (`src/client/main.tsx`). Deploy as
a static SPA on Cloudflare Pages with an `_redirects` SPA fallback.

## Consequences

- Simpler deploy target (Pages is static-only; no server runtime for the frontend).
- No SSR-specific data-fetching patterns to maintain — all data comes from the local TinyBase store
  and, once connected, the sync server.
- Auth becomes purely client-side: `@clerk/clerk-react` replaces `@clerk/tanstack-react-start`.
- Implemented in [../../src/client/routes/__root.tsx](../../src/client/routes/__root.tsx),
  [../../src/client/router.tsx](../../src/client/router.tsx), and
  [../../vite.config.ts](../../vite.config.ts).
