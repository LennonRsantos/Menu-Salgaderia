"use client";

import { Bike, CalendarClock, Clock, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatBRL, formatElapsed, minutesSince } from "@/lib/format";
import { formatScheduled } from "@/lib/hours";
import { nextAction, PAYMENT_LABEL } from "@/lib/order-status";
import type { Order, OrderStatus } from "@/types";

const LATE_AFTER_MIN: Partial<Record<OrderStatus, number>> = { new: 5, preparing: 25, out_for_delivery: 40 };

export function OrderCard({
  order,
  now,
  fresh,
  dragging,
  onOpen,
  onAdvance,
}: {
  order: Order;
  now: number;
  fresh?: boolean;
  dragging?: boolean;
  onOpen?: () => void;
  onAdvance?: (to: OrderStatus) => void;
}) {
  const action = nextAction(order.status, order.fulfillment);
  const reference = order.status === "new" ? order.created_at : (order.accepted_at ?? order.created_at);
  const limit = LATE_AFTER_MIN[order.status];
  // a scheduled order waiting in "Novos" is on time until its date comes
  const waitingDate = order.scheduled_for !== null && order.status === "new";
  const late = limit !== undefined && !waitingDate && minutesSince(reference, now) >= limit;
  const items = order.order_items ?? [];
  const terminal = order.status === "completed" || order.status === "cancelled";

  return (
    <article
      className={cn(
        "rounded-lg border bg-surface shadow-sm transition-[box-shadow,border-color,opacity]",
        fresh ? "border-primary ring-3 ring-primary/25" : "border-border",
        dragging && "rotate-1 shadow-md",
        terminal && "opacity-80",
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full rounded-t-lg p-3.5 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="text-base font-bold tabular-nums">#{order.code}</span>
            {fresh && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground uppercase">Novo</span>}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
              late && !terminal ? "bg-danger-soft text-danger-soft-foreground" : "bg-surface-2 text-muted-foreground",
            )}
            title={late ? "Pedido atrasado" : undefined}
          >
            <Clock className="size-3" />
            {formatElapsed(reference, now)}
          </span>
        </div>
        {order.scheduled_for && (
          <p className="mt-2 flex items-center gap-1.5 rounded-sm bg-accent-soft px-2 py-1 text-xs font-semibold">
            <CalendarClock className="size-3.5 shrink-0" />
            Encomenda · {formatScheduled(order.scheduled_for)}
          </p>
        )}
        <p className="mt-1.5 truncate font-semibold">{order.customer_name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {order.fulfillment === "pickup" ? <Store className="size-3.5" /> : <Bike className="size-3.5" />}
          {order.fulfillment === "pickup" ? "Retirada" : order.address?.neighborhood || "Entrega"}
          <span aria-hidden>·</span>
          {PAYMENT_LABEL[order.payment_method]}
        </p>
        <ul className="mt-2.5 space-y-0.5 border-t border-dashed border-border pt-2.5 text-sm">
          {items.slice(0, 4).map((i, idx) => (
            <li key={i.id ?? idx} className="truncate">
              <span className="font-semibold tabular-nums">{i.quantity}×</span> {i.product_name}
              {i.addons.length > 0 && <span className="text-muted-foreground"> +{i.addons.length}</span>}
            </li>
          ))}
          {items.length > 4 && <li className="text-xs text-muted-foreground">+ {items.length - 4} itens</li>}
        </ul>
        {(order.notes || items.some((i) => i.notes)) && (
          <p className="mt-2 rounded-sm bg-warning-soft px-2 py-1 text-xs font-medium text-warning-soft-foreground">Tem observações</p>
        )}
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3.5 py-2.5">
        <span className="font-bold tabular-nums">{formatBRL(order.total)}</span>
        {action && onAdvance && (
          <Button
            size="sm"
            variant={order.status === "new" ? "primary" : "soft"}
            onClick={(e) => {
              e.stopPropagation();
              onAdvance(action.to);
            }}
          >
            {action.label}
          </Button>
        )}
      </div>
    </article>
  );
}
