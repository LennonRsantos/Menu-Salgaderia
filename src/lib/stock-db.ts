import "server-only";
import type { PoolClient } from "pg";
import type { StockReason } from "@/types";
import { round2 } from "./stock";

export interface Shortage {
  item_id: string;
  name: string;
  unit: string;
  available: number;
}

/**
 * Applies `deltas` (item id → amount; negative takes stock) and logs one
 * movement per item. Rows are locked in id order so concurrent orders queue
 * instead of overselling. With `check`, nothing changes and the first item
 * that would go below zero is returned.
 */
export async function applyStockDeltas(
  db: PoolClient,
  deltas: Map<string, number>,
  reason: StockReason,
  opts: { check?: boolean; orderId?: string; userName?: string | null; note?: string | null } = {},
): Promise<Shortage | null> {
  const entries = [...deltas].filter(([, d]) => d !== 0).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;
  const ids = entries.map(([id]) => id);

  const { rows } = await db.query<{ id: string; name: string; unit: string; quantity: number }>(
    "select id, name, unit, quantity from stock_items where id = any($1::uuid[]) order by id for update",
    [ids],
  );
  if (opts.check) {
    for (const [id, delta] of entries) {
      const row = rows.find((r) => r.id === id);
      if (row && round2(Number(row.quantity) + delta) < 0) return { item_id: id, name: row.name, unit: row.unit, available: Number(row.quantity) };
    }
  }

  const present = entries.filter(([id]) => rows.some((r) => r.id === id));
  if (present.length === 0) return null;
  const params = [present.map(([id]) => id), present.map(([, d]) => d)];
  await db.query(
    `update stock_items s set quantity = s.quantity + d.delta, updated_at = now()
       from unnest($1::uuid[], $2::numeric[]) as d(id, delta) where s.id = d.id`,
    params,
  );
  await db.query(
    `insert into stock_movements (item_id, delta, reason, order_id, user_name, note, unit_cost)
     select d.id, d.delta, $3, $4, $5, $6, s.cost
       from unnest($1::uuid[], $2::numeric[]) as d(id, delta) join stock_items s on s.id = d.id`,
    [...params, reason, opts.orderId ?? null, opts.userName ?? null, opts.note ?? null],
  );
  return null;
}
