# Security policy

## Supported version

`main`, and only `main`. There are no releases or tags — whatever is deployed is the tip of `main`,
so a fix ships from there rather than being backported.

## Reporting a vulnerability

Report privately through
[GitHub's private vulnerability reporting](https://github.com/e-krebs/coche/security/advisories/new).

**Please don't open a public issue for a security problem.** Issues are enabled for ordinary bug
reports, and anything filed there is world-readable the moment it exists.

Expect a best-effort response: this is a side project, not a staffed product, and no response window
is promised.

## What's in scope

The parts worth looking at, with the reasoning behind each already written down:

| Area | Where it's documented |
|---|---|
| The `/ws-ticket` endpoint — origin check, ticket issuance and expiry | [docs/explanation/auth-and-sync.md](docs/explanation/auth-and-sync.md) |
| Clerk token verification on the Worker, and the cached-identity offline path | [docs/explanation/auth-and-sync.md](docs/explanation/auth-and-sync.md), [docs/adr/0005-offline-cached-identity.md](docs/adr/0005-offline-cached-identity.md) |
| Deterministic HMAC `listId` derivation — the sole membership check | [docs/adr/0006-deterministic-hmac-listid.md](docs/adr/0006-deterministic-hmac-listid.md) |
| The Content-Security-Policy and its build-time resolution | [docs/adr/0011-deployment-identifiers-out-of-repo.md](docs/adr/0011-deployment-identifiers-out-of-repo.md) |
| One Durable Object per `listId`, pinned to the EU | [docs/adr/0003-do-per-listid.md](docs/adr/0003-do-per-listid.md), [docs/adr/0004-eu-residency-cloudflare.md](docs/adr/0004-eu-residency-cloudflare.md) |

Out of scope: findings against Clerk or Cloudflare themselves — report those to
[Clerk](https://clerk.com/docs/security/overview) or
[Cloudflare](https://hackerone.com/cloudflare) directly.
