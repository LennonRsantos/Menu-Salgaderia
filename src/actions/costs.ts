"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { iso, query, transaction } from "@/lib/db";
import { loadRecipes } from "@/lib/costs-db";
import type { CostInput, CostInputPrice, CostSettings, OperatingExpense, Profile, ProductCost } from "@/types";
import type { MenuActionResult } from "./menu";

// Admin only. Costs never show on the public menu, so nothing here refreshes it.

const UUID = z.uuid("Item não encontrado.");
const money = z.number({ error: "Informe o valor." }).finite().min(0, "O valor não pode ser negativo.").max(100000, "Valor alto demais.");

const FK_MESSAGES: Record<string, string> = {
  product_cost_lines_input_id_fkey: "Insumo usado em fichas técnicas. Tire ele das fichas antes de excluir.",
  product_costs_product_id_fkey: "Produto não encontrado. Recarregue a página.",
};

const fail = (e: unknown, fk?: string): { ok: false; error: string } => {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
  const pgError = e as { code?: string; constraint?: string };
  if (pgError?.code === "23503") {
    return { ok: false, error: fk ?? FK_MESSAGES[pgError.constraint ?? ""] ?? "Registro ligado a outro dado." };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." };
};

async function adminWrite<T>(fn: (profile: Profile) => Promise<T>, fk?: string): Promise<MenuActionResult<T>> {
  try {
    const profile = await requireAdmin();
    return { ok: true, data: await fn(profile) };
  } catch (e) {
    return fail(e, fk);
  }
}

const userName = (p: Profile) => p.full_name || p.email;

/** Menu products as the Custos page lists them. */
export interface CostProduct {
  id: string;
  name: string;
  price: number;
  category_id: string;
  category: string;
  is_visible: boolean;
}

export interface CostsData {
  inputs: CostInput[];
  recipes: ProductCost[];
  products: CostProduct[];
  expenses: OperatingExpense[];
  settings: CostSettings;
  /** Units sold in the last 30 days (not cancelled): the default base for sharing expenses. */
  sold_last_30: number;
}

const INPUT_COLUMNS = "id, name, kind, unit, package_size, package_price, supplier, updated_at";
const EXPENSE_COLUMNS = "id, name, category, amount, recurring, to_char(date, 'YYYY-MM-DD') as date, active, notes";

export async function fetchCosts(): Promise<MenuActionResult<CostsData>> {
  try {
    await requireAdmin();
    const [inputs, recipes, products, expenses, [settings], [sold]] = await Promise.all([
      query<Omit<CostInput, "updated_at"> & { updated_at: Date }>(`select ${INPUT_COLUMNS} from cost_inputs order by name`),
      loadRecipes(query),
      query<CostProduct>(
        `select p.id, p.name, p.price, p.category_id, c.name as category, p.is_visible
           from products p join categories c on c.id = p.category_id
          order by c.position, c.name, p.position, p.name`,
      ),
      query<OperatingExpense>(`select ${EXPENSE_COLUMNS} from operating_expenses order by recurring desc, date desc nulls first, name`),
      query<CostSettings>("select monthly_units, target_margin, sales_pct from cost_settings where id = 1"),
      query<{ n: number }>(
        `select coalesce(sum((i->>'quantity')::int), 0) as n
           from orders o, jsonb_array_elements(o.items) i
          where o.status <> 'cancelled' and o.created_at >= now() - interval '30 days'`,
      ),
    ]);
    return {
      ok: true,
      data: {
        inputs: inputs.map((i) => ({ ...i, updated_at: iso(i.updated_at) ?? "" })),
        recipes,
        products,
        expenses,
        settings: settings ?? { monthly_units: null, target_margin: 60, sales_pct: 0 },
        sold_last_30: Number(sold?.n ?? 0),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- Insumos ---------- */

const inputSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(80),
  kind: z.enum(["ingredient", "packaging", "other"], { error: "Escolha o tipo." }),
  unit: z.string().trim().min(1, "Informe a unidade.").max(12),
  package_size: z.number({ error: "Informe o tamanho da embalagem." }).finite().positive("O tamanho precisa ser maior que zero.").max(10_000_000),
  package_price: money,
  supplier: z.string().trim().max(80).optional(),
});

/** Creates or edits an input; a new size or price goes to its price history. */
export async function saveCostInput(draft: z.input<typeof inputSchema> & { id?: string }) {
  return adminWrite((profile) => {
    const input = inputSchema.parse(draft);
    const values = [input.name, input.kind, input.unit, input.package_size, input.package_price, input.supplier || null];
    return transaction(async (db) => {
      let id: string;
      let changed = true;
      if (draft.id) {
        const old = (
          await db.query<{ package_size: number; package_price: number }>("select package_size, package_price from cost_inputs where id = $1 for update", [
            UUID.parse(draft.id),
          ])
        ).rows[0];
        if (!old) throw new Error("Insumo não encontrado.");
        changed = Number(old.package_size) !== input.package_size || Number(old.package_price) !== input.package_price;
        id = draft.id;
        await db.query(
          `update cost_inputs set name = $2, kind = $3, unit = $4, package_size = $5, package_price = $6, supplier = $7,
             updated_at = case when $8 then now() else updated_at end
           where id = $1`,
          [id, ...values, changed],
        );
      } else {
        const { rows } = await db.query<{ id: string }>(
          "insert into cost_inputs (name, kind, unit, package_size, package_price, supplier) values ($1, $2, $3, $4, $5, $6) returning id",
          values,
        );
        id = rows[0].id;
      }
      if (changed) {
        await db.query("insert into cost_input_prices (input_id, package_size, package_price, user_name) values ($1, $2, $3, $4)", [
          id,
          input.package_size,
          input.package_price,
          userName(profile),
        ]);
      }
      return id;
    });
  });
}

export async function deleteCostInput(id: string) {
  return adminWrite(async () => {
    await query("delete from cost_inputs where id = $1", [UUID.parse(id)]);
  }, FK_MESSAGES.product_cost_lines_input_id_fkey);
}

export async function fetchInputPrices(id: string): Promise<MenuActionResult<CostInputPrice[]>> {
  try {
    await requireAdmin();
    const rows = await query<Omit<CostInputPrice, "created_at"> & { created_at: Date }>(
      `select id, package_size, package_price, user_name, created_at from cost_input_prices
        where input_id = $1 order by created_at desc, id desc limit 30`,
      [UUID.parse(id)],
    );
    return { ok: true, data: rows.map((r) => ({ ...r, created_at: iso(r.created_at) ?? "" })) };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- Fichas técnicas ---------- */

const lineSchema = z.union([
  z.object({
    input_id: UUID,
    quantity: z.number().finite().positive("Informe a quantidade de cada insumo.").max(10_000_000),
    per: z.enum(["batch", "unit"]),
  }),
  z.object({
    input_id: z.null(),
    label: z.string().trim().min(1, "Dê um nome a cada custo extra.").max(60),
    amount: money,
    per: z.enum(["batch", "unit"]),
  }),
]);

const recipeSchema = z.object({
  yield: z.number({ error: "Informe o rendimento." }).finite().positive("O rendimento precisa ser maior que zero.").max(100000),
  include_fixed: z.boolean(),
  lines: z.array(lineSchema).max(60, "Linhas demais na ficha."),
});

/** Saves the ficha técnica; its lines are replaced as a whole. */
export async function saveProductCost(productId: string, draft: z.input<typeof recipeSchema>) {
  return adminWrite(() => {
    const id = UUID.parse(productId);
    const recipe = recipeSchema.parse(draft);
    return transaction(async (db) => {
      await db.query(
        `insert into product_costs (product_id, yield, include_fixed) values ($1, $2, $3)
         on conflict (product_id) do update set yield = excluded.yield, include_fixed = excluded.include_fixed, updated_at = now()`,
        [id, recipe.yield, recipe.include_fixed],
      );
      await db.query("delete from product_cost_lines where product_id = $1", [id]);
      const lines = recipe.lines;
      await db.query(
        `insert into product_cost_lines (product_id, input_id, label, quantity, amount, per, position)
         select $1, l.input_id, l.label, l.quantity, l.amount, l.per, l.n - 1
           from unnest($2::uuid[], $3::text[], $4::numeric[], $5::numeric[], $6::text[]) with ordinality as l(input_id, label, quantity, amount, per, n)`,
        [
          id,
          lines.map((l) => l.input_id),
          lines.map((l) => ("label" in l ? l.label : null)),
          lines.map((l) => ("quantity" in l ? l.quantity : null)),
          lines.map((l) => ("amount" in l ? l.amount : null)),
          lines.map((l) => l.per),
        ],
      );
    });
  }, "Um insumo escolhido foi excluído. Feche e abra a ficha de novo.");
}

export async function deleteProductCost(productId: string) {
  return adminWrite(async () => {
    await query("delete from product_costs where product_id = $1", [UUID.parse(productId)]);
  });
}

/* ---------- Despesas ---------- */

const expenseSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome.").max(80),
    category: z.enum(["gas", "energy", "water", "rent", "staff", "internet", "marketing", "taxes", "maintenance", "other"], { error: "Escolha a categoria." }),
    amount: money,
    recurring: z.boolean(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.").nullable(),
    active: z.boolean(),
    notes: z.string().trim().max(200).optional(),
  })
  .refine((e) => e.recurring || e.date, { message: "Informe a data da despesa.", path: ["date"] });

export async function saveExpense(draft: z.input<typeof expenseSchema> & { id?: string }) {
  return adminWrite(async () => {
    const e = expenseSchema.parse(draft);
    const values = [e.name, e.category, e.amount, e.recurring, e.recurring ? null : e.date, e.recurring ? e.active : true, e.notes || null];
    if (draft.id) {
      const rows = await query(
        "update operating_expenses set name = $2, category = $3, amount = $4, recurring = $5, date = $6, active = $7, notes = $8 where id = $1 returning id",
        [UUID.parse(draft.id), ...values],
      );
      if (!rows[0]) throw new Error("Despesa não encontrada.");
      return;
    }
    await query("insert into operating_expenses (name, category, amount, recurring, date, active, notes) values ($1, $2, $3, $4, $5, $6, $7)", values);
  });
}

export async function deleteExpense(id: string) {
  return adminWrite(async () => {
    await query("delete from operating_expenses where id = $1", [UUID.parse(id)]);
  });
}

const settingsSchema = z.object({
  monthly_units: z.number().int("Use um número inteiro de unidades.").positive("A produção precisa ser maior que zero.").max(10_000_000).nullable(),
  target_margin: z.number().int().min(1, "A meta vai de 1% a 95%.").max(95, "A meta vai de 1% a 95%."),
  sales_pct: z.number().finite().min(0, "Os impostos vão de 0% a 50%.").max(50, "Os impostos vão de 0% a 50%."),
});

export async function saveCostSettings(draft: CostSettings) {
  return adminWrite(async () => {
    const s = settingsSchema.parse(draft);
    await query(
      `insert into cost_settings (id, monthly_units, target_margin, sales_pct) values (1, $1, $2, $3)
       on conflict (id) do update set monthly_units = excluded.monthly_units, target_margin = excluded.target_margin, sales_pct = excluded.sales_pct`,
      [s.monthly_units, s.target_margin, s.sales_pct],
    );
  });
}
