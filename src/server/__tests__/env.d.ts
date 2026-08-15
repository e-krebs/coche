/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { Env as ServerEnv } from "server/env";

// cloudflare:test's env is the global Cloudflare.Env; the Worker hand-rolls Env in env.ts, so
// bridge them here (test-only) for type-check.
declare global {
  namespace Cloudflare {
    interface Env extends ServerEnv {}
  }
}
