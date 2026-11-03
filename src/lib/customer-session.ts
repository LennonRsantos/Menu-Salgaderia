import "server-only";
import { query } from "./db";
import { isAuthConfigured, neonAuth } from "./neon-auth";

/** Signed-in user id, only when it belongs to a customer account (staff sessions don't count). */
export async function currentCustomerId(): Promise<string | null> {
  if (!isAuthConfigured) return null;
  try {
    const { data } = await neonAuth().getSession();
    const userId = data?.user?.id;
    if (!userId) return null;
    const [row] = await query<{ user_id: string }>("select user_id from customer_accounts where user_id = $1", [userId]);
    return row?.user_id ?? null;
  } catch {
    return null;
  }
}
