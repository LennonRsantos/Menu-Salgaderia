"use server";

import { updateTag } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { iso, query, transaction } from "@/lib/db";
import { COUPON_CODE, couponDiscount, couponProblem, normalizeCode, type CouponKind, type CouponRule } from "@/lib/coupons";
import { spNow } from "@/lib/hours";
import { MENU_TAG, PRODUCT_COLUMNS, productFromRow, SETTINGS_COLUMNS, settingsFromRow, ZONES_SQL } from "@/lib/menu";
import { buildOrder, OrderError, type PlaceOrderInput } from "@/lib/order-logic";
import { canTransition } from "@/lib/order-status";
import { formatQty, stockNeeds } from "@/lib/stock";
import { clientRun, orderItemCosts } from "@/lib/costs-db";
import { currentCustomerId } from "@/lib/customer-session";
import { tooManyRequests } from "@/lib/rate-limit";
import { applyStockDeltas } from "@/lib/stock-db";
import type { DeliveryZone, OrderItem, OrderStatus, Product, StockLink } from "@/types";

/** `coupon`: the error is about the coupon, shown next to its field. */
export type PlaceOrderResult = { ok: true; code: number; public_token: string } | { ok: false; error: string; coupon?: boolean };

class CouponError extends OrderError {}

type CouponRow = CouponRule & { id: string };
const COUPON_SQL = "select id, kind, value::float as value, max_uses, to_char(expires_on, 'YYYY-MM-DD') as expires_on, active from coupons where code = $1";
// uses of the coupon in total, and by this customer (WhatsApp, or the signed-in account)
const COUPON_USES_SQL = `select count(*)::int as uses,
       count(*) filter (where customer_phone = $2 or ($3::text is not null and customer_user_id = $3))::int as mine
  from coupon_redemptions where coupon_id = $1`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public: anyone with the menu link can order. Every price, addon rule and
 * store rule is re-checked here inside a transaction (see buildOrder).
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  try {
    // orders are free to place and take stock at once: cap how many one network sends
    if (await tooManyRequests("order", 6, 10)) {
      return { ok: false, error: "Muitos pedidos em pouco tempo. Aguarde alguns minutos ou fale com a loja pelo WhatsApp." };
    }
    const productIds = [...new Set((input?.items ?? []).map((i) => String(i?.product_id ?? "")).filter((id) => UUID.test(id)))].slice(0, 50);
    // the session decides the account; the browser never sends a user id
    const customerId = await currentCustomerId();

    const result = await transaction(async (db) => {
      const [settingsRow] = (await db.query(`select ${SETTINGS_COLUMNS} from store_settings where id = 1`)).rows;
      const settings = settingsRow ? settingsFromRow(settingsRow, (await db.query<DeliveryZone>(ZONES_SQL)).rows) : null;
      // a product only counts as available when its category is active
      const { rows } = await db.query(
        `select ${PRODUCT_COLUMNS.split(", ").map((c) => `p.${c}`).join(", ")}
         from products p join categories c on c.id = p.category_id
         where p.id = any($1::uuid[]) and c.is_active`,
        [productIds],
      );
      const products = new Map(rows.map(productFromRow).map((p) => [p.id, p]));

      const order = buildOrder(input, settings, products);

      // the row lock queues two orders using the same coupon; the unique indexes are the last word
      let discount = 0;
      let coupon: CouponRow | null = null;
      const couponCode = normalizeCode(input?.coupon_code);
      if (couponCode) {
        coupon = (await db.query<CouponRow>(`${COUPON_SQL} for update`, [couponCode])).rows[0] ?? null;
        const usage = coupon ? (await db.query<{ uses: number; mine: number }>(COUPON_USES_SQL, [coupon.id, order.customer_phone, customerId])).rows[0] : null;
        const problem = couponProblem(coupon, { today: spNow(new Date()).date, uses: usage?.uses ?? 0, usedByCustomer: (usage?.mine ?? 0) > 0 });
        if (problem) throw new CouponError(problem);
        discount = couponDiscount(coupon!, order.subtotal);
        order.total = Math.round((order.subtotal - discount + order.delivery_fee) * 100) / 100;
      }

      const costs = await orderItemCosts(clientRun(db), order.items);
      order.items.forEach((item, i) => {
        if (costs[i] !== undefined) item.unit_cost = costs[i];
      });

      // per-slot limit: the lock queues concurrent orders for the same slot
      if (order.scheduled_for && settings?.slot_capacity) {
        await db.query("select pg_advisory_xact_lock(hashtext('slot:' || $1))", [order.scheduled_for]);
        const { rows: taken } = await db.query<{ n: number }>(
          "select count(*) as n from orders where scheduled_for = $1 and status <> 'cancelled'",
          [order.scheduled_for],
        );
        if (Number(taken[0]?.n ?? 0) >= settings.slot_capacity) throw new OrderError("Esse horário acabou de lotar. Escolha outro.");
      }

      await db.query(
        `insert into customers (phone, name, last_address, orders_count) values ($1, $2, $3, 1)
         on conflict (phone) do update set name = excluded.name, last_address = coalesce(excluded.last_address, customers.last_address),
           orders_count = customers.orders_count + 1, updated_at = now()`,
        [order.customer_phone, order.customer_name, order.address],
      );
      if (order.address) {
        await db.query("insert into customer_addresses (customer_phone, address) values ($1, $2)", [order.customer_phone, order.address]);
      }

      const created = await db.query<{ id: string; code: number; public_token: string }>(
        `insert into orders (customer_phone, customer_name, address, fulfillment, payment_method, change_for,
           items, subtotal, delivery_fee, total, notes, scheduled_for, customer_user_id, discount, coupon_code)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         returning id, code, public_token`,
        [
          order.customer_phone,
          order.customer_name,
          order.address,
          order.fulfillment,
          order.payment_method,
          order.change_for,
          JSON.stringify(order.items),
          order.subtotal,
          order.delivery_fee,
          order.total,
          order.notes,
          order.scheduled_for,
          customerId,
          discount,
          coupon ? couponCode : null,
        ],
      );
      const { id, code, public_token } = created.rows[0];

      if (coupon) {
        await db
          .query("insert into coupon_redemptions (coupon_id, order_id, customer_phone, customer_user_id) values ($1, $2, $3, $4)", [
            coupon.id,
            id,
            order.customer_phone,
            customerId,
          ])
          .catch((e: { code?: string }) => {
            throw e?.code === "23505" ? new CouponError("Você já usou este cupom.") : e;
          });
      }

      // signed-in customers keep the delivery address for next time (newest first, up to 5)
      if (customerId && order.address) {
        await db.query(
          `update customer_accounts set addresses = (
             select coalesce(jsonb_agg(a order by n), '[]'::jsonb) from (
               select a, n from (select $2::jsonb as a, 0::bigint as n
                              union all
                              select a, n from jsonb_array_elements(addresses) with ordinality as e(a, n)
                               where not (a->>'street' = $2::jsonb->>'street' and a->>'number' = $2::jsonb->>'number'
                                          and coalesce(a->>'complement', '') = coalesce($2::jsonb->>'complement', ''))) x
               order by n limit 5) y)
           where user_id = $1`,
          [customerId, JSON.stringify(order.address)],
        );
      }
      // a scheduled order is produced for its date: stock is taken when the store accepts it
      if (order.scheduled_for) return { code, public_token, stockChanged: false };

      // takes the stock the order consumes; a shortage rolls the whole order back
      const links = (
        await db.query<StockLink>("select product_id, addon_id, item_id, quantity from stock_links where product_id = any($1::uuid[])", [productIds])
      ).rows;
      const needs = stockNeeds(input.items, links);
      const shortage = await applyStockDeltas(db, new Map([...needs].map(([item, n]) => [item, -n])), "sale", { check: true, orderId: id });
      if (shortage) throw new OrderError(shortageMessage(shortage.item_id, shortage.available, input.items, links, products));

      return { code, public_token, stockChanged: needs.size > 0 };
    });

    if (result.stockChanged) updateTag(MENU_TAG);
    return { ok: true, code: result.code, public_token: result.public_token };
  } catch (e) {
    if (e instanceof CouponError) return { ok: false, error: e.message, coupon: true };
    if (e instanceof OrderError) return { ok: false, error: e.message };
    console.error("placeOrder failed", e);
    return { ok: false, error: "Não foi possível enviar o pedido. Tente novamente." };
  }
}

export type CouponCheck = { ok: true; code: string; kind: CouponKind; value: number } | { ok: false; error: string };

/**
 * Public: checkout preview of a coupon. Says only whether it applies and how
 * much; placeOrder checks it again. Rate limited so codes can't be guessed in bulk.
 */
export async function checkCoupon(code: string, phone: string): Promise<CouponCheck> {
  try {
    if (await tooManyRequests("coupon", 20, 10)) return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." };
    const c = normalizeCode(code);
    if (!COUPON_CODE.test(c)) return { ok: false, error: "Cupom inválido." };
    const [coupon] = await query<CouponRow>(COUPON_SQL, [c]);
    const digits = String(phone ?? "").replace(/\D/g, "");
    const [usage] = coupon ? await query<{ uses: number; mine: number }>(COUPON_USES_SQL, [coupon.id, digits, await currentCustomerId()]) : [];
    const problem = couponProblem(coupon, { today: spNow(new Date()).date, uses: usage?.uses ?? 0, usedByCustomer: (usage?.mine ?? 0) > 0 });
    if (problem) return { ok: false, error: problem };
    return { ok: true, code: c, kind: coupon.kind, value: coupon.value };
  } catch (e) {
    console.error("checkCoupon failed", e);
    return { ok: false, error: "Não foi possível conferir o cupom. Tente novamente." };
  }
}

/** Names the cart line that ran out, in units the customer can act on. */
function shortageMessage(itemId: string, available: number, items: PlaceOrderInput["items"], links: StockLink[], products: Map<string, Product>) {
  for (const item of items) {
    const product = products.get(String(item.product_id));
    const link = links.find(
      (l) => l.item_id === itemId && l.product_id === product?.id && (l.addon_id === null || item.addon_ids?.map(String).includes(l.addon_id)),
    );
    if (!product || !link) continue;
    const addon = link.addon_id ? product.addon_groups.flatMap((g) => g.addons).find((a) => a.id === link.addon_id) : null;
    const name = addon ? `${product.name} (${addon.name})` : product.name;
    const units = Math.floor(available / link.quantity);
    return units > 0
      ? `Só restam ${formatQty(units)} de ${name}. Ajuste a quantidade no carrinho.`
      : `${name} acabou de esgotar. Remova do carrinho para continuar.`;
  }
  return "Um dos produtos do carrinho acabou de esgotar.";
}

export type StatusResult = { ok: true; status: OrderStatus; timestamps: Record<string, string | null> } | { ok: false; error: string };

/**
 * Staff only. Validates the transition and stamps the matching time.
 * Cancelling returns the stock the order still holds; reopening a cancelled
 * order takes the same amounts again.
 */
export async function updateOrderStatus(orderId: string, to: OrderStatus): Promise<StatusResult> {
  try {
    const profile = await requireStaff();
    if (!UUID.test(String(orderId))) return { ok: false, error: "Pedido não encontrado." };

    let stockChanged = false;
    const result = await transaction(async (db) => {
      const current = (
        await db.query<{ status: OrderStatus; scheduled_for: Date | null; items: OrderItem[] }>(
          "select status, scheduled_for, items from orders where id = $1 for update",
          [orderId],
        )
      ).rows[0];
      if (!current) return { ok: false as const, error: "Pedido não encontrado." };
      if (!canTransition(current.status, to)) return { ok: false as const, error: "Mudança de status não permitida." };

      const by = { orderId, userName: profile.full_name || profile.email };
      if (to === "cancelled" && current.status !== "cancelled") {
        const { rows } = await db.query<{ item_id: string; held: number }>(
          "select item_id, -sum(delta) as held from stock_movements where order_id = $1 group by item_id having sum(delta) < 0",
          [orderId],
        );
        await applyStockDeltas(db, new Map(rows.map((r) => [r.item_id, Number(r.held)])), "cancel", by);
        stockChanged = rows.length > 0;
      } else if (current.status === "cancelled" && to !== "cancelled") {
        // movements written in one transaction share created_at (now() is the transaction time)
        const { rows } = await db.query<{ item_id: string; delta: number }>(
          `select item_id, delta from stock_movements
            where order_id = $1 and reason = 'cancel'
              and created_at = (select max(created_at) from stock_movements where order_id = $1 and reason = 'cancel')`,
          [orderId],
        );
        const shortage = await applyStockDeltas(db, new Map(rows.map((r) => [r.item_id, -Number(r.delta)])), "sale", { ...by, check: true });
        if (shortage) {
          throw new OrderError(`Estoque insuficiente para reabrir: restam ${formatQty(shortage.available)} ${shortage.unit} de ${shortage.name}.`);
        }
        stockChanged = rows.length > 0;
      } else if (current.scheduled_for && current.status === "new" && to === "preparing") {
        // scheduled orders take stock when accepted, unless they already hold it (reopened after a cancel)
        const held = (await db.query("select 1 from stock_movements where order_id = $1 group by item_id having sum(delta) <> 0 limit 1", [orderId]))
          .rows.length;
        const items = current.items.filter((i) => i.product_id);
        if (!held && items.length) {
          const links = (
            await db.query<StockLink>("select product_id, addon_id, item_id, quantity from stock_links where product_id = any($1::uuid[])", [
              items.map((i) => i.product_id),
            ])
          ).rows;
          const needs = stockNeeds(
            items.map((i) => ({ product_id: i.product_id!, quantity: i.quantity, addon_ids: i.addons.map((a) => a.id ?? "") })),
            links,
          );
          const shortage = await applyStockDeltas(db, new Map([...needs].map(([item, n]) => [item, -n])), "sale", { ...by, check: true });
          if (shortage) {
            throw new OrderError(
              `Estoque insuficiente de ${shortage.name} (restam ${formatQty(shortage.available)} ${shortage.unit}). Registre a entrada da produção no Estoque antes de aceitar.`,
            );
          }
          stockChanged = needs.size > 0;
        }
      }

      const { rows } = await db.query(
        `update orders set
           status = $2,
           updated_at = now(),
           accepted_at = case when $2 = 'preparing' then coalesce(accepted_at, now()) else accepted_at end,
           dispatched_at = case when $2 = 'out_for_delivery' then coalesce(dispatched_at, now())
                                when $2 in ('new', 'preparing') then null else dispatched_at end,
           completed_at = case when $2 = 'completed' then now() end,
           cancelled_at = case when $2 = 'cancelled' then now() end
         where id = $1
         returning accepted_at, dispatched_at, completed_at, cancelled_at`,
        [orderId, to],
      );
      const r = rows[0];
      return {
        ok: true as const,
        status: to,
        timestamps: {
          accepted_at: iso(r.accepted_at),
          dispatched_at: iso(r.dispatched_at),
          completed_at: iso(r.completed_at),
          cancelled_at: iso(r.cancelled_at),
        },
      };
    });
    if (stockChanged) updateTag(MENU_TAG);
    return result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." };
  }
}
