"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { iso, query } from "@/lib/db";
import { COUPON_CODE, normalizeCode, type CouponKind } from "@/lib/coupons";

export interface Coupon {
  id: string;
  code: string;
  kind: CouponKind;
  value: number;
  max_uses: number | null;
  /** "YYYY-MM-DD": valid through this day (São Paulo). */
  expires_on: string;
  active: boolean;
  uses: number;
  created_at: string;
}

export interface CouponUse {
  order_code: number;
  customer_name: string;
  discount: number;
  created_at: string;
}

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
  if ((e as { code?: string })?.code === "23505") return { ok: false, error: "Já existe um cupom com este código." };
  return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." };
};

const COLUMNS = `c.id, c.code, c.kind, c.value::float as value, c.max_uses, to_char(c.expires_on, 'YYYY-MM-DD') as expires_on,
  c.active, c.created_at, (select count(*)::int from coupon_redemptions r where r.coupon_id = c.id) as uses`;

const toCoupon = (r: Omit<Coupon, "created_at"> & { created_at: Date }): Coupon => ({ ...r, created_at: iso(r.created_at) ?? "" });

export async function listCoupons(): Promise<Result<Coupon[]>> {
  try {
    await requireAdmin();
    const rows = await query<Omit<Coupon, "created_at"> & { created_at: Date }>(`select ${COLUMNS} from coupons c order by c.created_at desc`);
    return { ok: true, data: rows.map(toCoupon) };
  } catch (e) {
    return fail(e);
  }
}

const couponSchema = z
  .object({
    id: z.uuid().optional(),
    code: z.string().transform(normalizeCode).pipe(z.string().regex(COUPON_CODE, "O código deve ter de 3 a 20 letras ou números.")),
    kind: z.enum(["percent", "amount"]),
    value: z.number({ error: "Informe o valor do desconto." }).positive("Informe o valor do desconto.").max(100000),
    max_uses: z.number().int().min(1, "O limite deve ser ao menos 1.").max(1_000_000).nullable(),
    expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe até quando o cupom vale."),
    active: z.boolean(),
  })
  .refine((c) => c.kind !== "percent" || c.value <= 100, { message: "A porcentagem vai até 100%.", path: ["value"] });

/** Creates or updates a coupon. Once used, its code and discount stay as they were. */
export async function saveCoupon(input: z.input<typeof couponSchema>): Promise<Result<Coupon>> {
  try {
    await requireAdmin();
    const c = couponSchema.parse(input);
    if (c.id) {
      const [current] = await query<{ uses: number; code: string; kind: string; value: number }>(
        "select code, kind, value::float as value, (select count(*)::int from coupon_redemptions where coupon_id = $1) as uses from coupons where id = $1",
        [c.id],
      );
      if (!current) throw new Error("Cupom não encontrado.");
      if (current.uses > 0 && (current.code !== c.code || current.kind !== c.kind || current.value !== c.value)) {
        throw new Error("Este cupom já foi usado: crie outro para mudar o código ou o desconto.");
      }
      await query(
        `update coupons set code = $2, kind = $3, value = $4, max_uses = $5, expires_on = $6, active = $7 where id = $1`,
        [c.id, c.code, c.kind, c.value, c.max_uses, c.expires_on, c.active],
      );
    } else {
      const [row] = await query<{ id: string }>(
        `insert into coupons (code, kind, value, max_uses, expires_on, active) values ($1, $2, $3, $4, $5, $6) returning id`,
        [c.code, c.kind, c.value, c.max_uses, c.expires_on, c.active],
      );
      c.id = row.id;
    }
    const [saved] = await query<Omit<Coupon, "created_at"> & { created_at: Date }>(`select ${COLUMNS} from coupons c where c.id = $1`, [c.id]);
    return { ok: true, data: toCoupon(saved) };
  } catch (e) {
    return fail(e);
  }
}

export async function setCouponActive(id: string, active: boolean): Promise<Result> {
  try {
    await requireAdmin();
    await query("update coupons set active = $2 where id = $1", [z.uuid().parse(id), Boolean(active)]);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/** Only a coupon nobody used; a used one is paused instead, so past orders keep their history. */
export async function deleteCoupon(id: string): Promise<Result> {
  try {
    await requireAdmin();
    const couponId = z.uuid().parse(id);
    const [used] = await query("select 1 from coupon_redemptions where coupon_id = $1 limit 1", [couponId]);
    if (used) throw new Error("Este cupom já foi usado. Pause-o em vez de excluir.");
    await query("delete from coupons where id = $1", [couponId]);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function couponUses(id: string): Promise<Result<CouponUse[]>> {
  try {
    await requireAdmin();
    const rows = await query<Omit<CouponUse, "created_at" | "discount"> & { created_at: Date; discount: string }>(
      `select o.code as order_code, o.customer_name, o.discount, r.created_at
         from coupon_redemptions r join orders o on o.id = r.order_id
        where r.coupon_id = $1 order by r.created_at desc limit 200`,
      [z.uuid().parse(id)],
    );
    return { ok: true, data: rows.map((r) => ({ ...r, discount: Number(r.discount), created_at: iso(r.created_at) ?? "" })) };
  } catch (e) {
    return fail(e);
  }
}
