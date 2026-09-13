# Check on a device

Recipe for opening the SPA from a phone or tablet on the same Wi-Fi, for a real touch/viewport pass
instead of a resized desktop window.

## Serve on the LAN

```sh
yarn dev --host
```

Vite prints a `Network:` URL alongside the usual `Local:` one — something like
`http://192.168.1.23:3000`. Open that URL on the device.

## Sign in

Sign in with Clerk as usual. If Clerk rejects the origin, add the LAN URL as an allowed origin in
the [Clerk dashboard](https://dashboard.clerk.com) under your application's settings.

## Limitations

- **No install pass.** The dev server injects no manifest and no service worker — see
  [vite.config.ts](../../vite.config.ts) — so a LAN URL can't be used to test the PWA install. Test
  that on a production build (`yarn build && yarn preview`) opened on `localhost`; `preview` also
  serves plain HTTP, and a LAN address over HTTP is not a secure context either, so the install pass
  stays a `localhost`-only check.
- **Sync needs more than the LAN flag.** `yarn sync:dev` binds to `localhost` by default. To sync
  from a device: run `yarn sync:dev --ip 0.0.0.0`, point `VITE_SYNC_URL` at the Worker's LAN address
  (e.g. `http://192.168.1.23:8787`), and set `ALLOWED_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` in
  `.dev.vars` to the app's LAN origin — the Worker checks the request `Origin` exactly (see
  [../explanation/auth-and-sync.md](../explanation/auth-and-sync.md)). Add the same LAN sync URLs to
  the `connect-src` in [../../csp/dev.headers](../../csp/dev.headers), which `yarn check:csp`
  compares against `VITE_SYNC_URL` — keep that local addition uncommitted.
