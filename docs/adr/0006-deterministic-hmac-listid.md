# 0006. Deterministic HMAC-derived `listId`, not stored membership

## Status

Accepted

## Context

v1 ships one list per user, with no sharing. The system still needs a stable, non-guessable
`listId` to name the Durable Object and to scope the WS ticket. The two options are: derive it
deterministically from something already known (the user's id) with a server secret, or provision
and store a `listId` per user at signup and look it up on each request.

## Decision

Derive it: `listId = HMAC(serverSecret, userId)`. Nothing is stored or provisioned — the Worker
recomputes the same `listId` for the same user on every request, and authorization is simply "the
ticket was minted for *your* derived `listId`." No write to Clerk `publicMetadata`, no custom
membership claim, no provisioning step in v1.

## Consequences

- Zero provisioning: a brand-new user works on their very first `/ws-ticket` call with no signup
  side effect.
- Not guessable: knowing a `userId` doesn't reveal the `listId` without `serverSecret`.
- **Migration path to sharing.** This scheme has no concept of membership — it's fundamentally
  "one deterministic list per user." Shared lists require a *different* authorization model:
  either a stored membership roster (who may request a ticket for a given `listId`) layered on top
  of the existing DO, or a move to explicitly provisioned/stored `listId`s per list (decoupled from
  any single user). The intended path adds a stored-membership layer above the existing
  deterministic scheme rather than re-keying the Durable Object — the DO's identity (`listId`)
  doesn't need to change, only who is allowed to obtain a ticket for it.
- Compared to stored membership from day one: this trades away multi-owner/shared lists in v1 in
  exchange for no database of list ownership to stand up, secure, and migrate before the product
  even has a second list per user.
