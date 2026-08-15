---
name: testing
description: Vitest conventions for this repo — setup(), no-mocking policy, and query helpers. Use when writing or editing test files (*.test.ts, __tests__/**, e2e/**).
---

# Testing

**Vitest** — a `client` project (jsdom) and a `server` project (`@cloudflare/vitest-pool-workers`).
Client tests use **@testing-library/react** + **user-event**, queried by accessible name. The
infrastructure catalog (projects, global setup, MSW server, DI seams, Playwright tiers) is
[docs/reference/testing.md](../../../docs/reference/testing.md); commands are in
[docs/how-to/run-the-tests.md](../../../docs/how-to/run-the-tests.md).

- **Parametrized `setup()`, not lifecycle hooks.** Each test file has a local `setup({…})` that
  arranges its state and returns the subject + handles; **no** `beforeEach`/`afterEach`/`beforeAll`/
  `afterAll` in individual test files. Cross-cutting cleanup lives once in the global setup's
  `afterEach`.
- **No mocking or hoisting** — no `vi.mock`/`vi.hoisted`/`vi.stubGlobal`/`vi.spyOn`. Instead:
  - **network** → **MSW** (the shared `msw/node` server; per-test handlers via `server.use(…)`;
    `onUnhandledRequest: "error"`) — the real `fetch` path runs, nothing is code-mocked;
  - **in-process seams** (a hook's return, e.g. Clerk `useAuth`) → **dependency injection**: take
    the value as a parameter and test the pure part with plain values — MSW can't reach a hook, and
    a real provider can't be driven offline;
  - **platform state** (`navigator.onLine`, scroll offset) → set it inside `setup()`.
  - `vi.fn()` is allowed **only** as a test double for a component's or hook's own callback props
    (asserting call args), never for a dependency.
- **No inline `screen.*` queries.** Each test file groups its queries in one local `ui` object —
  **getters** for fixed elements (`ui.field`, `ui.undo`), **methods** for name-parametrized ones
  (`ui.checkoff(name)`, `ui.rename(name)`), with `query*` variants where a test asserts *absence*
  (`queryBy…`, returns null). Tests read `ui.checkoff("Milk")`, never `screen.getByRole(...)`
  inline.
