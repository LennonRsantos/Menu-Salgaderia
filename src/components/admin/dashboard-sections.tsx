"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, MapPin, MessageCircle, Minus, Timer, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getCashClosing, type CashClosing, type Customers, type HeatCell, type Neighborhood, type Profit, type Times } from "@/actions/dashboard";
import { buttonClasses } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { cn, formatBRL, maskPhone, whatsappLink } from "@/lib/format";
import { spNow, WEEKDAYS } from "@/lib/hours";
import { PAYMENT_LABEL } from "@/lib/order-status";

const pct = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n)}%`;

/** Change against a previous period: arrow + signed percent, never color alone. */
export function Delta({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous <= 0) return <span className="text-xs text-muted-foreground">Sem vendas no período anterior para comparar</span>;
  const change = ((current - previous) / previous) * 100;
  const flat = Math.abs(change) < 1;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums",
          flat ? "bg-surface-2" : change > 0 ? "bg-success-soft text-success-soft-foreground" : "bg-danger-soft text-danger-soft-foreground",
        )}
      >
        <Icon className="size-3" aria-hidden />
        {flat ? "0%" : pct(change)}
      </span>
      {label}
    </span>
  );
}

export function SectionHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="font-bold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">Ver dados em tabela</summary>
      {rows.length === 0 ? (
        <p className="mt-2 text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="mt-2 max-h-64 overflow-auto rounded-md border border-border">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                {headers.map((h, i) => (
                  <th key={h} className={cn("px-3 py-2 font-semibold", i > 0 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className={cn("px-3 py-1.5", ci > 0 && "text-right tabular-nums")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

function Stat({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={cn("rounded-md bg-surface-2 px-3 py-2.5", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ---------- Fechamento de caixa ---------- */

export function CashCard() {
  const [date, setDate] = useState(() => spNow(new Date()).date);
  const [cash, setCash] = useState<CashClosing | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCashClosing(date)
      .catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }))
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setCash(res.cash);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const received = cash?.received.reduce((n, r) => n + r.total, 0) ?? 0;

  return (
    <Card className="p-5">
      <SectionHeader title="Fechamento de caixa" description="Pedidos concluídos no dia, por forma de pagamento.">
        <label className="text-sm">
          <span className="sr-only">Dia do fechamento</span>
          <input
            type="date"
            value={date}
            max={spNow(new Date()).date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-9 rounded-md border border-border-strong bg-surface px-2.5 text-sm focus:border-primary focus:ring-3 focus:ring-primary/20 focus:outline-none"
          />
        </label>
      </SectionHeader>
      {!cash || cash.date !== date ? (
        <Skeleton className="h-48" />
      ) : (
        <>
          {cash.received.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground">Nenhum pedido concluído neste dia.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th>Forma de pagamento</th>
                  <th>Pedidos</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cash.received.map((r) => (
                  <tr key={r.method}>
                    <td className="py-2 font-medium">{PAYMENT_LABEL[r.method]}</td>
                    <td className="py-2 text-right text-muted-foreground tabular-nums">
                      {r.orders} {r.orders === 1 ? "pedido" : "pedidos"}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatBRL(r.total)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-3 font-bold" colSpan={2}>
                    Total recebido
                  </td>
                  <td className="pt-3 text-right text-lg font-bold tabular-nums">{formatBRL(received)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Taxas de entrega" value={formatBRL(cash.delivery_fees)} hint="incluídas no total" />
            <Stat label="A receber" value={formatBRL(cash.pending_total)} hint={`${cash.pending_orders} em aberto`} />
            <Stat label="Troco a separar" value={formatBRL(cash.change_needed)} hint="pedidos em dinheiro" className="col-span-2 sm:col-span-1" />
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------- Lucro ---------- */

export function ProfitCard({ profit, range }: { profit: Profit | null; range: number }) {
  if (!profit) {
    return (
      <Card className="p-5">
        <Skeleton className="h-64" />
      </Card>
    );
  }
  const gross = profit.items_revenue - profit.cost;
  const net = gross - profit.fixed_expenses;
  // margin only over sales that carry a cost; sales without one would inflate it
  const margin = profit.covered_revenue > 0 ? ((profit.covered_revenue - profit.cost) / profit.covered_revenue) * 100 : 0;
  const coverage = profit.items_revenue > 0 ? Math.round((profit.covered_revenue / profit.items_revenue) * 100) : 0;
  return (
    <Card className="p-5">
      <SectionHeader title="Lucro" description={`Vendas de produtos menos o custo e as despesas, nos últimos ${range} dias.`}>
        <Link href="/admin/custos" className={buttonClasses("outline", "sm")}>
          Custos
        </Link>
      </SectionHeader>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Vendas (produtos)" value={formatBRL(profit.items_revenue)} />
        <Stat label="Custo (CMV)" value={formatBRL(profit.cost)} />
        <Stat label="Lucro bruto" value={formatBRL(gross)} />
        <Stat label="Margem bruta" value={profit.cost > 0 ? `${Math.round(margin)}%` : "–"} hint={coverage < 100 && profit.cost > 0 ? "nas vendas com custo" : undefined} />
        <Stat label="Despesas fixas" value={formatBRL(profit.fixed_expenses)} hint={profit.fixed_expenses > 0 ? "parte do período" : "nenhuma lançada"} />
        <Stat label="Lucro líquido" value={formatBRL(net)} className={net < 0 ? "text-danger" : undefined} />
      </div>
      {coverage < 100 && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {profit.cost > 0
            ? `Só ${coverage}% das vendas têm custo cadastrado. Monte a ficha técnica dos produtos em Custos para um lucro exato.`
            : "Nenhuma venda com custo ainda. Monte a ficha técnica dos produtos em Custos."}
        </p>
      )}
      {profit.margins.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold">Margem por produto</h3>
          <p className="mb-2 text-xs text-muted-foreground">Preço atual menos o custo da ficha técnica (ou do estoque). As menores margens primeiro.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 text-left font-medium">Produto</th>
                <th className="py-1 text-right font-medium">Preço</th>
                <th className="py-1 text-right font-medium">Custo</th>
                <th className="py-1 text-right font-medium">Margem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {profit.margins.map((p) => {
                const m = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
                return (
                  <tr key={p.name}>
                    <td className="py-1.5">{p.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatBRL(p.price)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatBRL(p.cost)}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {m < 30 && <AlertTriangle className="size-3.5 text-warning-soft-foreground" aria-label="Margem baixa" />}
                        {m}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ---------- Horários de pico ---------- */

// Sequential one-hue ramp from the brand purple, validated with the dataviz
// skill's ordinal check (light: 300→800, dark: 600→200; zero stays neutral).
const HEAT_STEPS = [
  "bg-brand-300 dark:bg-brand-600",
  "bg-brand-400 dark:bg-brand-500",
  "bg-brand-500 dark:bg-brand-400",
  "bg-brand-600 dark:bg-brand-300",
  "bg-brand-800 dark:bg-brand-200",
];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HeatmapCard({ heat, range }: { heat: HeatCell[] | null; range: number }) {
  const [hover, setHover] = useState<{ dow: number; hour: number; orders: number } | null>(null);
  if (!heat) {
    return (
      <Card className="p-5">
        <Skeleton className="h-64" />
      </Card>
    );
  }
  const max = Math.max(0, ...heat.map((c) => c.orders));
  const hours = heat.length ? heat.map((c) => c.hour) : [10, 22];
  const first = Math.min(...hours);
  const last = Math.max(...hours);
  const columns = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const count = (dow: number, hour: number) => heat.find((c) => c.dow === dow && c.hour === hour)?.orders ?? 0;
  const step = (n: number) => (n === 0 ? "bg-surface-2" : HEAT_STEPS[Math.min(HEAT_STEPS.length - 1, Math.floor(((n - 1) / Math.max(1, max)) * HEAT_STEPS.length))]);
  const busiest = [...heat].sort((a, b) => b.orders - a.orders).slice(0, 10);

  return (
    <Card className="p-5">
      <SectionHeader title="Horários de pico" description={`Pedidos por dia da semana e hora, nos últimos ${range} dias.`}>
        <p className="h-5 text-sm font-semibold tabular-nums" aria-live="polite">
          {hover ? `${WEEKDAYS[hover.dow]} ${hover.hour}h: ${hover.orders} ${hover.orders === 1 ? "pedido" : "pedidos"}` : ""}
        </p>
      </SectionHeader>
      {heat.length === 0 ? (
        <EmptyState icon={Clock} title="Sem pedidos no período" className="py-10" />
      ) : (
        <>
          <div className="overflow-x-auto pb-1">
            <div
              className="grid gap-0.5 text-xs"
              style={{ gridTemplateColumns: `2.5rem repeat(${columns.length}, minmax(1.25rem, 1fr))` }}
              role="img"
              aria-label="Mapa de calor de pedidos por dia da semana e hora"
              onMouseLeave={() => setHover(null)}
            >
              <span />
              {columns.map((h) => (
                <span key={h} className="text-center text-muted-foreground tabular-nums">
                  {h % 2 === 0 ? h : ""}
                </span>
              ))}
              {WEEK_ORDER.map((d) => (
                <div key={d} className="contents">
                  <span className="self-center pr-1 font-medium text-muted-foreground">{WEEKDAYS[d]}</span>
                  {columns.map((h) => {
                    const n = count(d, h);
                    return (
                      <span
                        key={h}
                        onMouseEnter={() => setHover({ dow: d, hour: h, orders: n })}
                        className={cn("h-6 rounded-[3px] transition-[outline]", step(n), hover?.dow === d && hover.hour === h && "outline-2 outline-foreground")}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            Menos
            <span className="size-3 rounded-[3px] bg-surface-2" />
            {HEAT_STEPS.map((c) => (
              <span key={c} className={cn("size-3 rounded-[3px]", c)} />
            ))}
            Mais
          </div>
          <DataTable
            headers={["Dia e hora", "Pedidos"]}
            rows={busiest.map((c) => [`${WEEKDAYS[c.dow]} ${c.hour}h`, String(c.orders)])}
          />
        </>
      )}
    </Card>
  );
}

/* ---------- Tempos e cancelamentos ---------- */

const minutes = (m: number | null) => (m === null ? "–" : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);

export function TimesCard({ times, range }: { times: Times | null; range: number }) {
  if (!times) {
    return (
      <Card className="p-5">
        <Skeleton className="h-40" />
      </Card>
    );
  }
  const rate = times.orders > 0 ? (times.cancelled / times.orders) * 100 : 0;
  return (
    <Card className="p-5">
      <SectionHeader title="Tempo de atendimento" description={`Médias dos últimos ${range} dias (encomendas ficam de fora).`} />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Para aceitar" value={minutes(times.accept_min)} />
        <Stat label="Para preparar" value={minutes(times.prep_min)} />
        <Stat label="Para entregar" value={minutes(times.delivery_min)} />
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
        <Timer className="size-5 shrink-0 text-muted-foreground" />
        <p className="text-sm">
          <strong className="tabular-nums">{times.cancelled}</strong> {times.cancelled === 1 ? "cancelamento" : "cancelamentos"} de {times.orders} pedidos (
          <span className="tabular-nums">{rate.toFixed(rate < 10 && rate > 0 ? 1 : 0).replace(".", ",")}%</span>) ·{" "}
          <span className="tabular-nums">{formatBRL(times.cancelled_value)}</span> perdidos
        </p>
      </div>
    </Card>
  );
}

/* ---------- Clientes ---------- */

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days < 60 ? `há ${days} dias` : `há ${Math.floor(days / 30)} meses`;
};

export function CustomersCard({ customers, storeName, range }: { customers: Customers | null; storeName: string; range: number }) {
  if (!customers) {
    return (
      <Card className="p-5">
        <Skeleton className="h-64" />
      </Card>
    );
  }
  const buyers = customers.new_count + customers.returning_count;
  const newShare = buyers > 0 ? (customers.new_count / buyers) * 100 : 0;
  return (
    <Card className="p-5">
      <SectionHeader title="Clientes" description={`Quem comprou nos últimos ${range} dias.`} />
      {buyers === 0 ? (
        <EmptyState icon={Users} title="Sem clientes no período" className="py-8" />
      ) : (
        <>
          <div className="flex items-baseline gap-4 text-sm">
            <p>
              <strong className="text-lg tabular-nums">{customers.new_count}</strong> novos
            </p>
            <p>
              <strong className="text-lg tabular-nums">{customers.returning_count}</strong> voltaram a comprar
            </p>
          </div>
          {/* two parts of one whole: brand fill for new, neutral for returning, 2px gap between */}
          <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {customers.new_count > 0 && <span className="rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${newShare}%` }} />}
            {customers.returning_count > 0 && <span className="flex-1 rounded-full bg-surface-3" />}
          </div>
          <h3 className="mt-5 mb-1 text-sm font-semibold">Quem mais comprou</h3>
          <ul className="divide-y divide-border text-sm">
            {customers.top.map((c) => (
              <li key={c.phone} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{c.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {c.orders} {c.orders === 1 ? "pedido" : "pedidos"} · <strong className="text-foreground">{formatBRL(c.total)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mt-5 mb-1 text-sm font-semibold">Clientes sumidos</h3>
      <p className="mb-2 text-xs text-muted-foreground">Compraram 2 vezes ou mais e não pedem há mais de 30 dias. Um convite pelo WhatsApp costuma trazer de volta.</p>
      {customers.lost.length === 0 ? (
        <p className="rounded-md border border-dashed border-border-strong px-4 py-4 text-center text-sm text-muted-foreground">Nenhum cliente sumido.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {customers.lost.map((c) => (
            <li key={c.phone} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {maskPhone(c.phone)} · {c.orders} pedidos · último {ago(c.last_order)}
                </span>
              </span>
              <a
                href={whatsappLink(c.phone, `Oi, ${c.name.split(" ")[0]}! Sentimos sua falta aqui na ${storeName}. Que tal pedir seus salgados hoje?`)}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses("soft", "sm", "shrink-0")}
                aria-label={`Chamar ${c.name} no WhatsApp`}
              >
                <MessageCircle className="size-4" />
                Chamar
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Bairros ---------- */

export function NeighborhoodsCard({ neighborhoods, range }: { neighborhoods: Neighborhood[] | null; range: number }) {
  if (!neighborhoods) {
    return (
      <Card className="p-5">
        <Skeleton className="h-64" />
      </Card>
    );
  }
  const max = Math.max(1, ...neighborhoods.map((n) => n.orders));
  return (
    <Card className="p-5">
      <SectionHeader title="Entregas por bairro" description={`Nos últimos ${range} dias. Ajuda a definir a taxa de cada bairro.`} />
      {neighborhoods.length === 0 ? (
        <EmptyState icon={MapPin} title="Sem entregas no período" className="py-8" />
      ) : (
        <>
          <ul className="space-y-2.5" aria-label="Entregas por bairro">
            {neighborhoods.map((n) => (
              <li key={n.name} className="text-sm">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{n.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {n.orders} · {formatBRL(n.revenue)}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${(n.orders / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <DataTable headers={["Bairro", "Entregas", "Vendas"]} rows={neighborhoods.map((n) => [n.name, String(n.orders), formatBRL(n.revenue)])} />
        </>
      )}
    </Card>
  );
}

