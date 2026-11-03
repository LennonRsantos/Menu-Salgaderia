import "server-only";
import { createNeonAuth, type NeonAuth } from "@neon/auth/next/server";

// Managed Better Auth (Neon Auth). Users and sessions live in the `neon_auth`
// schema of the same branch; `staff` (see db/schema.sql) grants panel access.
export const isAuthConfigured = Boolean(
  process.env.NEON_AUTH_BASE_URL && (process.env.NEON_AUTH_COOKIE_SECRET?.length ?? 0) >= 32,
);

let instance: NeonAuth | undefined;

/** Created lazily so a build without auth env vars does not crash on import. */
export function neonAuth() {
  if (!isAuthConfigured) throw new Error("Login não configurado: faltam NEON_AUTH_BASE_URL e NEON_AUTH_COOKIE_SECRET no .env.local.");
  instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  });
  return instance;
}
