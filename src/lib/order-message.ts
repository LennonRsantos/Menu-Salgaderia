// Text the customer sends to the store on WhatsApp after ordering. Built from
// the order as the server stored it, so prices match the panel exactly.
// WhatsApp formatting: *bold*. No emojis, to keep wa.me links portable.

import type { PublicOrder } from "@/types";
import { formatBRL } from "./format";
import { formatScheduled } from "./hours";
import { PAYMENT_LABEL } from "./order-status";

export function orderWhatsAppMessage(order: PublicOrder, storeName: string, trackUrl: string, storeAddress?: string | null) {
  const lines: string[] = [
    order.scheduled_for ? `*Nova encomenda #${order.code}* - ${storeName}` : `*Novo pedido #${order.code}* - ${storeName}`,
    `Cliente: ${order.customer_name}`,
  ];
  if (order.scheduled_for) lines.push(`*Para:* ${formatScheduled(order.scheduled_for)}`);
  lines.push("");

  for (const item of order.items) {
    lines.push(`${item.quantity}x ${item.product_name} - ${formatBRL(item.line_total)}`);
    for (const addon of item.addons) lines.push(`  + ${addon.name}`);
    if (item.notes) lines.push(`  Obs.: ${item.notes}`);
  }

  lines.push("", `Subtotal: ${formatBRL(order.subtotal)}`);
  if (order.fulfillment === "delivery") {
    lines.push(`Entrega: ${Number(order.delivery_fee) > 0 ? formatBRL(order.delivery_fee) : "grátis"}`);
  }
  if (Number(order.discount) > 0) lines.push(`Desconto${order.coupon_code ? ` (${order.coupon_code})` : ""}: -${formatBRL(order.discount)}`);
  lines.push(`*Total: ${formatBRL(order.total)}*`, "");

  const a = order.address;
  if (order.fulfillment === "delivery" && a) {
    const street = [`${a.street}, ${a.number}`, a.complement, a.neighborhood].filter(Boolean).join(" - ");
    lines.push(`*Entrega:* ${street}, ${a.city}${a.reference ? ` (Ref.: ${a.reference})` : ""}`);
  } else {
    lines.push(storeAddress ? `*Retirada no balcão* - ${storeAddress}` : "*Retirada no balcão*");
  }

  const change = order.payment_method === "cash" && order.change_for ? ` - troco para ${formatBRL(order.change_for)}` : "";
  lines.push(`*Pagamento:* ${PAYMENT_LABEL[order.payment_method]}${change}`);
  if (order.notes) lines.push(`*Observações:* ${order.notes}`);
  lines.push("", `Acompanhar: ${trackUrl}`);

  return lines.join("\n");
}
