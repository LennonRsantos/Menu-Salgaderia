import type { Fulfillment, OrderStatus, PaymentMethod } from "@/types";

export const ORDER_STATUSES: OrderStatus[] = ["new", "preparing", "out_for_delivery", "completed", "cancelled"];

export const ACTIVE_STATUSES: OrderStatus[] = ["new", "preparing", "out_for_delivery"];

// Enforced on the server by updateOrderStatus() in src/actions/orders.ts.
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["preparing", "cancelled"],
  preparing: ["new", "out_for_delivery", "completed", "cancelled"],
  out_for_delivery: ["preparing", "completed", "cancelled"],
  completed: ["out_for_delivery"],
  cancelled: ["new"],
};

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return from === to || STATUS_TRANSITIONS[from].includes(to);
}

export function statusLabel(status: OrderStatus, fulfillment?: Fulfillment) {
  switch (status) {
    case "new":
      return "Novo";
    case "preparing":
      return "Em preparo";
    case "out_for_delivery":
      return fulfillment === "pickup" ? "Pronto p/ retirada" : "Saiu para entrega";
    case "completed":
      return "Concluído";
    case "cancelled":
      return "Cancelado";
  }
}

/** Column title on the kanban, where both fulfillment types share a column. */
export const COLUMN_LABEL: Record<OrderStatus, string> = {
  new: "Novos",
  preparing: "Em preparo",
  out_for_delivery: "Saiu / Pronto",
  completed: "Concluídos",
  cancelled: "Cancelados",
};

/** Main "advance" action shown on a card. */
export function nextAction(status: OrderStatus, fulfillment: Fulfillment): { to: OrderStatus; label: string } | null {
  switch (status) {
    case "new":
      return { to: "preparing", label: "Aceitar e preparar" };
    case "preparing":
      return {
        to: "out_for_delivery",
        label: fulfillment === "pickup" ? "Pronto p/ retirada" : "Saiu para entrega",
      };
    case "out_for_delivery":
      return { to: "completed", label: "Concluir" };
    default:
      return null;
  }
}

export const STATUS_TONE: Record<OrderStatus, string> = {
  new: "bg-primary-soft text-primary-soft-foreground",
  preparing: "bg-warning-soft text-warning-soft-foreground",
  out_for_delivery: "bg-info-soft text-info-soft-foreground",
  completed: "bg-success-soft text-success-soft-foreground",
  cancelled: "bg-danger-soft text-danger-soft-foreground",
};

export const STATUS_DOT: Record<OrderStatus, string> = {
  new: "bg-primary",
  preparing: "bg-warning-soft-foreground",
  out_for_delivery: "bg-info-soft-foreground",
  completed: "bg-success",
  cancelled: "bg-danger",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  credit: "Cartão de crédito",
  debit: "Cartão de débito",
  cash: "Dinheiro",
};

export const FULFILLMENT_LABEL: Record<Fulfillment, string> = {
  delivery: "Entrega",
  pickup: "Retirada",
};
