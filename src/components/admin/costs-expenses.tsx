"use client";

import { ChevronLeft, ChevronRight, Pencil, Plus, Repeat, Settings2, Trash2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteExpense, saveCostSettings, saveExpense } from "@/actions/costs";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { EXPENSE_CATEGORY, fixedMonthly, monthExpenses, monthOf } from "@/lib/costs";
import { cn, formatBRL, parseMoney } from "@/lib/format";
import { spNow } from "@/lib/hours";
import type { CostSettings, ExpenseCategory, OperatingExpense } from "@/types";

const CATEGORIES = Object.keys(EXPENSE_CATEGORY) as ExpenseCategory[];

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const monthLabel = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export function ExpensesTab({
  expenses,
  settings,
  soldLast30,
  month,
  onChanged,
}: {
  expenses: OperatingExpense[];
  settings: CostSettings;
  soldLast30: number;
  month: string;
  onChanged: () => Promise<void>;
}) {
  const [view, setView] = useState(month);
  const [editing, setEditing] = useState<OperatingExpense | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<OperatingExpense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const recurring = expenses.filter((e) => e.recurring);
  const oneOff = expenses.filter((e) => !e.recurring && e.date && monthOf(e.date) === view);
  const total = fixedMonthly(expenses, view);
  const byCategory = useMemo(() => {
    const sums = new Map<ExpenseCategory, number>();
    for (const e of monthExpenses(expenses, view)) sums.set(e.category, (sums.get(e.category) ?? 0) + e.amount);
    return [...sums].sort((a, b) => b[1] - a[1]);
  }, [expenses, view]);

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    const result = await deleteExpense(toDelete.id).catch(() => ({ ok: false as const, error: "Sem conexão." }));
    setDeleting(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Despesa excluída.");
    setToDelete(null);
    onChanged();
  }

  const openForm = (e: OperatingExpense | null) => {
    setEditing(e);
    setFormOpen(true);
  };

  const row = (e: OperatingExpense) => (
    <div key={e.id} className={cn("flex items-center gap-3 px-4 py-3", e.recurring && !e.active && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{e.name}</p>
          {e.recurring && !e.active && <Badge>Pausada</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[EXPENSE_CATEGORY[e.category], e.date && dayLabel(e.date), e.notes].filter(Boolean).join(" · ")}
        </p>
      </div>
      <p className="font-bold tabular-nums">{formatBRL(e.amount)}</p>
      <div className="flex">
        <Button variant="ghost" size="icon" onClick={() => openForm(e)} aria-label={`Editar ${e.name}`} title="Editar">
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setToDelete(e)} aria-label={`Excluir ${e.name}`} title="Excluir">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 px-4 sm:px-6 xl:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setView((v) => shiftMonth(v, -1))} aria-label="Mês anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <p className="min-w-40 text-center font-bold capitalize">{monthLabel(view)}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setView((v) => shiftMonth(v, 1))} aria-label="Próximo mês">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button onClick={() => openForm(null)}>
            <Plus className="size-4" />
            Nova despesa
          </Button>
        </div>

        <Card className="p-4">
          <p className="text-xs font-semibold text-muted-foreground">Total do mês</p>
          <p className="text-3xl font-bold tabular-nums">{formatBRL(total)}</p>
          {byCategory.length > 0 && (
            <ul className="mt-3 space-y-2">
              {byCategory.map(([category, amount]) => (
                <li key={category} className="text-sm">
                  <div className="flex justify-between gap-3 tabular-nums">
                    <span>{EXPENSE_CATEGORY[category]}</span>
                    <span className="text-muted-foreground">
                      {formatBRL(amount)} · {total > 0 ? Math.round((amount / total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${total > 0 ? (amount / total) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {expenses.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nenhuma despesa lançada"
            description="Lance aluguel, gás, energia, salários e outras contas. Elas são divididas entre os produtos pela produção do mês."
            action={<Button onClick={() => openForm(null)}>Lançar despesa</Button>}
          />
        ) : (
          <>
            <section aria-labelledby="exp-recurring">
              <div className="mb-2 flex items-center gap-2">
                <Repeat className="size-4 text-muted-foreground" aria-hidden />
                <h2 id="exp-recurring" className="font-bold">
                  Todo mês
                </h2>
                <span className="text-sm text-muted-foreground">· {recurring.length}</span>
              </div>
              <Card className="divide-y divide-border overflow-hidden">
                {recurring.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma despesa mensal.</p> : recurring.map(row)}
              </Card>
            </section>
            <section aria-labelledby="exp-oneoff">
              <div className="mb-2 flex items-center gap-2">
                <h2 id="exp-oneoff" className="font-bold">
                  Só neste mês
                </h2>
                <span className="text-sm text-muted-foreground">· {oneOff.length}</span>
              </div>
              <Card className="divide-y divide-border overflow-hidden">
                {oneOff.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma despesa avulsa em {monthLabel(view)}.</p> : oneOff.map(row)}
              </Card>
            </section>
          </>
        )}
      </div>

      <SettingsCard key={JSON.stringify(settings)} settings={settings} soldLast30={soldLast30} monthTotal={fixedMonthly(expenses, month)} onSaved={onChanged} />

      <Sheet open={formOpen} onClose={() => setFormOpen(false)} side="right" title={editing ? "Editar despesa" : "Nova despesa"}>
        {formOpen && (
          <ExpenseForm
            key={editing?.id ?? "new"}
            expense={editing}
            defaultDate={view === month ? spNow(new Date()).date : `${view}-01`}
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
        description={toDelete?.recurring ? "Ela sai de todos os meses. Para parar só daqui em diante, pause a despesa." : "A despesa sai do mês."}
        confirmLabel="Excluir despesa"
      />
    </div>
  );
}

function ExpenseForm({
  expense,
  defaultDate,
  onCancel,
  onSaved,
}: {
  expense: OperatingExpense | null;
  defaultDate: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(expense?.name ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "gas");
  const [amountText, setAmountText] = useState(expense ? expense.amount.toFixed(2).replace(".", ",") : "");
  const [recurring, setRecurring] = useState(expense?.recurring ?? true);
  const [date, setDate] = useState(expense?.date ?? defaultDate);
  const [active, setActive] = useState(expense?.active ?? true);
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseMoney(amountText || "");
    if (!name.trim()) return toast.error("Informe o nome da despesa.");
    if (!Number.isFinite(amount) || amount < 0) return toast.error("Informe o valor.");
    if (!recurring && !date) return toast.error("Informe a data da despesa.");
    setSaving(true);
    const result = await saveExpense({ id: expense?.id, name, category, amount, recurring, date: recurring ? null : date, active, notes }).catch(() => ({
      ok: false as const,
      error: "Sem conexão. Tente novamente.",
    }));
    setSaving(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(expense ? "Despesa atualizada." : "Despesa lançada.");
    onSaved();
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
      <div className="flex-1 space-y-4 px-5 py-5">
        <Field label="Nome" hint="Ex.: Botijão de gás, Aluguel, Conta de luz.">
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Categoria">
            {(p) => (
              <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Valor (R$)">
            {(p) => <Input {...p} inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="0,00" />}
          </Field>
        </div>
        <div className="rounded-md bg-surface-2 px-4 py-1">
          <Switch checked={recurring} onCheckedChange={setRecurring} label="Repete todo mês" />
          {recurring && <Switch checked={active} onCheckedChange={setActive} label="Ativa (conta nos custos)" />}
        </div>
        {recurring ? (
          <p className="text-xs text-muted-foreground">Use o valor médio por mês. Ex.: 2 botijões de R$ 120 por mês = R$ 240.</p>
        ) : (
          <Field label="Data">
            {(p) => <Input {...p} type="date" value={date ?? ""} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        )}
        <Field label="Observação" optional>
          {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} rows={2} />}
        </Field>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          Salvar despesa
        </Button>
      </div>
    </form>
  );
}

function SettingsCard({
  settings,
  soldLast30,
  monthTotal,
  onSaved,
}: {
  settings: CostSettings;
  soldLast30: number;
  monthTotal: number;
  onSaved: () => Promise<void>;
}) {
  const [unitsText, setUnitsText] = useState(settings.monthly_units ? String(settings.monthly_units) : "");
  const [targetText, setTargetText] = useState(String(settings.target_margin));
  const [pctText, setPctText] = useState(String(settings.sales_pct).replace(".", ","));
  const [saving, setSaving] = useState(false);

  const units = unitsText.trim() ? Number(unitsText) : null;
  const base = units ?? (soldLast30 > 0 ? soldLast30 : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = Number(targetText);
    const pct = parseMoney(pctText || "0");
    if (units !== null && (!Number.isInteger(units) || units <= 0)) return toast.error("Informe a produção em unidades inteiras.");
    if (!Number.isInteger(target) || target < 1 || target > 95) return toast.error("A meta de margem vai de 1% a 95%.");
    if (!Number.isFinite(pct) || pct < 0 || pct > 50) return toast.error("Impostos e taxas vão de 0% a 50%.");
    setSaving(true);
    const result = await saveCostSettings({ monthly_units: units, target_margin: target, sales_pct: pct }).catch(() => ({
      ok: false as const,
      error: "Sem conexão. Tente novamente.",
    }));
    setSaving(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Configurações salvas.");
    onSaved();
  }

  return (
    <Card className="h-fit p-4 xl:sticky xl:top-4">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <h2 className="flex items-center gap-1.5 font-bold">
            <Settings2 className="size-4 text-muted-foreground" aria-hidden />
            Rateio e metas
          </h2>
          <p className="text-sm text-muted-foreground">Como as despesas entram no custo de cada produto.</p>
        </div>
        <Field
          label="Produção por mês (unidades)"
          optional
          hint={soldLast30 > 0 ? `Vazio usa as vendas dos últimos 30 dias: ${soldLast30.toLocaleString("pt-BR")} un.` : "Sem vendas nos últimos 30 dias: informe uma estimativa."}
        >
          {(p) => <Input {...p} inputMode="numeric" value={unitsText} onChange={(e) => setUnitsText(e.target.value.replace(/\D/g, ""))} placeholder={soldLast30 > 0 ? String(soldLast30) : "Ex.: 3000"} />}
        </Field>
        <p className="rounded-md bg-surface-2 px-3 py-2 text-sm tabular-nums">
          {base ? (
            <>
              {formatBRL(monthTotal)} ÷ {base.toLocaleString("pt-BR")} un = <strong>{formatBRL(monthTotal / base)}</strong> por unidade
            </>
          ) : (
            "Sem base de produção: as despesas não entram no custo."
          )}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Meta de margem (%)">
            {(p) => <Input {...p} inputMode="numeric" value={targetText} onChange={(e) => setTargetText(e.target.value.replace(/\D/g, ""))} />}
          </Field>
          <Field label="Impostos e taxas (%)" hint="Simples, maquininha…">
            {(p) => <Input {...p} inputMode="decimal" value={pctText} onChange={(e) => setPctText(e.target.value.replace(/[^\d,.]/g, ""))} />}
          </Field>
        </div>
        <Button type="submit" loading={saving} className="w-full">
          Salvar configurações
        </Button>
      </form>
    </Card>
  );
}
