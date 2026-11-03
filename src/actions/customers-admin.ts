"use server";

import { randomInt } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { iso, query } from "@/lib/db";
import { neonAuth } from "@/lib/neon-auth";
import type { OrderAddress, OrderStatus } from "@/types";

export type CustomerFilter = "all" | "account" | "guest" | "birthday" | "marketing" | "lost";
export type CustomerSort = "total" | "recent" | "name";

export interface CustomerRow {
  phone: string;
  name: string;
  email: string | null;
  birthday: string | null;
  referral_source: string | null;
  marketing_opt_in: boolean;
  has_account: boolean;
  has_notes: boolean;
  orders: number;
  total: number;
  first_order: string | null;
  last_order: string | null;
}

export interface CustomerDetail extends CustomerRow {
  staff_notes: string;
  marketing_opt_in_at: string | null;
  account_created_at: string | null;
  favorite: { name: string; quantity: number } | null;
  addresses: OrderAddress[];
  recent: { code: number; status: OrderStatus; total: number; created_at: string; items: string }[];
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Dados inválidos.") : e instanceof Error ? e.message : "Erro inesperado.",
});

// one row per phone: the customer base, its account (if any) and its non-cancelled orders
const BASE = `
  with agg as (
    select customer_phone as phone, count(*) as orders, sum(total) as total, min(created_at) as first_order, max(created_at) as last_order
      from orders where status <> 'cancelled' group by 1
  )
  select c.phone, coalesce(a.name, c.name) as name, a.email, to_char(a.birthday, 'YYYY-MM-DD') as birthday, a.referral_source,
         coalesce(a.marketing_opt_in, false) as marketing_opt_in, (a.user_id is not null) as has_account,
         coalesce(c.staff_notes, '') <> '' as has_notes,
         coalesce(g.orders, 0) as orders, coalesce(g.total, 0) as total, g.first_order, g.last_order,
         c.staff_notes, a.marketing_opt_in_at, a.created_at as account_created_at, a.addresses as account_addresses, a.user_id
    from customers c
    left join customer_accounts a on a.phone = c.phone
    left join agg g on g.phone = c.phone`;

const FILTER_SQL: Record<CustomerFilter, string> = {
  all: "true",
  account: "has_account",
  guest: "not has_account",
  birthday: "extract(month from birthday::date) = extract(month from now() at time zone 'America/Sao_Paulo')",
  marketing: "marketing_opt_in",
  lost: "orders > 0 and last_order < now() - interval '30 days'",
};
const SORT_SQL: Record<CustomerSort, string> = {
  total: "total desc, last_order desc nulls last",
  recent: "last_order desc nulls last",
  name: "name",
};

type Raw = CustomerRow & { first_order: Date | null; last_order: Date | null };
const toRow = (r: Raw): CustomerRow => ({
  phone: r.phone,
  name: r.name,
  email: r.email,
  birthday: r.birthday,
  referral_source: r.referral_source,
  marketing_opt_in: r.marketing_opt_in,
  has_account: r.has_account,
  has_notes: r.has_notes,
  orders: Number(r.orders),
  total: Number(r.total),
  first_order: iso(r.first_order),
  last_order: iso(r.last_order),
});

async function selectCustomers(q: string, filter: CustomerFilter, sort: CustomerSort) {
  const text = q.trim().slice(0, 80);
  const digits = text.replace(/\D/g, "");
  return query<Raw>(
    `select * from (${BASE}) x
      where (${FILTER_SQL[filter]})
        and ($1 = '' or name ilike '%' || $1 || '%' or coalesce(email, '') ilike '%' || $1 || '%' or ($2 <> '' and phone like '%' || $2 || '%'))
      order by ${SORT_SQL[sort]}
      limit 500`,
    [text, digits],
  );
}

export async function listCustomers(input: {
  q: string;
  filter: CustomerFilter;
  sort: CustomerSort;
}): Promise<Result<{ rows: CustomerRow[]; summary: { customers: number; accounts: number; birthdays: number; marketing: number } }>> {
  try {
    await requireAdmin();
    const filter = z.enum(["all", "account", "guest", "birthday", "marketing", "lost"]).parse(input.filter);
    const sort = z.enum(["total", "recent", "name"]).parse(input.sort);
    const [rows, [summary]] = await Promise.all([
      selectCustomers(String(input.q ?? ""), filter, sort),
      query<{ customers: number; accounts: number; birthdays: number; marketing: number }>(
        `select count(*) as customers, count(*) filter (where has_account) as accounts,
                count(*) filter (where ${FILTER_SQL.birthday}) as birthdays, count(*) filter (where marketing_opt_in) as marketing
           from (${BASE}) x`,
      ),
    ]);
    return { ok: true, data: { rows: rows.map(toRow), summary } };
  } catch (e) {
    return fail(e);
  }
}

export async function getCustomer(phone: string): Promise<Result<CustomerDetail>> {
  try {
    await requireAdmin();
    const p = z.string().regex(/^\d{10,13}$/, "Cliente não encontrado.").parse(phone);
    const [rows, recent, [favorite], legacy] = await Promise.all([
      query<Raw & { staff_notes: string | null; marketing_opt_in_at: Date | null; account_created_at: Date | null; account_addresses: OrderAddress[] | null }>(
        `select * from (${BASE}) x where phone = $1`,
        [p],
      ),
      query<{ code: number; status: OrderStatus; total: number; created_at: Date; items: string }>(
        `select code, status, total, created_at,
                (select string_agg((i->>'quantity') || '× ' || (i->>'product_name'), ', ') from jsonb_array_elements(items) i) as items
           from orders where customer_phone = $1 order by created_at desc limit 30`,
        [p],
      ),
      query<{ name: string; quantity: number }>(
        `select i->>'product_name' as name, sum((i->>'quantity')::int) as quantity
           from orders o, jsonb_array_elements(o.items) i
          where o.customer_phone = $1 and o.status <> 'cancelled'
          group by 1 order by quantity desc limit 1`,
        [p],
      ),
      query<{ address: OrderAddress }>(
        "select distinct on (address->>'street', address->>'number') address from customer_addresses where customer_phone = $1 order by address->>'street', address->>'number', created_at desc limit 5",
        [p],
      ),
    ]);
    const r = rows[0];
    if (!r) throw new Error("Cliente não encontrado.");
    const addresses = [...(r.account_addresses ?? []), ...legacy.map((l) => l.address)].filter(
      (a, i, all) => all.findIndex((b) => b.street === a.street && b.number === a.number && (b.complement ?? "") === (a.complement ?? "")) === i,
    );
    return {
      ok: true,
      data: {
        ...toRow(r),
        staff_notes: r.staff_notes ?? "",
        marketing_opt_in_at: iso(r.marketing_opt_in_at),
        account_created_at: iso(r.account_created_at),
        favorite: favorite ? { name: favorite.name, quantity: Number(favorite.quantity) } : null,
        addresses: addresses.slice(0, 8),
        recent: recent.map((o) => ({ ...o, total: Number(o.total), created_at: iso(o.created_at) ?? "" })),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCustomerNotes(phone: string, notes: string): Promise<Result<null>> {
  try {
    await requireAdmin();
    const p = z.string().regex(/^\d{10,13}$/).parse(phone);
    await query("update customers set staff_notes = $2, updated_at = now() where phone = $1", [p, String(notes ?? "").trim().slice(0, 1000) || null]);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// @neon/auth types `admin` as unknown on the server instance (see src/actions/staff.ts)
type AdminApi = { setUserPassword(input: { userId: string; newPassword: string }): Promise<{ error: { message?: string } | null }> };

/** Sets a temporary password on the customer's account and returns it once, for the manager to send. */
export async function resetCustomerPassword(phone: string): Promise<Result<string>> {
  try {
    await requireAdmin();
    const p = z.string().regex(/^\d{10,13}$/).parse(phone);
    const [account] = await query<{ user_id: string }>("select user_id from customer_accounts where phone = $1", [p]);
    if (!account) throw new Error("Este cliente não tem conta.");
    // no look-alike characters, easy to read over WhatsApp
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    const password = Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
    const { error } = await (neonAuth() as unknown as { admin: AdminApi }).admin.setUserPassword({ userId: account.user_id, newPassword: password });
    if (error) throw new Error("Não foi possível redefinir a senha. Confira se sua conta de gerente tem permissão no login.");
    return { ok: true, data: password };
  } catch (e) {
    return fail(e);
  }
}

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  // names come from the public order form: never let Excel read one as a formula
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (";" separated, for Excel in pt-BR) of the customers matching the filter. */
export async function exportCustomersCsv(input: { q: string; filter: CustomerFilter; sort: CustomerSort }): Promise<Result<string>> {
  try {
    await requireAdmin();
    const filter = z.enum(["all", "account", "guest", "birthday", "marketing", "lost"]).parse(input.filter);
    const sort = z.enum(["total", "recent", "name"]).parse(input.sort);
    const rows = (await selectCustomers(String(input.q ?? ""), filter, sort)).map(toRow);
    const header = ["Nome", "WhatsApp", "E-mail", "Aniversário", "Aceita ofertas", "Conta", "Pedidos", "Total gasto", "Primeiro pedido", "Último pedido"];
    const date = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
    const lines = rows.map((r) =>
      [
        r.name,
        r.phone,
        r.email,
        r.birthday ? r.birthday.split("-").reverse().join("/") : "",
        r.marketing_opt_in ? "sim" : "não",
        r.has_account ? "sim" : "não",
        r.orders,
        r.total.toFixed(2).replace(".", ","),
        date(r.first_order),
        date(r.last_order),
      ]
        .map(csvCell)
        .join(";"),
    );
    // BOM so Excel opens accents correctly
    return { ok: true, data: "﻿" + [header.join(";"), ...lines].join("\n") };
  } catch (e) {
    return fail(e);
  }
}
