"use client";

import { Package, Plus, Receipt, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteProductCost, saveProductCost, type CostProduct } from "@/actions/costs";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { costBreakdown, formatUnitCost, INPUT_KIND, inputUnitCost, linePerUnit } from "@/lib/costs";
import { cn, formatBRL, parseMoney } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import type { CostInput, CostLine, CostSettings, ProductCost } from "@/types";
import type { CostContext } from "./costs-manager";

const key = () => crypto.randomUUID();
const decimalText = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
const onlyDecimal = (v: string) => v.replace(/[^\d,.]/g, "");
const EXTRA_SUGGESTIONS = ["Gás", "Energia", "Mão de obra", "Óleo de fritura", "Etiqueta", "Sacola"];

type LineForm = { key: string; kind: "input" | "free"; input_id: string; label: string; quantityText: string; amountText: string; per: CostLine["per"] };

function toForm(recipe: ProductCost | null) {
  return {
    yieldText: decimalText(recipe?.yield ?? 1),
    include_fixed: recipe?.include_fixed ?? true,
    lines: (recipe?.lines ?? []).map<LineForm>((l) => ({
      key: key(),
      kind: l.input_id ? "input" : "free",
      input_id: l.input_id ?? "",
      label: l.label ?? "",
      quantityText: decimalText(l.quantity),
      amountText: l.amount === null ? "" : l.amount.toFixed(2).replace(".", ","),
      per: l.per,
    })),
  };
}

/** Form line → CostLine; numbers that don't parse count as zero for the live total. */
function toLine(l: LineForm): CostLine {
  const n = (t: string) => {
    const v = parseMoney(t || "0");
    return Number.isFinite(v) ? v : 0;
  };
  return l.kind === "input"
    ? { input_id: l.input_id || null, label: null, quantity: n(l.quantityText), amount: null, per: l.per }
    : { input_id: null, label: l.label, quantity: null, amount: n(l.amountText), per: l.per };
}

export function RecipeSheet({
  open,
  product,
  recipe,
  inputs,
  ctx,
  settings,
  onClose,
  onSaved,
  onGoInputs,
}: {
  open: boolean;
  product: CostProduct | null;
  recipe: ProductCost | null;
  inputs: CostInput[];
  ctx: CostContext;
  settings: CostSettings;
  onClose: () => void;
  onSaved: () => void;
  onGoInputs: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      size="lg"
      title={product ? `Ficha técnica: ${product.name}` : "Ficha técnica"}
      description="Tudo que entra no produto. O custo é recalculado sempre que o preço de um insumo muda."
    >
      {open && product && (
        <RecipeForm
          key={product.id}
          product={product}
          recipe={recipe}
          inputs={inputs}
          ctx={ctx}
          settings={settings}
          onCancel={onClose}
          onSaved={onSaved}
          onGoInputs={onGoInputs}
        />
      )}
    </Sheet>
  );
}

function RecipeForm({
  product,
  recipe,
  inputs,
  ctx,
  settings,
  onCancel,
  onSaved,
  onGoInputs,
}: {
  product: CostProduct;
  recipe: ProductCost | null;
  inputs: CostInput[];
  ctx: CostContext;
  settings: CostSettings;
  onCancel: () => void;
  onSaved: () => void;
  onGoInputs: () => void;
}) {
  const [form, setForm] = useState(() => toForm(recipe));
  const [initial] = useState(() => JSON.stringify(form));
  const [saved, setSaved] = useState(false);
  useUnsavedChanges(!saved && JSON.stringify(form) !== initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const inputMap = useMemo(() => new Map(inputs.map((i) => [i.id, i])), [inputs]);
  const yieldValue = parseMoney(form.yieldText || "");
  const recipeYield = Number.isFinite(yieldValue) && yieldValue > 0 ? yieldValue : 1;
  const lines = form.lines.map(toLine);
  const cost = costBreakdown(product.price, { yield: recipeYield, lines, include_fixed: form.include_fixed }, inputMap, ctx.fixedPerUnit, settings);
  const batch = recipeYield > 1;

  const updateLine = (lk: string, patch: Partial<LineForm>) => {
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === lk ? { ...l, ...patch } : l)) }));
    setError(null);
  };
  const addLine = (kind: LineForm["kind"]) =>
    setForm((f) => ({ ...f, lines: [...f.lines, { key: key(), kind, input_id: "", label: "", quantityText: "", amountText: "", per: "batch" }] }));
  const removeLine = (lk: string) => setForm((f) => ({ ...f, lines: f.lines.filter((l) => l.key !== lk) }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(yieldValue) || yieldValue <= 0) return setError("Informe quantas unidades a receita rende.");
    const out: Parameters<typeof saveProductCost>[1]["lines"] = [];
    for (const l of form.lines) {
      if (l.kind === "input") {
        const quantity = parseMoney(l.quantityText || "");
        if (!l.input_id || !Number.isFinite(quantity) || quantity <= 0) return setError("Escolha o insumo e uma quantidade maior que zero em cada linha.");
        out.push({ input_id: l.input_id, quantity, per: l.per });
      } else {
        const amount = parseMoney(l.amountText || "");
        if (!l.label.trim() || !Number.isFinite(amount) || amount < 0) return setError("Dê nome e valor a cada custo extra.");
        out.push({ input_id: null, label: l.label, amount, per: l.per });
      }
    }
    setSaving(true);
    const result = await saveProductCost(product.id, { yield: yieldValue, include_fixed: form.include_fixed, lines: out }).catch(() => ({
      ok: false as const,
      error: "Sem conexão. Tente novamente.",
    }));
    setSaving(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Ficha técnica salva.");
    setSaved(true);
    onSaved();
  }

  async function remove() {
    setRemoving(true);
    const result = await deleteProductCost(product.id).catch(() => ({ ok: false as const, error: "Sem conexão." }));
    setRemoving(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Ficha técnica removida.");
    setConfirmRemove(false);
    setSaved(true);
    onSaved();
  }

  const kinds = (Object.keys(INPUT_KIND) as (keyof typeof INPUT_KIND)[]).filter((k) => inputs.some((i) => i.kind === k));

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
      <div className="flex-1 space-y-6 px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rendimento da receita" hint="Quantas unidades a receita faz. Use 1 para informar tudo por unidade.">
            {(p) => (
              <div className="flex items-center gap-2">
                <Input {...p} inputMode="decimal" value={form.yieldText} onChange={(e) => setForm((f) => ({ ...f, yieldText: onlyDecimal(e.target.value) }))} className="w-28" />
                <span className="text-sm text-muted-foreground">unidades</span>
              </div>
            )}
          </Field>
          <div className="flex flex-col justify-center rounded-md bg-surface-2 px-4 py-2">
            <Switch
              checked={form.include_fixed}
              onCheckedChange={(v) => setForm((f) => ({ ...f, include_fixed: v }))}
              label="Somar parte das despesas fixas"
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              {ctx.base ? `${formatUnitCost(ctx.fixedPerUnit)} por unidade (aluguel, gás, luz…)` : "Lance despesas e a produção do mês na aba Despesas."}
            </p>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold">Insumos e custos</h3>
              <p className="text-sm text-muted-foreground">
                {batch ? "Quantidades da receita inteira, ou marque “por unidade” (ex.: embalagem)." : "Quantidades para uma unidade do produto."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="soft" size="sm" onClick={() => addLine("input")} disabled={inputs.length === 0}>
                <Plus className="size-4" />
                Insumo
              </Button>
              <Button variant="outline" size="sm" onClick={() => addLine("free")}>
                <Plus className="size-4" />
                Outro custo
              </Button>
            </div>
          </div>

          {inputs.length === 0 && (
            <p className="rounded-md border border-dashed border-border-strong px-4 py-4 text-center text-sm text-muted-foreground">
              Nenhum insumo cadastrado ainda.{" "}
              <button type="button" onClick={onGoInputs} className="font-semibold text-primary-soft-foreground hover:underline">
                Cadastrar insumos
              </button>
            </p>
          )}
          {inputs.length > 0 && form.lines.length === 0 && (
            <p className="rounded-md border border-dashed border-border-strong px-4 py-4 text-center text-sm text-muted-foreground">
              Adicione o que entra no produto: farinha, óleo, recheio, embalagem…
            </p>
          )}

          <ul className="space-y-2">
            {form.lines.map((l, i) => {
              const input = l.kind === "input" ? inputMap.get(l.input_id) : undefined;
              const perUnit = linePerUnit(lines[i], recipeYield, inputMap);
              return (
                <li key={l.key} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    {l.kind === "input" ? (
                      <>
                        <div className="min-w-0 flex-1">
                          <Select
                            aria-label="Insumo"
                            value={l.input_id}
                            onChange={(e) => {
                              const next = inputMap.get(e.target.value);
                              // packaging goes once per unit even in a batch recipe
                              updateLine(l.key, { input_id: e.target.value, ...(next?.kind === "packaging" && batch ? { per: "unit" as const } : {}) });
                            }}
                            className="h-10"
                          >
                            <option value="">Escolha o insumo…</option>
                            {kinds.map((k) => (
                              <optgroup key={k} label={INPUT_KIND[k].plural}>
                                {inputs
                                  .filter((x) => x.kind === k)
                                  .map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.name} ({formatUnitCost(inputUnitCost(x))}/{x.unit})
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                          </Select>
                        </div>
                        <div className="w-20 shrink-0">
                          <Input
                            aria-label="Quantidade"
                            inputMode="decimal"
                            value={l.quantityText}
                            onChange={(e) => updateLine(l.key, { quantityText: onlyDecimal(e.target.value) })}
                            placeholder="0"
                            className="h-10 px-2 text-center"
                          />
                        </div>
                        <span className="w-8 shrink-0 text-xs text-muted-foreground">{input?.unit ?? ""}</span>
                      </>
                    ) : (
                      <>
                        <Receipt className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <Input
                            aria-label="Nome do custo"
                            list="cost-extra-suggestions"
                            value={l.label}
                            onChange={(e) => updateLine(l.key, { label: e.target.value })}
                            placeholder="Ex.: Gás"
                            maxLength={60}
                            className="h-10"
                          />
                        </div>
                        <div className="w-24 shrink-0">
                          <Input
                            aria-label="Valor (R$)"
                            inputMode="decimal"
                            value={l.amountText}
                            onChange={(e) => updateLine(l.key, { amountText: onlyDecimal(e.target.value) })}
                            placeholder="R$ 0,00"
                            className="h-10 px-2 text-center"
                          />
                        </div>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      className="grid size-9 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground"
                      aria-label="Remover linha"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    {batch ? (
                      <div className="flex rounded-full border border-border-strong p-0.5" role="radiogroup" aria-label="Quantidade vale para">
                        {(
                          [
                            ["batch", "Receita"],
                            ["unit", "Por unidade"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={l.per === value}
                            onClick={() => updateLine(l.key, { per: value })}
                            className={cn(
                              "h-7 rounded-full px-2.5 font-semibold transition-colors",
                              l.per === value ? "bg-primary-soft text-primary-soft-foreground" : "hover:text-foreground",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="flex items-center gap-1">
                        {l.kind === "input" && input && (
                          <>
                            <Package className="size-3" aria-hidden />
                            {INPUT_KIND[input.kind].label}
                          </>
                        )}
                      </span>
                    )}
                    <span className="tabular-nums">
                      <strong className="text-foreground">{formatUnitCost(perUnit)}</strong> por unidade
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <datalist id="cost-extra-suggestions">
            {EXTRA_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {error && <p className="text-xs font-medium text-danger">{error}</p>}
        </section>

        <section className="rounded-lg bg-surface-2 p-4">
          <h3 className="mb-2 font-bold">Custo por unidade</h3>
          <dl className="space-y-1 text-sm tabular-nums">
            <Row label="Insumos" value={formatUnitCost(cost.inputs)} />
            <Row label="Outros custos" value={formatUnitCost(cost.extras)} />
            {form.include_fixed && <Row label="Despesas fixas (rateio)" value={formatUnitCost(cost.fixed)} />}
            {settings.sales_pct > 0 && <Row label={`Impostos e taxas (${String(settings.sales_pct).replace(".", ",")}%)`} value={formatUnitCost(cost.sales)} />}
            <Row label="Custo total" value={formatBRL(cost.total)} strong />
            {batch && <Row label={`Receita inteira (${decimalText(recipeYield)} un)`} value={formatBRL(cost.variable * recipeYield)} muted />}
          </dl>
          <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm tabular-nums">
            <Row label="Preço de venda" value={formatBRL(product.price)} />
            <Row
              label="Lucro por unidade"
              value={formatBRL(cost.profit)}
              strong
              className={cost.profit < 0 ? "text-danger" : undefined}
            />
            <Row label="Margem" value={cost.margin === null ? "–" : `${Math.round(cost.margin)}%`} />
            <Row
              label={`Preço sugerido (meta de ${settings.target_margin}%)`}
              value={cost.suggested === null ? "–" : formatBRL(cost.suggested)}
              className={cn(cost.margin !== null && cost.margin < settings.target_margin && "text-warning-soft-foreground")}
            />
          </dl>
        </section>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div>
          {recipe && (
            <Button variant="ghost" onClick={() => setConfirmRemove(true)} aria-label="Remover ficha técnica" className="text-danger">
              <Trash2 className="size-4" />
              <span className="hidden sm:inline">Remover ficha</span>
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Salvar ficha
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={remove}
        loading={removing}
        title={`Remover a ficha de “${product.name}”?`}
        description="O produto fica sem custo. Pedidos já feitos mantêm o custo da época."
        confirmLabel="Remover ficha"
      />
    </form>
  );
}

function Row({ label, value, strong, muted, className }: { label: string; value: string; strong?: boolean; muted?: boolean; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-3", muted && "text-xs text-muted-foreground", className)}>
      <dt className={cn(strong && "font-semibold")}>{label}</dt>
      <dd className={cn(strong && "font-bold")}>{value}</dd>
    </div>
  );
}
