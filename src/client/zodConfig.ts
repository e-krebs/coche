import { config } from "zod";

// zod's eval-availability probe (`new Function("")`) trips a script-src CSP violation on first
// use; `jitless` skips the probe entirely (zod/src/v4/core/util.ts). Imported first in main.tsx
// so this runs before any other module's top-level zod schemas get a chance to parse.
config({ jitless: true });
