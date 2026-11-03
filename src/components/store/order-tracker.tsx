"use client";

import { ArrowLeft, Bike, CalendarClock, Check, ChefHat, CircleX, MessageCircle, PackageCheck, Receipt, SearchX, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn, formatBRL, formatTime, mapsLink, whatsappLink } from "@/lib/format";
import { etaLabel, formatScheduled } from "@/lib/hours";
import { orderWhatsAppMessage } from "@/lib/order-message";
import { FULFILLMENT_LABEL, PAYMENT_LABEL } from "@/lib/order-status";
import { DEFAULT_STORE_NAME } from "./store-header";
import type { OrderStatus, PublicOrder, StoreSettings } from "@/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLL_MS = 5_000;

function TrackerChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="Voltar ao cardápio">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 text-lg font-bold">Acompanhar pedido</h1>
          <ThemeToggle />
        </div>
      </header>
      <main id="conteudo" tabIndex={-1} className="mx-auto max-w-2xl space-y-4 px-4 py-6 outline-none sm:px-6">
        {children}
      </main>
    </div>
  );
}

export function TrackerSkeleton() {
  return (
    <TrackerChrome>
      <Skeleton className="h-56" />
      <Skeleton className="h-72" />
    </TrackerChrome>
  );
}

export function OrderTracker({ token, settings }: { token: string; settings: StoreSettings | null }) {
  const valid = UUID.test(token);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">(valid ? "loading" : "missing");

  // Polls the order while the tab is visible, so status changes made by the
  // store show up within POLL_MS.
  useEffect(() => {
    if (!valid) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/track/${token}`, { cache: "no-store" });
          if (stopped) return;
          if (res.status === 404) setState("missing");
          else if (res.ok) {
            setOrder(((await res.json()) as { order: PublicOrder }).order);
            setState("ready");
          }
        } catch {
          // offline for a moment: keep the last known status and try again
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };

    poll();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || stopped) return;
      clearTimeout(timer);
      poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [valid, token]);

  if (state === "loading") return <TrackerSkeleton />;

  if (state === "missing" || !order) {
    return (
      <TrackerChrome>
        <EmptyState
          icon={SearchX}
          title="Pedido não encontrado"
          description="Confira o link recebido ou fale com a loja."
          action={
            <Link href="/" className={buttonClasses("primary")}>
              Ver cardápio
            </Link>
          }
          className="py-20"
        />
      </TrackerChrome>
    );
  }

  const sendToStore = order.status === "new" && settings?.phone;
  const pickupOrder = order.fulfillment === "pickup";

  return (
    <TrackerChrome>
      {sendToStore && (
        <div className="rounded-lg border border-accent bg-accent-soft p-5 shadow-sm">
          <p className="font-bold">Envie seu pedido para a loja no WhatsApp</p>
          <p className="mt-1 text-sm text-muted-foreground">A mensagem já vem pronta com os itens, o endereço e o pagamento. É só tocar em enviar.</p>
          <a
            href={whatsappLink(
              settings.phone!,
              orderWhatsAppMessage(order, settings.name || DEFAULT_STORE_NAME, `${window.location.origin}/pedido/${token}`, settings.address),
            )}
            target="_blank"
            rel="noreferrer"
            className={buttonClasses("primary", "lg", "mt-4 w-full")}
          >
            <MessageCircle className="size-5" />
            Enviar pedido no WhatsApp
          </a>
        </div>
      )}

      {order.scheduled_for && (
        <div className="flex items-center gap-3 rounded-lg border border-accent bg-accent-soft px-5 py-4">
          <CalendarClock className="size-5 shrink-0" />
          <p>
            Encomenda para <strong>{formatScheduled(order.scheduled_for)}</strong>
          </p>
        </div>
      )}

      <StatusCard order={order} eta={order.scheduled_for ? null : etaLabel(pickupOrder ? settings?.pickup_min : settings?.delivery_min, pickupOrder ? settings?.pickup_max : settings?.delivery_max)} />

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-bold">
            <Receipt className="size-4.5 text-primary-soft-foreground" />
            Pedido #{order.code}
          </h2>
          <span className="text-sm text-muted-foreground">feito às {formatTime(order.created_at)}</span>
        </div>
        <ul className="mt-3 divide-y divide-border">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">
                  <span className="tabular-nums text-muted-foreground">{i.quantity}×</span> {i.product_name}
                </p>
                {i.addons.length > 0 && <p className="text-muted-foreground">{i.addons.map((a) => a.name).join(", ")}</p>}
                {i.notes && <p className="text-muted-foreground italic">“{i.notes}”</p>}
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatBRL(i.line_total)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 border-t border-border pt-4 text-sm">
          <Row label="Subtotal" value={formatBRL(order.subtotal)} />
          <Row label="Taxa de entrega" value={Number(order.delivery_fee) > 0 ? formatBRL(order.delivery_fee) : "Grátis"} />
          {order.discount > 0 && <Row label={`Desconto${order.coupon_code ? ` (${order.coupon_code})` : ""}`} value={`−${formatBRL(order.discount)}`} />}
          <div className="flex items-baseline justify-between pt-1 text-base">
            <dt className="font-semibold">Total</dt>
            <dd className="text-lg font-bold tabular-nums">{formatBRL(order.total)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div>
          <p className="font-semibold">{FULFILLMENT_LABEL[order.fulfillment]}</p>
          {order.address ? (
            <p className="mt-1 text-muted-foreground">
              {order.address.street}, {order.address.number}
              {order.address.complement && ` · ${order.address.complement}`}
              <br />
              {order.address.neighborhood} · {order.address.city}
              {order.address.reference && (
                <>
                  <br />
                  Ref.: {order.address.reference}
                </>
              )}
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              {settings?.address ? (
                <>
                  Retire em {settings.address}
                  <br />
                  <a href={mapsLink(settings.address)} target="_blank" rel="noreferrer" className="font-semibold text-primary-soft-foreground hover:underline">
                    Abrir no mapa
                  </a>
                </>
              ) : (
                "Retire no balcão da loja."
              )}
            </p>
          )}
        </div>
        <div>
          <p className="font-semibold">Pagamento</p>
          <p className="mt-1 text-muted-foreground">
            {PAYMENT_LABEL[order.payment_method]}
            {order.change_for ? ` · troco para ${formatBRL(order.change_for)}` : ""}
          </p>
        </div>
      </Card>

      {settings?.phone && !sendToStore && (
        <a
          href={whatsappLink(settings.phone, `Olá! Sobre o pedido #${order.code}`)}
          target="_blank"
          rel="noreferrer"
          className={buttonClasses("outline", "lg", "w-full")}
        >
          <MessageCircle className="size-5" />
          Falar com a loja no WhatsApp
        </a>
      )}
    </TrackerChrome>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

const STEPS: { status: OrderStatus; label: (pickup: boolean) => string; icon: React.ComponentType<{ className?: string }> }[] = [
  { status: "new", label: () => "Pedido recebido", icon: Receipt },
  { status: "preparing", label: () => "Em preparo", icon: ChefHat },
  { status: "out_for_delivery", label: (p) => (p ? "Pronto para retirada" : "Saiu para entrega"), icon: Bike },
  { status: "completed", label: (p) => (p ? "Retirado" : "Entregue"), icon: PackageCheck },
];

const HEADLINE: Record<OrderStatus, (pickup: boolean) => { title: string; text: string }> = {
  new: () => ({ title: "Pedido recebido!", text: "Aguardando a loja confirmar. Esta página atualiza sozinha." }),
  preparing: () => ({ title: "Preparando seu pedido", text: "Seus salgados já estão sendo feitos." }),
  out_for_delivery: (p) =>
    p
      ? { title: "Pronto para retirada", text: "Pode vir buscar seu pedido no balcão." }
      : { title: "Saiu para entrega", text: "O entregador está a caminho." },
  completed: (p) => ({ title: p ? "Pedido retirado" : "Pedido entregue", text: "Obrigado pela preferência! Bom apetite." }),
  cancelled: () => ({ title: "Pedido cancelado", text: "Fale com a loja se tiver dúvidas." }),
};

function StatusCard({ order, eta }: { order: PublicOrder; eta: string | null }) {
  const pickup = order.fulfillment === "pickup";
  const head =
    order.scheduled_for && order.status === "new"
      ? { title: "Encomenda recebida!", text: "A loja confirma e começa a preparar perto da data. Esta página atualiza sozinha." }
      : HEADLINE[order.status](pickup);
  const cancelled = order.status === "cancelled";
  const currentIndex = STEPS.findIndex((s) => s.status === order.status);
  const times: Partial<Record<OrderStatus, string | null>> = {
    new: order.created_at,
    preparing: order.accepted_at,
    out_for_delivery: order.dispatched_at,
    completed: order.completed_at,
  };

  return (
    <Card className="overflow-hidden">
      <div className={cn("px-5 py-6", cancelled ? "bg-danger-soft" : "bg-primary-soft")}>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-full",
              cancelled ? "bg-danger text-white dark:text-black" : "bg-primary text-primary-foreground",
            )}
          >
            {cancelled ? <CircleX className="size-6" /> : pickup ? <Store className="size-6" /> : <Bike className="size-6" />}
          </span>
          <div aria-live="polite">
            <p className={cn("text-xl font-bold", cancelled ? "text-danger-soft-foreground" : "text-primary-soft-foreground")}>{head.title}</p>
            <p className="text-sm text-muted-foreground">{head.text}</p>
            {eta && (order.status === "new" || order.status === "preparing") && (
              <p className="mt-1 text-sm font-semibold">
                {pickup ? "Fica pronto em" : "Previsão de entrega:"} <span className="tabular-nums">{eta}</span>
              </p>
            )}
          </div>
        </div>
      </div>
      {!cancelled && (
        <ol className="space-y-0 px-5 py-5">
          {STEPS.map((step, i) => {
            const done = i < currentIndex || order.status === "completed";
            const active = i === currentIndex && order.status !== "completed";
            const reached = i <= currentIndex;
            const Icon = step.icon;
            return (
              <li key={step.status} className="relative flex gap-3 pb-5 last:pb-0">
                {i < STEPS.length - 1 && (
                  <span className={cn("absolute top-9 bottom-0 left-[17px] w-0.5", i < currentIndex ? "bg-primary" : "bg-surface-3")} aria-hidden />
                )}
                <span
                  className={cn(
                    "relative grid size-9 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary bg-surface text-primary-soft-foreground",
                    !reached && "border-surface-3 bg-surface text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4.5" strokeWidth={3} /> : <Icon className="size-4.5" />}
                  {active && <span className="absolute inset-0 animate-ping rounded-full border-2 border-primary opacity-40" aria-hidden />}
                </span>
                <div className="flex flex-1 items-center justify-between gap-2 pt-1.5">
                  <span className={cn("text-sm font-semibold", !reached && "text-muted-foreground")}>
                    {step.label(pickup)}
                    {active && <span className="sr-only"> (etapa atual)</span>}
                  </span>
                  {times[step.status] && reached && (
                    <span className="text-xs text-muted-foreground tabular-nums">{formatTime(times[step.status]!)}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
