import "server-only";
import type { Order, PublicOrder } from "@/types";
import { iso } from "./db";

export const ORDER_COLUMNS = `id, code, public_token, customer_name, customer_phone, address, fulfillment, payment_method,
  change_for, status, items, subtotal, delivery_fee, total, notes, scheduled_for, created_at, updated_at,
  accepted_at, dispatched_at, completed_at, cancelled_at`;

type Row = Record<string, unknown>;

export function orderFromRow(r: Row): Order {
  return {
    id: String(r.id),
    code: Number(r.code),
    public_token: String(r.public_token),
    customer_name: String(r.customer_name ?? ""),
    customer_phone: String(r.customer_phone ?? ""),
    address: (r.address as Order["address"]) ?? null,
    fulfillment: r.fulfillment as Order["fulfillment"],
    payment_method: r.payment_method as Order["payment_method"],
    change_for: r.change_for === null ? null : Number(r.change_for),
    status: r.status as Order["status"],
    subtotal: Number(r.subtotal),
    delivery_fee: Number(r.delivery_fee),
    total: Number(r.total),
    notes: (r.notes as string | null) ?? null,
    scheduled_for: iso(r.scheduled_for),
    created_at: iso(r.created_at) ?? "",
    updated_at: iso(r.updated_at) ?? "",
    accepted_at: iso(r.accepted_at),
    dispatched_at: iso(r.dispatched_at),
    completed_at: iso(r.completed_at),
    cancelled_at: iso(r.cancelled_at),
    order_items: (r.items as Order["order_items"]) ?? [],
  };
}

/** What the customer's tracking page may see: no phone, no internal ids. */
export function toPublicOrder(o: Order): PublicOrder {
  return {
    code: o.code,
    status: o.status,
    customer_name: o.customer_name,
    fulfillment: o.fulfillment,
    payment_method: o.payment_method,
    change_for: o.change_for,
    address: o.address,
    notes: o.notes,
    scheduled_for: o.scheduled_for,
    items: o.order_items.map((item) => {
      const copy = { ...item };
      delete copy.product_id;
      return copy;
    }),
    subtotal: o.subtotal,
    delivery_fee: o.delivery_fee,
    total: o.total,
    created_at: o.created_at,
    accepted_at: o.accepted_at,
    dispatched_at: o.dispatched_at,
    completed_at: o.completed_at,
    cancelled_at: o.cancelled_at,
  };
}
