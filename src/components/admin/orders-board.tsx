"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Bell, BellOff, ClipboardList, Search, Wifi, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { playChime } from "@/lib/chime";
import { cn, formatBRL, normalizeSearch } from "@/lib/format";
import { canTransition, COLUMN_LABEL, ORDER_STATUSES, STATUS_DOT, statusLabel } from "@/lib/order-status";
import { updateOrderStatus } from "@/actions/orders";
import { useMediaQuery } from "@/lib/use-media-query";
import { useNow } from "@/lib/use-now";
import type { Fulfillment, Order, OrderStatus } from "@/types";
import { OrderCard } from "./order-card";
import { OrderDetailSheet } from "./order-detail-sheet";
import { PageHeader } from "./panel-shell";

const SOUND_KEY = "salgaderia:sound";
const POLL_MS = 5_000;
// computers and tablets (the panel's md breakpoint); the height leaves out phones lying sideways
const DRAG_QUERY = "(min-width: 768px) and (min-height: 600px)";

export function OrdersBoard() {
  const now = useNow();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [fulfillment, setFulfillment] = useState<Fulfillment | "all">("all");
  const [live, setLive] = useState(false);
  const [sound, setSound] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const soundRef = useRef(sound);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read persisted preference once on mount
      setSound(localStorage.getItem(SOUND_KEY) !== "off");
    } catch {}
  }, []);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  const markFresh = useCallback((id: string) => {
    setFresh((s) => new Set(s).add(id));
    setTimeout(() => {
      setFresh((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }, 15_000);
  }, []);

  // Polls open orders of any day + everything created today. A status change
  // made on another device shows up within POLL_MS.
  const pendingRef = useRef(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seen: Set<string> | null = null;
    let failed = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/orders", { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const { orders: list } = (await res.json()) as { orders: Order[] };
        if (stopped) return;
        // announce orders that arrive after the board loaded
        if (seen) {
          for (const order of list) {
            if (seen.has(order.id) || order.status !== "new") continue;
            markFresh(order.id);
            if (soundRef.current) playChime();
            toast(`Novo pedido #${order.code}`, {
              description: `${order.customer_name} · ${formatBRL(order.total)}`,
              action: { label: "Ver", onClick: () => setSelectedId(order.id) },
            });
          }
        }
        seen = new Set(list.map((o) => o.id));
        // skip a poll that raced a status change still being saved
        if (pendingRef.current === 0) setOrders(list);
        setLive(true);
        failed = false;
      } catch {
        if (stopped) return;
        setLive(false);
        if (!failed) toast.error("Não foi possível carregar os pedidos. Tentando de novo…");
        failed = true;
        setOrders((prev) => prev ?? []);
      } finally {
        if (!stopped) timer = setTimeout(poll, POLL_MS);
      }
    };

    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [markFresh, router]);

  // Tab title shows how many orders wait for acceptance.
  const newCount = orders?.filter((o) => o.status === "new").length ?? 0;
  useEffect(() => {
    const base = "Pedidos · Painel";
    document.title = newCount > 0 ? `(${newCount}) ${base}` : base;
    return () => {
      document.title = "Painel";
    };
  }, [newCount]);

  const changeStatus = useCallback(async (order: Order, to: OrderStatus) => {
    if (order.status === to) return true;
    if (!canTransition(order.status, to)) {
      toast.error(`Não é possível mover de “${statusLabel(order.status, order.fulfillment)}” para “${statusLabel(to, order.fulfillment)}”.`);
      return false;
    }
    const previous = order;
    setOrders((prev) => prev?.map((o) => (o.id === order.id ? { ...o, status: to } : o)) ?? prev);
    pendingRef.current++;
    const result = await updateOrderStatus(order.id, to)
      .catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "Sem conexão." }))
      .finally(() => pendingRef.current--);
    if (!result.ok) {
      setOrders((prev) => prev?.map((o) => (o.id === order.id ? previous : o)) ?? prev);
      toast.error(result.error);
      return false;
    }
    // the next poll delivers the final state; apply timestamps now for snappier UI
    setOrders((prev) => prev?.map((o) => (o.id === order.id ? { ...o, status: result.status, ...result.timestamps } : o)) ?? prev);
    toast.success(`#${order.code}: ${statusLabel(to, order.fulfillment)}`);
    return true;
  }, []);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {}
    if (next) playChime();
  };

  const visible = useMemo(() => {
    const q = normalizeSearch(query);
    return (orders ?? []).filter(
      (o) =>
        (fulfillment === "all" || o.fulfillment === fulfillment) &&
        (!q || String(o.code).includes(q) || normalizeSearch(o.customer_name).includes(q) || o.customer_phone.includes(q)),
    );
  }, [orders, query, fulfillment]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(ORDER_STATUSES.map((s) => [s, [] as Order[]])) as Record<OrderStatus, Order[]>;
    for (const o of visible) map[o.status].push(o);
    // terminal columns show the most recent first
    map.completed.reverse();
    map.cancelled.reverse();
    return map;
  }, [visible]);

  // dragging only on computers and tablets; on phones a long press while scrolling would start it by accident
  const canDrag = useMediaQuery(DRAG_QUERY);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  const onDragStart = (e: DragStartEvent) => setDraggingId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDraggingId(null);
    const order = orders?.find((o) => o.id === e.active.id);
    const to = e.over?.id as OrderStatus | undefined;
    if (order && to && to !== order.status) changeStatus(order, to);
  };

  const selected = orders?.find((o) => o.id === selectedId) ?? null;
  const dragging = orders?.find((o) => o.id === draggingId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Pedidos"
        description={
          canDrag
            ? "Arraste os cartões entre as colunas ou use os botões. Atualiza a cada 5 segundos."
            : "Use os botões dos cartões para avançar os pedidos. Atualiza a cada 5 segundos."
        }
        actions={
          <>
            <span
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
                live ? "bg-success-soft text-success-soft-foreground" : "bg-surface-2 text-muted-foreground",
              )}
              role="status"
            >
              {live ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
              {live ? "Ao vivo" : "Conectando…"}
            </span>
            <Button variant="outline" size="icon-sm" onClick={toggleSound} aria-label={sound ? "Desativar som de novos pedidos" : "Ativar som de novos pedidos"}>
              {sound ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row sm:items-center sm:px-6">
        <label className="relative flex-1 sm:max-w-xs">
          <span className="sr-only">Buscar pedido</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nº, nome ou telefone"
            className="h-10 w-full rounded-md border border-border-strong bg-surface pr-3 pl-9 text-base focus:border-primary focus:ring-3 focus:ring-primary/20 focus:outline-none sm:text-sm"
          />
        </label>
        <div className="inline-flex rounded-md border border-border-strong bg-surface p-0.5" role="group" aria-label="Filtrar por tipo">
          {(
            [
              ["all", "Todos"],
              ["delivery", "Entrega"],
              ["pickup", "Retirada"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFulfillment(value)}
              aria-pressed={fulfillment === value}
              className={cn(
                "h-9 rounded-sm px-3 text-sm font-semibold transition-colors",
                fulfillment === value ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {orders === null ? (
        <div className="flex gap-4 overflow-hidden px-4 sm:px-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-80 shrink-0" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDraggingId(null)}>
          <div className="flex flex-1 snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-6 sm:scroll-px-6 sm:px-6 lg:snap-none">
            {ORDER_STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                orders={byStatus[status]}
                activeFrom={dragging?.status ?? null}
              >
                {byStatus[status].map((o) => (
                  <DraggableCard key={o.id} id={o.id} disabled={!canDrag}>
                    <OrderCard
                      order={o}
                      now={now}
                      fresh={fresh.has(o.id)}
                      onOpen={() => setSelectedId(o.id)}
                      onAdvance={(to) => changeStatus(o, to)}
                    />
                  </DraggableCard>
                ))}
              </Column>
            ))}
          </div>
          <DragOverlay dropAnimation={null}>{dragging && <OrderCard order={dragging} now={now} dragging />}</DragOverlay>
        </DndContext>
      )}

      <OrderDetailSheet key={selected?.id} order={selected} onClose={() => setSelectedId(null)} onChangeStatus={changeStatus} />
    </div>
  );
}

function Column({
  status,
  orders,
  activeFrom,
  children,
}: {
  status: OrderStatus;
  orders: Order[];
  activeFrom: OrderStatus | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const allowed = activeFrom !== null && activeFrom !== status && canTransition(activeFrom, status);
  const blocked = activeFrom !== null && activeFrom !== status && !allowed;
  const terminal = status === "completed" || status === "cancelled";
  const total = orders.reduce((n, o) => n + o.total, 0);

  return (
    <section
      ref={setNodeRef}
      aria-label={COLUMN_LABEL[status]}
      className={cn(
        "flex w-[86vw] max-w-80 shrink-0 snap-start flex-col rounded-xl border bg-surface-2/60 transition-[background-color,border-color,opacity] sm:w-80",
        isOver && allowed ? "border-primary bg-primary-soft" : "border-transparent",
        allowed && !isOver && "border-dashed border-primary/50",
        blocked && "opacity-40",
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3.5 pt-3.5 pb-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <span className={cn("size-2 rounded-full", STATUS_DOT[status])} aria-hidden />
          {COLUMN_LABEL[status]}
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{orders.length}</span>
        </h2>
        {terminal && orders.length > 0 && <span className="text-xs text-muted-foreground">hoje · {formatBRL(total)}</span>}
      </header>
      <div className="flex min-h-40 flex-1 flex-col gap-2.5 px-2.5 pb-2.5">
        {orders.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted-foreground">
            <span className="flex flex-col items-center gap-2">
              <ClipboardList className="size-5 opacity-60" />
              {status === "new" ? "Nenhum pedido aguardando" : "Vazio"}
            </span>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function DraggableCard({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  // Pointer/touch drag only; keyboard users move orders with the card buttons.
  const { setNodeRef, listeners, isDragging } = useDraggable({ id, disabled });
  return (
    <div ref={setNodeRef} {...listeners} className={cn("touch-manipulation rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", isDragging && "opacity-30")}>
      {children}
    </div>
  );
}
