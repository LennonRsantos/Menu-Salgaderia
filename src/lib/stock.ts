// Pure stock rules, shared by the order transaction, the public menu and the panel.

import type { PlaceOrderInput } from "./order-logic";
import type { Product, StockItem, StockLink } from "@/types";

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Amount of each stock item an order consumes: product links × quantity, plus chosen addons' links × quantity. */
export function stockNeeds(items: PlaceOrderInput["items"], links: StockLink[]): Map<string, number> {
  const needs = new Map<string, number>();
  for (const item of items) {
    const quantity = Number(item.quantity);
    const addonIds = new Set((Array.isArray(item.addon_ids) ? item.addon_ids : []).map(String));
    for (const link of links) {
      if (link.product_id !== String(item.product_id)) continue;
      if (link.addon_id !== null && !addonIds.has(link.addon_id)) continue;
      needs.set(link.item_id, round2((needs.get(link.item_id) ?? 0) + link.quantity * quantity));
    }
  }
  return needs;
}

export type StockStatus = "ok" | "low" | "out";

export function stockStatus(item: Pick<StockItem, "quantity" | "min_quantity">): StockStatus {
  if (item.quantity <= 0) return "out";
  return item.quantity <= item.min_quantity ? "low" : "ok";
}

/**
 * Public menu view: a product whose own links can't cover one unit is sold out,
 * and an addon whose links can't is hidden. A required group left without
 * options also sells the product out. When the store takes scheduled orders,
 * a sold-out product stays orderable for a later date (`stock_out`).
 */
export function applyStock(product: Product, links: (StockLink & { stock: number })[], scheduling = false): Product {
  const mine = links.filter((l) => l.product_id === product.id);
  if (mine.length === 0) return product;
  const short = (l: StockLink & { stock: number }) => l.stock < l.quantity;
  const addon_groups = product.addon_groups.map((g) => ({
    ...g,
    addons: g.addons.filter((a) => !mine.some((l) => l.addon_id === a.id && short(l))),
  }));
  const productShort = mine.some((l) => l.addon_id === null && short(l));
  const groupEmptied = addon_groups.some((g) => g.min_select > 0 && g.addons.filter((a) => a.is_available).length < g.min_select);
  const out = productShort || groupEmptied;
  // for a later date every option stays available; ordering now still hits the stock check
  if (scheduling) return { ...product, stock_out: out };
  return { ...product, addon_groups, is_available: product.is_available && !out };
}

export const formatQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",").replace(/,?0+$/, ""));
