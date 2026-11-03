"use server";

import { z } from "zod";
import { iso, query } from "@/lib/db";
import { withoutCost } from "@/lib/orders";
import { REFERRAL_SOURCES } from "@/lib/customer";
import { currentCustomerId } from "@/lib/customer-session";
import { isAuthConfigured, neonAuth } from "@/lib/neon-auth";
import type { OrderAddress, OrderItem, OrderStatus } from "@/types";

export interface CustomerAccount {
  name: string;
  phone: string;
  email: string;
  birthday: string | null;
  referral_source: string | null;
  marketing_opt_in: boolean;
  addresses: OrderAddress[];
}

export interface MyOrder {
  code: number;
  public_token: string;
  status: OrderStatus;
  total: number;
  created_at: string;
  scheduled_for: string | null;
  items: OrderItem[];
}

type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => /^\d{10,11}$/.test(v), "Informe um WhatsApp válido com DDD.");
const birthdaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de aniversário inválida.")
  .refine((v) => v > "1900-01-01" && new Date(v) < new Date(), "Data de aniversário inválida.")
  .nullable();
const addressSchema = z.object({
  zip: z.string().max(9).nullable(),
  street: z.string().trim().min(1).max(120),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).nullable(),
  neighborhood: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  reference: z.string().trim().max(140).nullable(),
});

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(80),
  phone: phoneSchema,
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres.").max(100),
  birthday: birthdaySchema,
  referral_source: z.enum(REFERRAL_SOURCES).nullable(),
  marketing_opt_in: z.boolean(),
  privacy: z.literal(true, { error: "Aceite a Política de Privacidade para criar a conta." }),
});

const fail = (e: unknown): { ok: false; error: string } => {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
  console.error("customer action failed", e);
  return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." };
};

const ACCOUNT_COLUMNS =
  "name, phone, email, to_char(birthday, 'YYYY-MM-DD') as birthday, referral_source, marketing_opt_in, addresses";

export async function signUpCustomer(input: z.input<typeof signUpSchema>): Promise<Result> {
  try {
    if (!isAuthConfigured) return { ok: false, error: "Cadastro indisponível no momento." };
    const data = signUpSchema.parse(input);
    const [taken] = await query("select 1 from customer_accounts where phone = $1", [data.phone]);
    if (taken) return { ok: false, error: "Este WhatsApp já tem cadastro. Entre com seu e-mail e senha." };

    const { data: created, error } = await neonAuth().signUp.email({ email: data.email, password: data.password, name: data.name });
    if (error || !created?.user) {
      const code = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
      if (code.includes("exist")) return { ok: false, error: "Este e-mail já tem cadastro. Entre com sua senha." };
      if (code.includes("password")) return { ok: false, error: "Escolha uma senha mais forte (ao menos 8 caracteres)." };
      return { ok: false, error: "Não foi possível criar a conta. Tente novamente." };
    }

    await query(
      `insert into customer_accounts (user_id, name, phone, email, birthday, referral_source, marketing_opt_in, marketing_opt_in_at, privacy_accepted_at)
       values ($1, $2, $3, $4, $5, $6, $7, case when $7 then now() end, now())`,
      [created.user.id, data.name, data.phone, data.email, data.birthday, data.referral_source, data.marketing_opt_in],
    );
    // the phone-keyed customer base the panel reads
    await query(
      `insert into customers (phone, name) values ($1, $2)
       on conflict (phone) do update set name = excluded.name, updated_at = now()`,
      [data.phone, data.name],
    );
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function signInCustomer(email: string, password: string): Promise<Result> {
  try {
    if (!isAuthConfigured) return { ok: false, error: "Login indisponível no momento." };
    const { data, error } = await neonAuth().signIn.email({ email: String(email).trim().toLowerCase(), password: String(password) });
    if (error || !data?.user) {
      const banned = (error?.message ?? "").toLowerCase().includes("banned");
      if (error?.status === 429) return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." };
      return { ok: false, error: banned ? "Esta conta está desativada. Fale com a loja." : "E-mail ou senha incorretos." };
    }
    const [row] = await query("select 1 from customer_accounts where user_id = $1", [data.user.id]);
    if (!row) {
      await neonAuth()
        .signOut()
        .catch(() => {});
      return { ok: false, error: "Não encontramos um cadastro de cliente com este e-mail. Crie sua conta." };
    }
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function signOutCustomer() {
  await neonAuth()
    .signOut()
    .catch(() => {});
}

export async function getMyAccount(): Promise<CustomerAccount | null> {
  const userId = await currentCustomerId();
  if (!userId) return null;
  const [row] = await query<CustomerAccount>(`select ${ACCOUNT_COLUMNS} from customer_accounts where user_id = $1`, [userId]);
  return row ?? null;
}

const updateSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(80),
  phone: phoneSchema,
  birthday: birthdaySchema,
  referral_source: z.enum(REFERRAL_SOURCES).nullable(),
  marketing_opt_in: z.boolean(),
  addresses: z.array(addressSchema).max(5, "Guarde no máximo 5 endereços."),
});

export async function updateMyAccount(input: z.input<typeof updateSchema>): Promise<Result<CustomerAccount>> {
  try {
    const userId = await currentCustomerId();
    if (!userId) return { ok: false, error: "Entre na sua conta de novo." };
    const data = updateSchema.parse(input);
    const [taken] = await query("select 1 from customer_accounts where phone = $1 and user_id <> $2", [data.phone, userId]);
    if (taken) return { ok: false, error: "Este WhatsApp já está em outra conta." };
    const [row] = await query<CustomerAccount>(
      `update customer_accounts set name = $2, phone = $3, birthday = $4, referral_source = $5,
         marketing_opt_in_at = case when $6 and not marketing_opt_in then now() when not $6 then null else marketing_opt_in_at end,
         marketing_opt_in = $6, addresses = $7, updated_at = now()
       where user_id = $1 returning ${ACCOUNT_COLUMNS}`,
      [userId, data.name, data.phone, data.birthday, data.referral_source, data.marketing_opt_in, JSON.stringify(data.addresses)],
    );
    await query(
      `insert into customers (phone, name) values ($1, $2) on conflict (phone) do update set name = excluded.name, updated_at = now()`,
      [data.phone, data.name],
    );
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

/** Orders placed while signed in to this account (never orders matched only by phone). */
export async function getMyOrders(): Promise<Result<MyOrder[]>> {
  try {
    const userId = await currentCustomerId();
    if (!userId) return { ok: false, error: "Entre na sua conta de novo." };
    const rows = await query<Omit<MyOrder, "created_at" | "scheduled_for"> & { created_at: Date; scheduled_for: Date | null }>(
      `select code, public_token, status, total, created_at, scheduled_for, items
         from orders where customer_user_id = $1 order by created_at desc limit 30`,
      [userId],
    );
    return { ok: true, data: rows.map((r) => ({ ...r, items: withoutCost(r.items), created_at: iso(r.created_at) ?? "", scheduled_for: iso(r.scheduled_for) })) };
  } catch (e) {
    return fail(e);
  }
}
