import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { query } from "./db";

/**
 * Per-IP limit for public actions (orders, sign-ups), kept in Postgres
 * (`rate_hits`). Only a hash of the IP is stored. On Vercel the platform sets
 * x-forwarded-for; behind another host the header could be forged, so put the
 * limit in that host's proxy too.
 */
export async function tooManyRequests(scope: string, limit: number, windowMinutes: number): Promise<boolean> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${scope}:${createHash("sha256").update(ip).digest("hex")}`;
  const [row] = await query<{ n: number }>(
    "select count(*)::int as n from rate_hits where key = $1 and at > now() - make_interval(mins => $2)",
    [key, windowMinutes],
  );
  if (Number(row?.n ?? 0) >= limit) return true;
  await query("insert into rate_hits (key) values ($1)", [key]);
  // old hits are only needed for the longest window (one day)
  if (Math.random() < 0.02) await query("delete from rate_hits where at < now() - interval '1 day'");
  return false;
}
