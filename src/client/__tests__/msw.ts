import { setupServer } from "msw/node";

/** Shared request-interception server; started/reset/closed globally in setup.ts. Tests register
 * their own handlers per case via `server.use(...)`. */
export const server = setupServer();
