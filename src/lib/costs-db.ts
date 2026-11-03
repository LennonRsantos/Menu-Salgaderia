import "server-only";
import type { PoolClient, QueryResultRow } from "pg";
import type { CostInput, OrderItem, ProductCost } from "@/types";
import { round4, variableCost } from "./costs";

/** `query` from ./db, or a transaction client's query reduced to its rows. */
export type Run = <T extends QueryResultRow>(text: string, params?: unknown[]) => Promise<T[]>;

export const clientRun =
  (db: PoolClient): Run =>
  (text, params) =>
    db.query(text, params).then((r) => r.rows);

/** Fichas técnicas with their lines; every product when `productIds` is null. */
export async function loadRecipes(run: Run, productIds: string[] | null = null): Promise<ProductCost[]> {
  const rows = await run<Omit<ProductCost, "updated_at"> & { updated_at: Date }>(
    `select pc.product_id, pc.yield, pc.include_fixed, pc.updated_at,
            coalesce(jsonb_agg(jsonb_build_object('input_id', l.input_id, 'label', l.label, 'quantity', l.quantity, 'amount', l.amount, 'per', l.per)
                               order by l.position, l.id) filter (where l.id is not null), '[]'::jsonb) as lines
       from product_costs pc left join product_cost_lines l on l.product_id = pc.product_id
      where $1::uuid[] is null or pc.product_id = any($1::uuid[])
      group by pc.product_id`,
    [productIds],
  );
  return rows.map((r) => ({ ...r, yield: Number(r.yield), updated_at: r.updated_at.toISOString() }));
}

export async function loadInputPrices(run: Run) {
  const rows = await run<Pick<CostInput, "id" | "package_size" | "package_price">>("select id, package_size, package_price from cost_inputs");
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Variable cost of one unit of each order item, kept in the order so later
 * price changes don't rewrite past profit. The ficha técnica wins; without one,
 * the stock links of the product and of the chosen addons. Unknown: undefined.
 */
export async function orderItemCosts(run: Run, items: Pick<OrderItem, "product_id" | "addons">[]): Promise<(number | undefined)[]> {
  const ids = [...new Set(items.map((i) => i.product_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return items.map(() => undefined);
  const [recipes, inputs, links] = await Promise.all([
    loadRecipes(run, ids),
    loadInputPrices(run),
    run<{ product_id: string; addon_id: string | null; cost: number }>(
      `select l.product_id, l.addon_id, l.quantity * i.cost as cost
         from stock_links l join stock_items i on i.id = l.item_id where l.product_id = any($1::uuid[])`,
      [ids],
    ),
  ]);
  const byProduct = new Map(recipes.map((r) => [r.product_id, r]));
  return items.map((item) => {
    const recipe = item.product_id ? byProduct.get(item.product_id) : undefined;
    if (recipe) return variableCost(recipe, inputs).total;
    const addonIds = new Set(item.addons.map((a) => a.id));
    const cost = links
      .filter((l) => l.product_id === item.product_id && (l.addon_id === null || addonIds.has(l.addon_id)))
      .reduce((n, l) => n + Number(l.cost), 0);
    return cost > 0 ? round4(cost) : undefined;
  });
}
