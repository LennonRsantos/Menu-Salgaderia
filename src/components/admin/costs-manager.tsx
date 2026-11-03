"use client";

import { AlertTriangle, Calculator, ChevronRight, CircleDollarSign, Factory, Percent, Plus, Search, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchCosts, type CostProduct, type CostsData } from "@/actions/costs";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { costBreakdown, fixedMonthly, productionBase, type CostBreakdown } from "@/lib/costs";
import { cn, formatBRL, normalizeSearch } from "@/lib/format";
import { spNow } from "@/lib/hours";
import type { ProductCost } from "@/types";
import { ExpensesTab } from "./costs-expenses";
import { InputsTab } from "./costs-inputs";
import { RecipeSheet } from "./costs-recipe-form";
import { PageHeader } from "./panel-shell";

type Tab = "products" | "inputs" | "expenses";
const TABS: { id: Tab; label: string }[] = [
  { id: "products", label: "Produtos" },
  { id: "inputs", label: "Insumos" },
  { id: "expenses", label: "Despesas" },
];

/** Everything a cost screen derives from the data: monthly expenses and their share per unit. */
export interface CostContext {
  month: string;
  fixedMonth: number;
  /** Units the monthly expenses are shared by; null without sales or a set production. */
  base: number | null;
  fixedPerUnit: number;
}

export type ProductRow = { product: CostProduct; recipe: ProductCost | null; cost: CostBreakdown | null };

export function CostsManager() {
  const [data, setData] = useState<CostsData | null>(null);
  const [tab, setTab] = useState<Tab>("products");

  const load = useCallback(async () => {
    const result = await fetchCosts().catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
    if (result.ok) {
      setData(result.data);
    } else {
      toast.error(result.error);
      setData(
        (d) =>
          d ?? { inputs: [], recipes: [], products: [], expenses: [], settings: { monthly_units: null, target_margin: 60, sales_pct: 0 }, sold_last_30: 0 },
      );
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);

  const ctx = useMemo<CostContext | null>(() => {
    if (!data) return null;
    const month = spNow(new Date()).date.slice(0, 7);
    const fixedMonth = fixedMonthly(data.expenses, month);
    const base = productionBase(data.settings, data.sold_last_30);
    return { month, fixedMonth, base, fixedPerUnit: base ? fixedMonth / base : 0 };
  }, [data]);

  const rows = useMemo<ProductRow[]>(() => {
    if (!data || !ctx) return [];
    const inputs = new Map(data.inputs.map((i) => [i.id, i]));
    const recipes = new Map(data.recipes.map((r) => [r.product_id, r]));
    return data.products.map((product) => {
      const recipe = recipes.get(product.id) ?? null;
      return { product, recipe, cost: recipe ? costBreakdown(product.price, recipe, inputs, ctx.fixedPerUnit, data.settings) : null };
    });
  }, [data, ctx]);

  const summary = useMemo(() => {
    const priced = rows.filter((r) => r.cost?.margin != null);
    const target = data?.settings.target_margin ?? 0;
    return {
      withRecipe: rows.filter((r) => r.recipe).length,
      avgMargin: priced.length ? priced.reduce((n, r) => n + (r.cost!.margin ?? 0), 0) / priced.length : null,
      belowTarget: priced.filter((r) => (r.cost!.margin ?? 0) < target).length,
    };
  }, [rows, data]);

  return (
    <div className="pb-8">
      <PageHeader
        title="Custos"
        description="Quanto custa cada produto: insumos da ficha técnica, extras como gás e embalagem, e a parte das despesas do mês."
      />

      <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4 sm:gap-3 sm:px-6">
        <SummaryCard icon={CircleDollarSign} label="Despesas do mês" value={ctx ? formatBRL(ctx.fixedMonth) : null} />
        <SummaryCard
          icon={Factory}
          label="Despesa por unidade"
          value={ctx ? (ctx.base ? formatBRL(ctx.fixedPerUnit) : "–") : null}
          hint={
            ctx && data
              ? ctx.base
                ? `${ctx.base.toLocaleString("pt-BR")} un/mês ${data.settings.monthly_units ? "(informado)" : "(vendas de 30 dias)"}`
                : "Sem base de produção"
              : undefined
          }
        />
        <SummaryCard
          icon={Percent}
          label="Margem média"
          value={data ? (summary.avgMargin === null ? "–" : `${Math.round(summary.avgMargin)}%`) : null}
          hint={data ? `${summary.withRecipe} de ${rows.length} com ficha` : undefined}
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Abaixo da meta"
          value={data ? String(summary.belowTarget) : null}
          hint={data ? `meta de ${data.settings.target_margin}%` : undefined}
          alert={summary.belowTarget > 0}
        />
      </div>

      <div className="px-4 pb-4 sm:px-6">
        <div className="inline-flex rounded-full border border-border-strong bg-surface p-1" role="tablist" aria-label="Seções de custos">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "h-9 rounded-full px-4 text-sm font-semibold transition-colors",
                tab === t.id ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!data || !ctx ? (
        <div className="space-y-3 px-4 sm:px-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : tab === "products" ? (
        <ProductsTab data={data} ctx={ctx} rows={rows} onChanged={load} onGoInputs={() => setTab("inputs")} />
      ) : tab === "inputs" ? (
        <InputsTab inputs={data.inputs} recipes={data.recipes} products={data.products} onChanged={load} />
      ) : (
        <ExpensesTab expenses={data.expenses} settings={data.settings} soldLast30={data.sold_last_30} month={ctx.month} onChanged={load} />
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  alert,
}: {
  icon: typeof Calculator;
  label: string;
  value: string | null;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-sm">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className={cn("size-3.5", alert && "text-warning-soft-foreground")} />
        {label}
      </span>
      <span className="mt-1 block text-2xl font-bold tabular-nums">{value ?? "–"}</span>
      {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

type Filter = "all" | "missing" | "below";

function ProductsTab({
  data,
  ctx,
  rows,
  onChanged,
  onGoInputs,
}: {
  data: CostsData;
  ctx: CostContext;
  rows: ProductRow[];
  onChanged: () => Promise<void>;
  onGoInputs: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<CostProduct | null>(null);
  const target = data.settings.target_margin;

  const below = (r: ProductRow) => r.cost?.margin != null && r.cost.margin < target;
  const grouped = useMemo(() => {
    const q = normalizeSearch(query);
    const visible = rows.filter(
      (r) =>
        (!q || normalizeSearch(`${r.product.name} ${r.product.category}`).includes(q)) &&
        (filter === "all" || (filter === "missing" ? !r.recipe : r.cost?.margin != null && r.cost.margin < target)),
    );
    const groups: { id: string; name: string; rows: ProductRow[] }[] = [];
    for (const r of visible) {
      const g = groups.find((x) => x.id === r.product.category_id);
      if (g) g.rows.push(r);
      else groups.push({ id: r.product.category_id, name: r.product.category, rows: [r] });
    }
    return groups;
  }, [rows, query, filter, target]);

  if (data.products.length === 0) {
    return <EmptyState icon={UtensilsCrossed} title="Nenhum produto no cardápio" description="Cadastre os produtos no Cardápio para montar as fichas técnicas." />;
  }

  const counts: Record<Filter, number> = { all: rows.length, missing: rows.filter((r) => !r.recipe).length, below: rows.filter(below).length };
  const editingRow = editing ? rows.find((r) => r.product.id === editing.id) : undefined;

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-center sm:px-6">
        <label className="relative sm:w-72">
          <span className="sr-only">Buscar produto</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto"
            className="h-10 w-full rounded-md border border-border-strong bg-surface pr-3 pl-9 text-base focus:border-primary focus:ring-3 focus:ring-primary/20 focus:outline-none sm:text-sm"
          />
        </label>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {(
            [
              ["all", "Todos"],
              ["missing", "Sem ficha"],
              ["below", "Abaixo da meta"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                filter === id ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border-strong bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {label} <span className="tabular-nums opacity-70">{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6 px-4 sm:px-6">
        {grouped.length === 0 ? (
          <EmptyState icon={Search} title="Nenhum produto encontrado" />
        ) : (
          grouped.map((g) => (
            <section key={g.id} aria-labelledby={`cc-${g.id}`}>
              <div className="mb-2 flex items-center gap-2">
                <h2 id={`cc-${g.id}`} className="font-bold">
                  {g.name}
                </h2>
                <span className="text-sm text-muted-foreground">· {g.rows.length}</span>
              </div>
              <Card className="divide-y divide-border overflow-hidden">
                {g.rows.map((r) => (
                  <ProductCostRow key={r.product.id} row={r} target={target} onOpen={() => setEditing(r.product)} />
                ))}
              </Card>
            </section>
          ))
        )}
      </div>

      <RecipeSheet
        open={Boolean(editing)}
        product={editing}
        recipe={editingRow?.recipe ?? null}
        inputs={data.inputs}
        ctx={ctx}
        settings={data.settings}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
        onGoInputs={() => {
          setEditing(null);
          onGoInputs();
        }}
      />
    </>
  );
}

function ProductCostRow({ row, target, onOpen }: { row: ProductRow; target: number; onOpen: () => void }) {
  const { product, recipe, cost } = row;
  const margin = cost?.margin ?? null;
  const tone = margin === null ? "neutral" : margin < 0 ? "danger" : margin < target ? "warning" : "success";
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{product.name}</p>
          {!product.is_visible && <Badge>Oculto</Badge>}
          {recipe ? (
            <Badge tone={tone}>
              {margin !== null && margin < target && <AlertTriangle className="size-3" aria-hidden />}
              {margin === null ? "Sem preço" : `Margem ${Math.round(margin)}%`}
            </Badge>
          ) : (
            <Badge tone="info">
              <Plus className="size-3" aria-hidden />
              Montar ficha
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          Preço {formatBRL(product.price)}
          {cost && (
            <>
              {" · "}custo {formatBRL(cost.total)}
              {" · "}lucro {formatBRL(cost.profit)}/un
            </>
          )}
        </p>
      </div>
      {cost && (
        <div className="hidden text-right sm:block">
          <p className="text-xs text-muted-foreground">Preço sugerido</p>
          <p className="font-bold tabular-nums">{cost.suggested === null ? "–" : formatBRL(cost.suggested)}</p>
        </div>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
