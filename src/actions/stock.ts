"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { iso, query, transaction } from "@/lib/db";
import { MENU_TAG } from "@/lib/menu";
import { round2 } from "@/lib/stock";
import { applyStockDeltas } from "@/lib/stock-db";
import type { Profile, StockCategory, StockItem, StockMovement, StockReason } from "@/types";
import type { MenuActionResult } from "./menu";

const UUID = z.uuid("Item não encontrado.");
const amount = z.number({ error: "Informe uma quantidade." }).finite().min(0, "A quantidade não pode ser negativa.").max(1_000_000);

const fail = (e: unknown): { ok: false; error: string } => {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
  const pgError = e as { code?: string; constraint?: string };
  if (pgError?.code === "23503") {
    return {
      ok: false,
      error:
        pgError.constraint === "stock_links_item_id_fkey"
          ? "Este item está ligado a produtos do cardápio. Tire o vínculo no produto antes de excluir."
          : "Mova ou exclua os itens desta categoria antes.",
    };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." };
};

/** Every stock write refreshes the public menu, where empty items show as sold out. */
async function stockWrite<T>(fn: (profile: Profile) => Promise<T>): Promise<MenuActionResult<T>> {
  try {
    const profile = await requireStaff();
    const data = await fn(profile);
    updateTag(MENU_TAG);
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

const userName = (p: Profile) => p.full_name || p.email;

export async function fetchStock(): Promise<MenuActionResult<{ categories: StockCategory[]; items: StockItem[] }>> {
  try {
    await requireStaff();
    const [categories, items, links] = await Promise.all([
      query<StockCategory>("select id, name, position from stock_categories order by position, name"),
      query<Omit<StockItem, "used_in">>("select id, category_id, name, unit, quantity, min_quantity, cost from stock_items order by name"),
      query<{ item_id: string; product: string; addon_id: string | null; addon_groups: { addons?: { id: string; name: string }[] }[] }>(
        `select l.item_id, p.name as product, l.addon_id, p.addon_groups
           from stock_links l join products p on p.id = l.product_id order by p.position, p.name`,
      ),
    ]);
    const usedIn = (itemId: string) =>
      links
        .filter((l) => l.item_id === itemId)
        .map((l) => {
          const addon = l.addon_id ? l.addon_groups.flatMap((g) => g.addons ?? []).find((a) => a.id === l.addon_id) : null;
          return addon ? `${l.product} (${addon.name})` : l.product;
        });
    return { ok: true, data: { categories, items: items.map((i) => ({ ...i, used_in: usedIn(i.id) })) } };
  } catch (e) {
    return fail(e);
  }
}

const itemSchema = z.object({
  category_id: UUID,
  name: z.string().trim().min(1, "Informe o nome.").max(80),
  unit: z.string().trim().min(1, "Informe a unidade.").max(12),
  min_quantity: amount,
  cost: z.number({ error: "Informe o custo." }).finite().min(0, "O custo não pode ser negativo.").max(100000),
});

/** Creates or edits an item. The quantity only changes through movements; a new item may start with one. */
export async function saveStockItem(draft: {
  id?: string;
  category_id: string;
  name: string;
  unit: string;
  min_quantity: number;
  cost: number;
  initial_quantity?: number;
}) {
  return stockWrite(async (profile) => {
    const item = itemSchema.parse(draft);
    if (draft.id) {
      const rows = await query(
        "update stock_items set category_id = $2, name = $3, unit = $4, min_quantity = $5, cost = $6, updated_at = now() where id = $1 returning id",
        [UUID.parse(draft.id), item.category_id, item.name, item.unit, item.min_quantity, item.cost],
      );
      if (!rows[0]) throw new Error("Item não encontrado.");
      return;
    }
    const initial = round2(amount.parse(draft.initial_quantity ?? 0));
    await transaction(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        "insert into stock_items (category_id, name, unit, min_quantity, cost) values ($1, $2, $3, $4, $5) returning id",
        [item.category_id, item.name, item.unit, item.min_quantity, item.cost],
      );
      await applyStockDeltas(db, new Map([[rows[0].id, initial]]), "adjust", { userName: userName(profile), note: "Estoque inicial" });
    });
  });
}

export async function deleteStockItem(id: string) {
  return stockWrite(async () => {
    await query("delete from stock_items where id = $1", [UUID.parse(id)]);
  });
}

/** "restock" adds `value`; "adjust" sets the counted quantity and logs the difference. */
export async function moveStock(itemId: string, kind: "restock" | "adjust", value: number, note?: string) {
  return stockWrite(async (profile) => {
    const id = UUID.parse(itemId);
    const n = round2(amount.parse(value));
    const reason = z.enum(["restock", "adjust"]).parse(kind) satisfies StockReason;
    if (reason === "restock" && n <= 0) throw new Error("Informe quanto entrou.");
    await transaction(async (db) => {
      const row = (await db.query<{ quantity: number }>("select quantity from stock_items where id = $1 for update", [id])).rows[0];
      if (!row) throw new Error("Item não encontrado.");
      const delta = reason === "restock" ? n : round2(n - Number(row.quantity));
      await applyStockDeltas(db, new Map([[id, delta]]), reason, { userName: userName(profile), note: note?.trim().slice(0, 200) || null });
    });
  });
}

export async function fetchMovements(itemId?: string): Promise<MenuActionResult<StockMovement[]>> {
  try {
    await requireStaff();
    const rows = await query<Omit<StockMovement, "created_at"> & { created_at: Date }>(
      `select m.id, m.item_id, i.name as item_name, i.unit, m.delta, m.reason, o.code as order_code, m.user_name, m.note, m.created_at
         from stock_movements m
         join stock_items i on i.id = m.item_id
         left join orders o on o.id = m.order_id
        where $1::uuid is null or m.item_id = $1
        order by m.created_at desc, m.id desc
        limit 100`,
      [itemId ? UUID.parse(itemId) : null],
    );
    return { ok: true, data: rows.map((r) => ({ ...r, created_at: iso(r.created_at) ?? "" })) };
  } catch (e) {
    return fail(e);
  }
}

const categoryName = z.string().trim().min(1, "Informe o nome.").max(60);

export async function createStockCategory(name: string) {
  return stockWrite(async () => {
    await query("insert into stock_categories (name, position) values ($1, (select coalesce(max(position), 0) + 1 from stock_categories))", [
      categoryName.parse(name),
    ]);
  });
}

export async function updateStockCategory(id: string, patch: { name?: string }) {
  return stockWrite(async () => {
    await query("update stock_categories set name = $2 where id = $1", [UUID.parse(id), categoryName.parse(patch.name)]);
  });
}

export async function deleteStockCategory(id: string) {
  return stockWrite(async () => {
    await query("delete from stock_categories where id = $1", [UUID.parse(id)]);
  });
}

/** Swaps two categories and renumbers all positions 1..n. */
export async function swapStockCategories(aId: string, bId: string) {
  return stockWrite(() =>
    transaction(async (db) => {
      const ids = (await db.query<{ id: string }>("select id from stock_categories order by position, name for update")).rows.map((r) => r.id);
      const a = ids.indexOf(UUID.parse(aId));
      const b = ids.indexOf(UUID.parse(bId));
      if (a < 0 || b < 0) throw new Error("Categoria não encontrada.");
      [ids[a], ids[b]] = [ids[b], ids[a]];
      await db.query(
        "update stock_categories c set position = o.n from unnest($1::uuid[]) with ordinality as o(id, n) where c.id = o.id",
        [ids],
      );
    }),
  );
}
