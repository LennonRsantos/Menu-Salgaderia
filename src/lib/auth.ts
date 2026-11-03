import "server-only";
import type { Profile } from "@/types";
import { iso, query } from "./db";
import { neonAuth } from "./neon-auth";

type StaffRow = { user_id: string; full_name: string; email: string; role: Profile["role"]; active: boolean; created_at: Date };

export function profileFromRow(r: StaffRow): Profile {
  return { id: r.user_id, full_name: r.full_name, email: r.email, role: r.role, active: r.active, created_at: iso(r.created_at) ?? "" };
}

export async function findStaff(userId: string) {
  const [row] = await query<StaffRow>("select * from staff where user_id = $1", [userId]);
  return row ? profileFromRow(row) : null;
}

/**
 * Data access layer for server actions and route handlers: reads the Neon Auth
 * session cookie, then re-reads the staff row on every call, so a deactivated
 * or demoted account loses access immediately.
 */
export async function requireStaff(): Promise<Profile> {
  const { data: session } = await neonAuth().getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Sessão expirada. Entre novamente.");
  const profile = await findStaff(userId);
  if (!profile?.active) throw new Error("Sua conta não tem acesso ao painel.");
  return profile;
}

export async function requireAdmin() {
  const profile = await requireStaff();
  if (profile.role !== "admin") throw new Error("Apenas o gerente pode fazer isso.");
  return profile;
}
