"use client";

import { Bike, MapPin, MessageCircle, Phone, Store, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { cn, formatBRL, formatDateTime, formatTime, maskPhone, whatsappLink } from "@/lib/format";
import { formatScheduled } from "@/lib/hours";
import { nextAction, PAYMENT_LABEL, STATUS_TONE, STATUS_TRANSITIONS, statusLabel } from "@/lib/order-status";
import type { Order, OrderStatus } from "@/types";

export function OrderDetailSheet({
  order,
  onClose,
  onChangeStatus,
}: {
  order: Order | null;
  onClose: () => void;
  onChangeStatus: (order: Order, to: OrderStatus) => Promise<boolean>;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState<OrderStatus | null>(null);

  if (!order) return null;

  const action = nextAction(order.status, order.fulfillment);
  const secondary = STATUS_TRANSITIONS[order.status].filter((s) => s !== action?.to && s !== "cancelled");
  const canCancel = STATUS_TRANSITIONS[order.status].includes("cancelled");

  async function change(to: OrderStatus) {
    if (!order) return;
    setBusy(to);
    const ok = await onChangeStatus(order, to);
    setBusy(null);
    if (ok && to === "cancelled") setConfirmCancel(false);
  }

  const addr = order.address;
  const mapsQuery = addr ? encodeURIComponent(`${addr.street}, ${addr.number} - ${addr.neighborhood}, ${addr.city}`) : "";

  const timeline: { label: string; at: string | null }[] = [
    { label: "Recebido", at: order.created_at },
    { label: "Aceito", at: order.accepted_at },
    { label: order.fulfillment === "pickup" ? "Pronto" : "Saiu", at: order.dispatched_at },
    { label: "Concluído", at: order.completed_at },
    { label: "Cancelado", at: order.cancelled_at },
  ].filter((t) => t.at);

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        side="right"
        title={
          <span className="flex items-center gap-2">
            Pedido #{order.code}
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[order.status])}>
              {statusLabel(order.status, order.fulfillment)}
            </span>
          </span>
        }
        description={
          order.scheduled_for
            ? `Encomenda para ${formatScheduled(order.scheduled_for)} · feita em ${formatDateTime(order.created_at)}`
            : formatDateTime(order.created_at)
        }
        footer={
          <div className="space-y-2">
            {action && (
              <Button size="lg" className="w-full" loading={busy === action.to} onClick={() => change(action.to)}>
                {action.label}
              </Button>
            )}
            <div className="flex flex-wrap gap-2">
              {secondary.map((s) => (
                <Button key={s} variant="outline" size="sm" className="flex-1" loading={busy === s} onClick={() => change(s)}>
                  <Undo2 className="size-4" />
                  {s === "new" && order.status === "cancelled" ? "Reabrir pedido" : `Voltar: ${statusLabel(s, order.fulfillment)}`}
                </Button>
              ))}
              {canCancel && (
                <Button variant="danger" size="sm" className="flex-1" onClick={() => setConfirmCancel(true)}>
                  <X className="size-4" />
                  Cancelar pedido
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-5 px-5 py-5">
          <section className="space-y-2">
            <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Cliente</h3>
            <p className="text-lg font-semibold">{order.customer_name}</p>
            <div className="flex flex-wrap gap-2">
              <a href={whatsappLink(order.customer_phone, `Olá, ${order.customer_name}! Sobre seu pedido #${order.code}:`)} target="_blank" rel="noreferrer" className={buttonClasses("soft", "sm")}>
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
              <a href={`tel:${order.customer_phone}`} className={buttonClasses("outline", "sm")}>
                <Phone className="size-4" />
                {maskPhone(order.customer_phone)}
              </a>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
              {order.fulfillment === "pickup" ? <Store className="size-3.5" /> : <Bike className="size-3.5" />}
              {order.fulfillment === "pickup" ? "Retirada no balcão" : "Entrega"}
            </h3>
            {addr ? (
              <div className="rounded-md bg-surface-2 p-3 text-sm">
                <p className="font-medium">
                  {addr.street}, {addr.number}
                  {addr.complement && ` · ${addr.complement}`}
                </p>
                <p className="text-muted-foreground">
                  {addr.neighborhood} · {addr.city}
                  {addr.zip && ` · CEP ${addr.zip}`}
                </p>
                {addr.reference && (
                  <p className="mt-1.5 font-medium text-primary-soft-foreground">Referência: {addr.reference}</p>
                )}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-soft-foreground hover:underline"
                >
                  <MapPin className="size-4" />
                  Abrir no mapa
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">O cliente vai retirar na loja.</p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Itens</h3>
            <ul className="divide-y divide-border">
              {order.order_items.map((i, idx) => (
                <li key={i.id ?? idx} className="flex justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <span className="tabular-nums">{i.quantity}×</span> {i.product_name}
                    </p>
                    {i.addons.map((a, k) => (
                      <p key={k} className="text-sm text-muted-foreground">
                        + {a.name}
                        {Number(a.price) > 0 && <span className="tabular-nums"> ({formatBRL(a.price)})</span>}
                      </p>
                    ))}
                    {i.notes && (
                      <p className="mt-1 rounded-sm bg-warning-soft px-2 py-1 text-sm font-medium text-warning-soft-foreground">{i.notes}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatBRL(i.line_total)}</span>
                </li>
              ))}
            </ul>
            {order.notes && (
              <div className="mt-2 rounded-md bg-warning-soft p-3 text-sm text-warning-soft-foreground">
                <p className="font-bold">Observação do pedido</p>
                <p>{order.notes}</p>
              </div>
            )}
          </section>

          <section className="space-y-1.5 rounded-md border border-border p-3 text-sm">
            <Line label="Subtotal" value={formatBRL(order.subtotal)} />
            <Line label="Taxa de entrega" value={formatBRL(order.delivery_fee)} />
            {order.discount > 0 && <Line label={`Cupom ${order.coupon_code ?? ""}`.trim()} value={`−${formatBRL(order.discount)}`} />}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatBRL(order.total)}</span>
            </div>
            <Line
              label="Pagamento"
              value={`${PAYMENT_LABEL[order.payment_method]}${order.change_for ? ` · troco p/ ${formatBRL(order.change_for)} (${formatBRL(Number(order.change_for) - Number(order.total))})` : ""}`}
            />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">Histórico</h3>
            <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {timeline.map((t) => (
                <li key={t.label}>
                  <span className="text-muted-foreground">{t.label}</span> <span className="font-semibold tabular-nums">{formatTime(t.at!)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => change("cancelled")}
        loading={busy === "cancelled"}
        title={`Cancelar o pedido #${order.code}?`}
        description="O cliente verá o pedido como cancelado. Você pode reabrir depois, se precisar."
        confirmLabel="Cancelar pedido"
      />
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}
