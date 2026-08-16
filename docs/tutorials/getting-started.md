# Getting started

This tutorial takes you from a fresh clone to a working Coche app on your machine: you'll sign in,
add a few items, and see them survive a reload. It stops there — syncing across devices and
deploying are separate topics, linked at the end.

## Prerequisites

- **Node 24** and **Yarn 4** via Corepack. Node 24 is pinned in [.nvmrc](../../.nvmrc) and is a hard
  requirement, not a suggestion: the build scripts are TypeScript that `node` executes directly, and
  an older Node refuses them (see
  [../adr/0012-typescript-build-scripts.md](../adr/0012-typescript-build-scripts.md)). With `nvm`,
  `nvm use` in the clone picks it up. Yarn's version is pinned in
  [package.json](../../package.json)'s `packageManager` field (`yarn@4.17.1`); Corepack reads that
  field and fetches the matching Yarn for you.
- **A free [Clerk](https://clerk.com) account.** Coche uses Clerk for sign-in even when you never
  turn on sync — see [Sign in](#sign-in) below for why.

## Clone and install

```sh
git clone https://github.com/e-krebs/coche.git
cd coche
corepack enable
yarn
```

`corepack enable` makes the `yarn` command resolve to the pinned Yarn 4 (Berry) instead of whatever
Yarn Classic your system may have. `yarn` with no arguments installs dependencies.

## Set your Clerk publishable key

1. In the [Clerk dashboard](https://dashboard.clerk.com), create an application.
2. Open **API Keys** and copy the **Publishable key** (it starts with `pk_test_…` for a
   development instance).
3. Copy the sample env file and paste the key in:

   ```sh
   cp .env.sample .env
   ```

   Edit `.env` and set:

   ```
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_…
   ```

Leave `VITE_SYNC_URL` unset. [src/client/env.ts](../../src/client/env.ts) reads it as
`env.syncUrl`, and unset means **local-only**: the app never attempts to reach a sync server, which
is exactly what this tutorial covers.

`VITE_CLERK_PUBLISHABLE_KEY` itself isn't optional: [src/client/env.ts](../../src/client/env.ts)
throws `Missing VITE_CLERK_PUBLISHABLE_KEY` at startup if it's blank, so the app refuses to boot
without it rather than failing silently later.

## Run the app

```sh
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

## Sign in

The app redirects a signed-out visitor to `/sign-in` and renders Clerk's embedded sign-in form
there. Sign up with any method Clerk offers for your app (email, social, etc.) — there's nothing
Coche-specific to configure.

You need this first sign-in even though everything else in this tutorial runs local-only. Coche
caches your Clerk user id in `localStorage`
([src/client/store/identity.ts](../../src/client/store/identity.ts)) and uses it to key a
per-user IndexedDB database (`shopping-<userId>`, see
[src/client/store/store.ts](../../src/client/store/store.ts)). That cache is what lets the app
boot and work offline on later visits — but there's nothing to cache until you've signed in
online once. See [Offline identity](../explanation/auth-and-sync.md#offline-identity) for the full
mechanism.

## Add items and watch them persist

Once signed in you land on your list. The field at the top of the header both searches and adds:
type an item name and press the round add button (or Enter) to add it — see
[src/client/components/ShoppingList/index.tsx](../../src/client/components/ShoppingList/index.tsx)
and [ListHeader.tsx](../../src/client/components/ShoppingList/ListHeader.tsx) if you want to read
the code behind it. Add two or three items, then tap the circle next to one to check it off — it
moves into the checked section below.

Now reload the page. Your items, and the checked one, are still there. They're not held in memory
only — the store persists into IndexedDB on every change, and reloading re-hydrates from it instead
of starting empty.

**Optional:** turn off your network (devtools "offline", airplane mode, or unplug Wi-Fi) and reload
again. The app still boots and your list is still there and still editable — it's a local-first CRDT
store, not a cache in front of a server.

## Where to go next

This tutorial stops at a single device with local persistence. From here:

- **Sync across your own devices** — start the sync Worker locally with `yarn sync:dev` and point
  `VITE_SYNC_URL` at it. See [Auth & sync](../explanation/auth-and-sync.md) for how identity,
  tickets, and CRDT merging work together.
- **Deploy it** — see [Deployment](../how-to/deploy.md) for shipping the SPA to Cloudflare Pages
  and the sync server to a Cloudflare Worker + Durable Object.
- **Run the test suite** — see [Running the tests](../how-to/run-the-tests.md).
- **Understand the system as a whole** — see [Architecture](../explanation/architecture.md) for
  the full diagram, components, and design rationale.
