// Pure order pricing/validation. Runs on the server inside the placeOrder
// transaction; prices always come from the database, never from the client.

import type { Fulfillment, OrderAddress, OrderItem, PaymentMethod, Product, StoreSettings } from "@/types";
import { isOpenAt, nextOpening, scheduleError } from "./hours";
import { deliveryFeeFor } from "./zones";

export interface PlaceOrderInput {
  customer: { name: string; phone: string };
  fulfillment: Fulfillment;
  address: Partial<OrderAddress> | null;
  payment_method: PaymentMethod;
  change_for: number | null;
  notes: string;
  items: { product_id: string; quantity: number; notes?: string; addon_ids: string[] }[];
  /** ISO instant of a scheduled order (encomenda); null or absent = as soon as possible. */
  scheduled_for?: string | null;
}

export interface BuiltOrder {
  customer_name: string;
  customer_phone: string;
  fulfillment: Fulfillment;
  payment_method: PaymentMethod;
  change_for: number | null;
  address: OrderAddress | null;
  notes: string | null;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  scheduled_for: string | null;
}

/** Error whose message is safe to show to the customer. */
export class OrderError extends Error {}

const FULFILLMENTS: Fulfillment[] = ["delivery", "pickup"];
const PAYMENTS: PaymentMethod[] = ["pix", "credit", "debit", "cash"];

const round2 = (n: number) => Math.round(n * 100) / 100;
const text = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const brl = (n: number) => n.toFixed(2).replace(".", ",");

/**
 * @param products map of product id → product as stored (only products whose
 * category is active should be included; anything missing counts as unavailable)
 */
export function buildOrder(
  input: PlaceOrderInput,
  settings: StoreSettings | null,
  products: Map<string, Product>,
  now: Date = new Date(),
): BuiltOrder {
  if (!settings) throw new OrderError("A loja está fechada no momento.");
  // a scheduled order may be placed while the store is closed; it only has to fit the hours of its day
  const scheduledFor = input?.scheduled_for ? String(input.scheduled_for) : null;
  if (scheduledFor) {
    const error = scheduleError(settings, scheduledFor, now);
    if (error) throw new OrderError(error);
  } else if (!isOpenAt(settings, now)) {
    const next = nextOpening(settings, now);
    throw new OrderError(next ? `A loja está fechada agora. ${next}.` : "A loja está fechada no momento.");
  }

  const name = text(input?.customer?.name, 80);
  const phone = String(input?.customer?.phone ?? "").replace(/\D/g, "");
  if (name.length < 2) throw new OrderError("Informe seu nome.");
  if (!/^\d{10,13}$/.test(phone)) throw new OrderError("Informe um telefone válido com DDD.");

  if (!FULFILLMENTS.includes(input?.fulfillment) || !PAYMENTS.includes(input?.payment_method)) {
    throw new OrderError("Tipo de entrega ou forma de pagamento inválida.");
  }
  if (input.fulfillment === "delivery" && settings.delivery_enabled === false) {
    throw new OrderError("No momento não estamos fazendo entregas. Escolha retirada.");
  }
  if (input.fulfillment === "pickup" && settings.pickup_enabled === false) {
    throw new OrderError("No momento não aceitamos retirada. Escolha entrega.");
  }

  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length === 0) throw new OrderError("Seu carrinho está vazio.");
  if (rawItems.length > 50) throw new OrderError("Pedido com itens demais.");

  const items: OrderItem[] = [];
  let subtotal = 0;

  for (const raw of rawItems) {
    const product = products.get(String(raw?.product_id));
    if (!product || !product.is_visible || !product.is_available) {
      throw new OrderError("Um dos produtos do carrinho não está mais disponível.");
    }

    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new OrderError(`Quantidade inválida para ${product.name}.`);
    }

    const selected = [...new Set((Array.isArray(raw.addon_ids) ? raw.addon_ids : []).map(String))];
    const groups = product.addon_groups ?? [];
    const allAddons = groups.flatMap((g) => g.addons.map((a) => ({ ...a, group: g })));

    for (const id of selected) {
      const addon = allAddons.find((a) => a.id === id);
      if (!addon || !addon.is_available) throw new OrderError(`Um adicional de ${product.name} não está mais disponível.`);
    }

    for (const g of groups) {
      const count = g.addons.filter((a) => selected.includes(a.id)).length;
      if (count < g.min_select || count > g.max_select) {
        throw new OrderError(`Revise as opções de "${g.name}" em ${product.name}.`);
      }
    }

    const chosen = allAddons
      .filter((a) => selected.includes(a.id))
      .sort((a, b) => a.group.position - b.group.position || a.position - b.position);
    const unit = round2(Number(product.price) + chosen.reduce((n, a) => n + Number(a.price), 0));
    const lineTotal = round2(unit * quantity);
    subtotal = round2(subtotal + lineTotal);

    items.push({
      product_id: product.id,
      product_name: product.name,
      unit_price: unit,
      quantity,
      addons: chosen.map((a) => ({ id: a.id, name: a.name, price: Number(a.price), group: a.group.name })),
      notes: text(raw.notes, 140) || null,
      line_total: lineTotal,
    });
  }

  if (subtotal < settings.min_order) throw new OrderError(`O pedido mínimo é de R$ ${brl(settings.min_order)}.`);

  let address: OrderAddress | null = null;
  let fee = 0;
  if (input.fulfillment === "delivery") {
    const a = input.address ?? {};
    address = {
      zip: String(a.zip ?? "").replace(/\D/g, "").slice(0, 8) || null,
      street: text(a.street, 120),
      number: text(a.number, 20),
      complement: text(a.complement, 80) || null,
      neighborhood: text(a.neighborhood, 80),
      city: text(a.city, 80),
      reference: text(a.reference, 140) || null,
    };
    if (!address.street || !address.number || !address.neighborhood || !address.city) {
      throw new OrderError("Preencha o endereço de entrega completo.");
    }
    const zoneFee = deliveryFeeFor(settings, address.neighborhood);
    if (zoneFee === null) throw new OrderError(`Ainda não entregamos em ${address.neighborhood}. Escolha retirada no balcão.`);
    fee = zoneFee;
  }

  const total = round2(subtotal + fee);

  let changeFor: number | null = null;
  if (input.payment_method === "cash" && input.change_for !== null && input.change_for !== undefined) {
    changeFor = Number(input.change_for);
    if (!Number.isFinite(changeFor) || changeFor < total) {
      throw new OrderError("O valor para troco deve ser maior que o total do pedido.");
    }
  }

  return {
    customer_name: name,
    customer_phone: phone,
    fulfillment: input.fulfillment,
    payment_method: input.payment_method,
    change_for: changeFor,
    address,
    notes: text(input.notes) || null,
    items,
    subtotal,
    delivery_fee: fee,
    total,
    scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
  };
}
