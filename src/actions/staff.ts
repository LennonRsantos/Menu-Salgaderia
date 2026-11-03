"use server";

import { z } from "zod";
import { profileFromRow, requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { neonAuth } from "@/lib/neon-auth";
import { staffSchema } from "@/lib/validators";
import type { Profile, UserRole } from "@/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Accounts live in Neon Auth; the Better Auth "admin" role lets a manager call
// the admin API used here. `staff` holds the panel role and the active flag.
const authRole = (role: UserRole) => (role === "admin" ? "admin" : "user");

type AuthError = { code?: string; message?: string; status?: number } | null | undefined;
type AuthResult<T = unknown> = Promise<{ data: T | null; error: AuthError }>;

// @neon/auth 0.8 types `admin` as unknown on the server instance; these are the
// Better Auth admin endpoints it proxies (see the Neon Auth "Admin" guide).
interface AdminApi {
  createUser(input: { email: string; password: string; name: string; role: string }): AuthResult<{ user: { id: string } }>;
  updateUser(input: { userId: string; data: { name: string } }): AuthResult;
  setRole(input: { userId: string; role: string }): AuthResult;
  setUserPassword(input: { userId: string; newPassword: string }): AuthResult;
  banUser(input: { userId: string; banReason?: string }): AuthResult;
  unbanUser(input: { userId: string }): AuthResult;
  removeUser(input: { userId: string }): AuthResult;
}
const adminApi = () => (neonAuth() as unknown as { admin: AdminApi }).admin;

function authFail(error: AuthError): never {
  // codes come either normalized (user_already_exists) or raw from Better Auth
  // (USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL), so match loosely
  const code = (error?.code ?? "").toLowerCase();
  const message = (error?.message ?? "").toLowerCase();
  if (code.includes("already_exists") || code === "email_exists" || message.includes("already exists")) {
    throw new Error("Já existe uma conta com este e-mail.");
  }
  if (code === "weak_password" || code.includes("password_too_short")) throw new Error("A senha precisa ter ao menos 8 caracteres.");
  if (error?.status === 401 || error?.status === 403) {
    throw new Error("Sua conta não tem permissão de gerente no login. Rode npm run create-admin com seu e-mail.");
  }
  throw new Error(error?.message || "Erro no serviço de login.");
}

const fail = (error: unknown): ActionResult => {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos." };
  return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado." };
};

async function otherActiveAdmins(excludeId: string) {
  const [row] = await query<{ n: number }>("select count(*) as n from staff where role = 'admin' and active and user_id <> $1", [excludeId]);
  return Number(row?.n ?? 0);
}

export async function listStaff(): Promise<{ ok: true; staff: Profile[] } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const rows = await query<Parameters<typeof profileFromRow>[0]>("select * from staff order by created_at");
    return { ok: true, staff: rows.map(profileFromRow) };
  } catch (e) {
    return fail(e) as { ok: false; error: string };
  }
}

export async function createStaff(input: { full_name: string; email: string; password: string; role: UserRole }): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = staffSchema.parse(input);
    const { data: created, error } = await adminApi().createUser({
      email: data.email,
      password: data.password,
      name: data.full_name,
      role: authRole(data.role),
    });
    if (error || !created?.user) authFail(error);
    await query("insert into staff (user_id, full_name, email, role, active) values ($1, $2, $3, $4, true)", [
      created.user.id,
      data.full_name,
      data.email,
      data.role,
    ]);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  full_name: z.string().trim().min(2, "Informe o nome."),
  role: z.enum(["admin", "staff"]),
  active: z.boolean(),
  password: z.string().optional(),
});

export async function updateStaff(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  try {
    const me = await requireAdmin();
    const data = updateSchema.parse(input);
    if (data.password && data.password.length < 8) return { ok: false, error: "A senha precisa ter ao menos 8 caracteres." };

    const [current] = await query<{ role: UserRole; active: boolean }>("select role, active from staff where user_id = $1", [data.id]);
    if (!current) return { ok: false, error: "Conta não encontrada." };

    const losesAdmin = current.role === "admin" && current.active && (data.role !== "admin" || !data.active);
    if (losesAdmin) {
      if (data.id === me.id) return { ok: false, error: "Você não pode remover seu próprio acesso de gerente." };
      if ((await otherActiveAdmins(data.id)) === 0) return { ok: false, error: "É necessário manter ao menos um gerente ativo." };
    }

    const admin = adminApi();
    const check = ({ error }: { error?: AuthError }) => {
      if (error) authFail(error);
    };
    check(await admin.updateUser({ userId: data.id, data: { name: data.full_name } }));
    check(await admin.setRole({ userId: data.id, role: authRole(data.role) }));
    if (data.password) check(await admin.setUserPassword({ userId: data.id, newPassword: data.password }));
    if (data.active !== current.active) {
      // banning blocks sign-in and ends the account's open sessions
      check(data.active ? await admin.unbanUser({ userId: data.id }) : await admin.banUser({ userId: data.id, banReason: "Desativado no painel" }));
    }

    await query("update staff set full_name = $2, role = $3, active = $4 where user_id = $1", [data.id, data.full_name, data.role, data.active]);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteStaff(id: string): Promise<ActionResult> {
  try {
    const me = await requireAdmin();
    if (id === me.id) return { ok: false, error: "Você não pode excluir a própria conta." };

    const [target] = await query<{ role: UserRole; active: boolean }>("select role, active from staff where user_id = $1", [id]);
    if (target?.role === "admin" && target.active && (await otherActiveAdmins(id)) === 0) {
      return { ok: false, error: "É necessário manter ao menos um gerente ativo." };
    }

    const { error } = await adminApi().removeUser({ userId: id });
    if (error && error.code !== "user_not_found") authFail(error);
    await query("delete from staff where user_id = $1", [id]);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
