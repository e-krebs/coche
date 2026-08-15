import { z } from "zod";
import { verifyToken } from "@clerk/backend";
import { splitCsv } from "./auth";
import type { Env } from "./env";

const subSchema = z.union([
  z.object({ sub: z.string() }).transform((v) => v.sub),
  z.object({ data: z.object({ sub: z.string() }) }).transform((v) => v.data.sub),
]);

/**
 * Reads the subject from either claim shape: @clerk/backend@3 returns claims directly, not the
 * documented {data}.
 */
export const subjectFrom = (claims: unknown): string | null => {
  const parsed = subSchema.safeParse(claims);
  return parsed.success ? parsed.data : null;
};

/** Fail-closed; @clerk/backend@3 throws on bad tokens. */
export const verifyClerkUser = async (token: string, env: Env): Promise<string | null> => {
  const authorizedParties = splitCsv(env.CLERK_AUTHORIZED_PARTIES);
  // Fail-closed: an empty allowlist makes Clerk skip the azp check, accepting any app's tokens.
  if (authorizedParties.length === 0) return null;
  try {
    return subjectFrom(
      await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY, authorizedParties }),
    );
  } catch {
    return null;
  }
};
