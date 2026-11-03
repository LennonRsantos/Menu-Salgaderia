"use client";

import { History, Pencil, Plus, Search, ShoppingBasket, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteCostInput, fetchInputPrices, saveCostInput, type CostProduct } from "@/actions/costs";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { formatUnitCost, INPUT_KIND, inputUnitCost } from "@/lib/costs";
import { cn, formatBRL, formatDateTime, normalizeSearch, parseMoney } from "@/lib/format";
import type { CostInput, CostInputKind, CostInputPrice, ProductCost } from "@/types";

const KINDS = Object.keys(INPUT_KIND) as CostInputKind[];
const UNITS = ["g", "kg", "ml", "L", "un", "dz", "pct"];
const decimalText = (n: number) => String(n).replace(".", ",");

export function InputsTab({
  inputs,
  recipes,
  products,
  onChanged,
}: {
  inputs: CostInput[];
  recipes: ProductCost[];
  products: CostProduct[];
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<CostInputKind | "all">("all");
  const [editing, setEditing] = useState<CostInput | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CostInput | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** Products whose ficha técnica uses each input. */
  const usedIn = useMemo(() => {
    const names = new Map(products.map((p) => [p.id, p.name]));
    const map = new Map<string, string[]>();
    for (const r of recipes) {
      for (const id of new Set(r.lines.map((l) => l.input_id).filter((x): x is string => Boolean(x)))) {
        map.set(id, [...(map.get(id) ?? []), names.get(r.product_id) ?? "Produto"]);
      }
    }
    return map;
  }, [recipes, products]);

  const grouped = useMemo(() => {
    const q = normalizeSearch(query);
    return KINDS.filter((k) => kind === "all" || k === kind)
      .map((k) => ({
        kind: k,
        items: inputs.filter((i) => i.kind === k && (!q || normalizeSearch(`${i.name} ${i.supplier ?? ""}`).includes(q))),
      }))
      .filter((g) => g.items.length > 0);
  }, [inputs, query, kind]);

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    const result = await deleteCostInput(toDelete.id).catch(() => ({ ok: false as const, error: "Sem conexão." }));
    setDeleting(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Insumo excluído.");
    setToDelete(null);
    onChanged();
  }

  const openForm = (input: CostInput | null) => {
    setEditing(input);
    setFormOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-center sm:px-6">
        <label className="relative sm:w-72">
          <span className="sr-only">Buscar insumo</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar insumo ou fornecedor"
            className="h-10 w-full rounded-md border border-border-strong bg-surface pr-3 pl-9 text-base focus:border-primary focus:ring-3 focus:ring-primary/20 focus:outline-none sm:text-sm"
          />
        </label>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {(["all", ...KINDS] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                kind === k ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border-strong bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "all" ? "Todos" : INPUT_KIND[k].plural}
            </button>
          ))}
        </div>
        <Button onClick={() => openForm(null)} className="sm:ml-auto">
          <Plus className="size-4" />
          Novo insumo
        </Button>
      </div>

      <div className="space-y-6 px-4 sm:px-6">
        {inputs.length === 0 ? (
          <EmptyState
            icon={ShoppingBasket}
            title="Cadastre o que você compra"
            description="Farinha, óleo, recheios, caixas e sacolas. Informe o tamanho e o preço da embalagem: o custo por grama, ml ou unidade sai sozinho."
            action={<Button onClick={() => openForm(null)}>Cadastrar insumo</Button>}
          />
        ) : grouped.length === 0 ? (
          <EmptyState icon={Search} title="Nenhum insumo encontrado" />
        ) : (
          grouped.map((g) => (
            <section key={g.kind} aria-labelledby={`ci-${g.kind}`}>
              <div className="mb-2 flex items-center gap-2">
                <h2 id={`ci-${g.kind}`} className="font-bold">
                  {INPUT_KIND[g.kind].plural}
                </h2>
                <span className="text-sm text-muted-foreground">· {g.items.length}</span>
              </div>
              <Card className="divide-y divide-border overflow-hidden">
                {g.items.map((i) => {
                  const uses = usedIn.get(i.id) ?? [];
                  return (
                    <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:flex-nowrap">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{i.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[i.supplier, uses.length ? `Usado em: ${uses.join(", ")}` : "Não usado em fichas"].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular-nums">
                          {formatUnitCost(inputUnitCost(i))}
                          <span className="text-sm font-semibold text-muted-foreground">/{i.unit}</span>
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {decimalText(i.package_size)} {i.unit} por {formatBRL(i.package_price)}
                        </p>
                      </div>
                      <div className="flex">
                        <Button variant="ghost" size="icon" onClick={() => openForm(i)} aria-label={`Editar ${i.name}`} title="Editar e ver histórico">
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setToDelete(i)} aria-label={`Excluir ${i.name}`} title="Excluir">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))
        )}
      </div>

      <Sheet open={formOpen} onClose={() => setFormOpen(false)} side="right" title={editing ? `Editar ${editing.name}` : "Novo insumo"}>
        {formOpen && (
          <InputForm
            key={editing?.id ?? "new"}
            input={editing}
            usedIn={editing ? (usedIn.get(editing.id) ?? []) : []}
            defaultKind={kind === "all" ? "ingredient" : kind}
            onCancel={() => setFormOpen(false)}
            onSaved={() => {
              setFormOpen(false);
              onChanged();
            }}
          />
        )}
      </Sheet>
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
        title={`Excluir “${toDelete?.name}”?`}
        description="O insumo e o histórico de preços dele somem. Insumos usados em fichas técnicas não podem ser excluídos."
        confirmLabel="Excluir insumo"
      />
    </>
  );
}

function InputForm({
  input,
  usedIn,
  defaultKind,
  onCancel,
  onSaved,
}: {
  input: CostInput | null;
  usedIn: string[];
  defaultKind: CostInputKind;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(input?.name ?? "");
  const [kind, setKind] = useState<CostInputKind>(input?.kind ?? defaultKind);
  const [unit, setUnit] = useState(input?.unit ?? (defaultKind === "packaging" ? "un" : "g"));
  const [sizeText, setSizeText] = useState(input ? decimalText(input.package_size) : "");
  const [priceText, setPriceText] = useState(input ? input.package_price.toFixed(2).replace(".", ",") : "");
  const [supplier, setSupplier] = useState(input?.supplier ?? "");
  const [saving, setSaving] = useState(false);

  const size = parseMoney(sizeText || "");
  const price = parseMoney(priceText || "");
  const valid = Number.isFinite(size) && size > 0 && Number.isFinite(price) && price >= 0;
  const u = unit.trim() || "un";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Informe o nome do insumo.");
    if (!valid) return toast.error("Revise o tamanho e o preço da embalagem.");
    setSaving(true);
    const result = await saveCostInput({ id: input?.id, name, kind, unit: u, package_size: size, package_price: price, supplier }).catch(() => ({
      ok: false as const,
      error: "Sem conexão. Tente novamente.",
    }));
    setSaving(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(input ? "Insumo atualizado." : "Insumo cadastrado.");
    onSaved();
  }

  const decimal = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/[^\d,.]/g, ""));

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
      <div className="flex-1 space-y-4 px-5 py-5">
        <Field label="Nome" hint="Ex.: Farinha de trigo, Óleo de soja, Caixa para 25.">
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo">
            {(p) => (
              <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as CostInputKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {INPUT_KIND[k].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Unidade da receita" hint="g, ml, un…">
            {(p) => <Input {...p} list="cost-units" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={12} />}
          </Field>
        </div>
        <datalist id="cost-units">
          {UNITS.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Embalagem tem (${u})`} hint="Ex.: 5000 para um saco de 5 kg em g.">
            {(p) => <Input {...p} inputMode="decimal" value={sizeText} onChange={decimal(setSizeText)} placeholder="1000" />}
          </Field>
          <Field label="Preço pago (R$)">
            {(p) => <Input {...p} inputMode="decimal" value={priceText} onChange={decimal(setPriceText)} placeholder="0,00" />}
          </Field>
        </div>
        <p className="rounded-md bg-surface-2 px-4 py-3 text-sm tabular-nums">
          Custo por {u}: <strong>{valid ? formatUnitCost(price / size) : "–"}</strong>
        </p>
        <Field label="Fornecedor" optional>
          {(p) => <Input {...p} value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={80} />}
        </Field>
        {usedIn.length > 0 && (
          <div className="rounded-md bg-surface-2 px-4 py-3 text-sm">
            <p className="font-semibold">Usado em</p>
            <p className="text-muted-foreground">{usedIn.join(", ")}</p>
            <p className="mt-1 text-xs text-muted-foreground">Mudar o preço recalcula o custo de todas estas fichas.</p>
          </div>
        )}
        {input && <PriceHistory inputId={input.id} unit={input.unit} />}
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          Salvar insumo
        </Button>
      </div>
    </form>
  );
}

function PriceHistory({ inputId, unit }: { inputId: string; unit: string }) {
  const [rows, setRows] = useState<CostInputPrice[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchInputPrices(inputId)
      .catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }))
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) toast.error(result.error);
        setRows(result.ok ? result.data : []);
      });
    return () => {
      cancelled = true;
    };
  }, [inputId]);

  return (
    <section>
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <History className="size-4 text-muted-foreground" aria-hidden />
        Histórico de preços
      </h3>
      {!rows ? (
        <Skeleton className="h-20" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem registros.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((r, i) => {
            const cost = r.package_size > 0 ? r.package_price / r.package_size : 0;
            const prev = rows[i + 1];
            const prevCost = prev && prev.package_size > 0 ? prev.package_price / prev.package_size : null;
            const change = prevCost ? ((cost - prevCost) / prevCost) * 100 : null;
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="tabular-nums">
                    {formatBRL(r.package_price)} · {decimalText(r.package_size)} {unit}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDateTime(r.created_at)}
                    {r.user_name ? ` · ${r.user_name}` : ""}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="font-semibold">{formatUnitCost(cost)}/{unit}</p>
                  {change !== null && Math.abs(change) >= 0.5 && (
                    <p className={cn("text-xs font-semibold", change > 0 ? "text-danger" : "text-success")}>
                      {change > 0 ? "+" : ""}
                      {Math.round(change)}%
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
