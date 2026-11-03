"use server";

import { findStaff, requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { neonAuth } from "@/lib/neon-auth";
import { pinsError } from "@/lib/nav";
import type { Profile } from "@/types";

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function signInStaff(email: string, password: string): Promise<SignInResult> {
  try {
    const { data, error } = await neonAuth().signIn.email({ email: String(email).trim().toLowerCase(), password: String(password) });
    if (error || !data?.user) {
      // the SDK normalizes Better Auth errors to lowercase codes (invalid_credentials…)
      const code = error?.code ?? "";
      const message = (error?.message ?? "").toLowerCase();
      return {
        ok: false,
        error:
          code === "invalid_credentials" || error?.status === 401
            ? "E-mail ou senha incorretos."
            : message.includes("banned")
              ? "Esta conta está desativada. Fale com o gerente."
              : code === "over_request_rate_limit" || error?.status === 429
                ? "Muitas tentativas. Aguarde alguns minutos."
                : code.startsWith("NETWORK_")
                  ? "Serviço de login indisponível. Confira NEON_AUTH_BASE_URL no .env.local."
                  : "Não foi possível entrar. Tente novamente.",
      };
    }
    const profile = await findStaff(data.user.id);
    if (!profile?.active) {
      await neonAuth().signOut();
      return { ok: false, error: "Sua conta não tem acesso ao painel." };
    }
    return { ok: true };
  } catch (e) {
    console.error("signInStaff failed", e);
    return { ok: false, error: "Não foi possível entrar. Tente novamente." };
  }
}

export async function signOutStaff() {
  await neonAuth()
    .signOut()
    .catch(() => {});
}

/** The signed-in staff profile, or null when signed out or without access. */
export async function getMyProfile(): Promise<{ profile: Profile | null; error?: string }> {
  try {
    return { profile: await requireStaff() };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    // a missing session or staff row is a normal "no access"; anything else is a connection problem
    if (message.startsWith("Sessão") || message.startsWith("Sua conta")) return { profile: null };
    console.error("getMyProfile failed", e);
    return { profile: null, error: "Não foi possível conectar ao banco de dados. Verifique a internet e o .env.local." };
  }
}

/** Saves the signed-in person's pinned pages; null goes back to the defaults. Only their own row. */
export async function saveNavPins(keys: string[] | null): Promise<SignInResult> {
  try {
    const profile = await requireStaff();
    const pins = keys === null ? null : (Array.isArray(keys) ? keys : []).map(String);
    const error = pins && pinsError(pins, profile.role);
    if (error) return { ok: false, error };
    await query("update staff set nav_pins = $2 where user_id = $1", [profile.id, pins]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível salvar os atalhos." };
  }
}
