"use client";

import { Cake, Download, KeyRound, Mail, MapPin, Megaphone, MessageCircle, NotebookPen, Search, UserCheck, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  exportCustomersCsv,
  getCustomer,
  listCustomers,
  resetCustomerPassword,
  saveCustomerNotes,
  type CustomerDetail,
  type CustomerFilter,
  type CustomerRow,
  type CustomerSort,
} from "@/actions/customers-admin";
import { Button, buttonClasses } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { REFERRAL_LABEL, type ReferralSource } from "@/lib/customer";
import { cn, formatBRL, formatDateTime, maskPhone, whatsappLink } from "@/lib/format";
import { STATUS_TONE, statusLabel } from "@/lib/order-status";
import { AdminOnly, PageHeader } from "./panel-shell";

const FILTERS: { value: CustomerFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "account", label: "Com conta" },
  { value: "guest", label: "Sem conta" },
  { value: "birthday", label: "Aniversariantes do mês" },
  { value: "marketing", label: "Aceitam ofertas" },
  { value: "lost", label: "Sumidos (30 dias)" },
];

const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const birthdayLabel = (b: string | null) => (b ? `${b.slice(8, 10)}/${b.slice(5, 7)}` : null);
const thisMonth = (b: string | null) => Boolean(b) && Number(b!.slice(5, 7)) === new Date().getMonth() + 1;

export function CustomersPage() {
  return (
    <AdminOnly>
      <CustomersManager />
    </AdminOnly>
  );
}

function CustomersManager() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [sort, setSort] = useState<CustomerSort>("total");
  const [data, setData] = useState<{ rows: CustomerRow[]; summary: { customers: number; accounts: number; birthdays: number; marketing: number } } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const result = await listCustomers({ q, filter, sort }).catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
    if (!result.ok) {
      toast.error(result.error);
      setData((d) => d ?? { rows: [], summary: { customers: 0, accounts: 0, birthdays: 0, marketing: 0 } });
      return;
    }
    setData(result.data);
  }, [q, filter, sort]);

  // search waits for a pause in typing
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function exportCsv() {
    setExporting(true);
    const result = await exportCustomersCsv({ q, filter, sort }).catch(() => ({ ok: false as const, error: "Sem conexão." }));
    setExporting(false);
    if (!result.ok) return toast.error(result.error);
    const url = URL.createObjectURL(new Blob([result.data], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="pb-8">
      <PageHeader
        title="Clientes"
        description="Quem já pediu, quanto gastou e como falar com cada um."
        actions={
          <Button variant="outline" onClick={exportCsv} loading={exporting}>
            {!exporting && <Download className="size-4" />}
            Exportar CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:max-w-3xl sm:grid-cols-4 sm:gap-3 sm:px-6">
        <Summary icon={Users} label="Clientes" value={data?.summary.customers} />
        <Summary icon={UserCheck} label="Com conta" value={data?.summary.accounts} />
        <Summary icon={Cake} label="Aniversariantes do mês" value={data?.summary.birthdays} />
        <Summary icon={Megaphone} label="Aceitam ofertas" value={data?.summary.marketing} />
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative sm:max-w-sm sm:flex-1">
            <span className="sr-only">Buscar cliente</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nome, WhatsApp ou e-mail"
              className="h-10 w-full rounded-md border border-border-strong bg-surface pr-3 pl-9 text-base focus:border-primary focus:ring-3 focus:ring-primary/20 focus:outline-none sm:text-sm"
            />
          </label>
          <div className="sm:w-48">
            <Select aria-label="Ordenar por" value={sort} onChange={(e) => setSort(e.target.value as CustomerSort)} className="h-10">
              <option value="total">Mais gastaram</option>
              <option value="recent">Pedido mais recente</option>
              <option value="name">Nome (A–Z)</option>
            </Select>
          </div>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                filter === f.value ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border-strong bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6">
        {!data ? (
          <Skeleton className="h-64" />
        ) : data.rows.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum cliente encontrado" description="Os clientes aparecem aqui a partir do primeiro pedido ou cadastro." />
        ) : (
          <Card className="overflow-hidden">
            {/* desktop: table; phones: stacked rows */}
            <table className="hidden w-full text-sm md:table">
              <thead className="bg-surface-2 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Cliente</th>
                  <th className="px-4 py-2.5 font-semibold">WhatsApp</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Pedidos</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total gasto</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Último pedido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => (
                  <tr key={r.phone} onClick={() => setSelected(r.phone)} className="cursor-pointer hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setSelected(r.phone)} className="text-left font-semibold hover:underline">
                        {r.name}
                      </button>
                      <Tags row={r} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{maskPhone(r.phone)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.orders}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatBRL(r.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{shortDate(r.last_order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-border md:hidden">
              {data.rows.map((r) => (
                <li key={r.phone}>
                  <button type="button" onClick={() => setSelected(r.phone)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.name}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {maskPhone(r.phone)} · {r.orders} {r.orders === 1 ? "pedido" : "pedidos"} · último {shortDate(r.last_order)}
                      </span>
                      <Tags row={r} />
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">{formatBRL(r.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {data && data.rows.length >= 500 && <p className="mt-2 text-xs text-muted-foreground">Mostrando os 500 primeiros. Use a busca ou os filtros.</p>}
      </div>

      <CustomerSheet phone={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}

function Summary({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-sm">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="mt-1 block text-2xl font-bold tabular-nums">{value ?? "–"}</span>
    </div>
  );
}

function Tags({ row }: { row: CustomerRow }) {
  if (!row.has_account && !row.marketing_opt_in && !thisMonth(row.birthday) && !row.has_notes) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {row.has_account && <Badge tone="brand">Conta</Badge>}
      {row.marketing_opt_in && <Badge tone="success">Aceita ofertas</Badge>}
      {thisMonth(row.birthday) && (
        <Badge tone="warning">
          <Cake className="size-3" aria-hidden />
          Aniversário {birthdayLabel(row.birthday)}
        </Badge>
      )}
      {row.has_notes && (
        <Badge>
          <NotebookPen className="size-3" aria-hidden />
          Anotação
        </Badge>
      )}
    </span>
  );
}

function CustomerSheet({ phone, onClose, onChanged }: { phone: string | null; onClose: () => void; onChanged: () => void }) {
  return (
    <Sheet open={phone !== null} onClose={onClose} side="right" size="lg" title="Cliente">
      {phone && <CustomerDetailView key={phone} phone={phone} onChanged={onChanged} />}
    </Sheet>
  );
}

function CustomerDetailView({ phone, onChanged }: { phone: string; onChanged: () => void }) {
  const [c, setC] = useState<CustomerDetail | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCustomer(phone)
      .catch(() => ({ ok: false as const, error: "Sem conexão." }))
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) return toast.error(r.error);
        setC(r.data);
        setNotes(r.data.staff_notes);
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  async function save() {
    setSaving(true);
    const r = await saveCustomerNotes(phone, notes).catch(() => ({ ok: false as const, error: "Sem conexão." }));
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Anotação salva.");
    setC((prev) => prev && { ...prev, staff_notes: notes, has_notes: notes.trim() !== "" });
    onChanged();
  }

  async function reset() {
    setResetting(true);
    const r = await resetCustomerPassword(phone).catch(() => ({ ok: false as const, error: "Sem conexão." }));
    setResetting(false);
    if (!r.ok) return toast.error(r.error);
    setPassword(r.data);
  }

  if (!c) {
    return (
      <div className="space-y-3 px-5 py-5">
        <Skeleton className="h-20" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const ticket = c.orders > 0 ? c.total / c.orders : 0;
  return (
    <div className="space-y-5 px-5 py-5">
      <div>
        <p className="text-xl font-bold">{c.name}</p>
        <Tags row={c} />
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={whatsappLink(c.phone, `Oi, ${c.name.split(" ")[0]}!`)} target="_blank" rel="noreferrer" className={buttonClasses("primary", "sm")}>
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
          {c.has_account && (
            <Button variant="outline" size="sm" onClick={reset} loading={resetting}>
              {!resetting && <KeyRound className="size-4" />}
              Redefinir senha
            </Button>
          )}
        </div>
        {password && (
          <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
            Senha temporária: <strong className="font-mono tracking-wide select-all">{password}</strong>. Envie ao cliente e peça para trocar depois. Ela não será
            mostrada de novo.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total gasto" value={formatBRL(c.total)} />
        <Stat label="Pedidos" value={String(c.orders)} />
        <Stat label="Ticket médio" value={formatBRL(ticket)} />
        <Stat label="Cliente desde" value={shortDate(c.first_order ?? c.account_created_at)} />
      </div>

      <section className="space-y-1.5 text-sm">
        <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Dados</h3>
        <Info label="WhatsApp" value={maskPhone(c.phone)} />
        <Info label="E-mail" value={c.email ?? "—"} icon={Mail} />
        <Info label="Aniversário" value={birthdayLabel(c.birthday) ?? "—"} icon={Cake} />
        <Info label="Como conheceu" value={c.referral_source ? (REFERRAL_LABEL[c.referral_source as ReferralSource] ?? c.referral_source) : "—"} />
        <Info
          label="Ofertas pelo WhatsApp"
          value={c.marketing_opt_in ? `Aceitou em ${shortDate(c.marketing_opt_in_at)}` : "Não aceitou"}
          icon={Megaphone}
        />
        <Info label="Produto favorito" value={c.favorite ? `${c.favorite.name} (${c.favorite.quantity})` : "—"} />
        <Info label="Último pedido" value={shortDate(c.last_order)} />
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Anotações da equipe</h3>
        <Textarea
          aria-label="Anotações da equipe"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
          rows={3}
          placeholder="Ex.: prefere bem frito, retira sempre às 18h"
        />
        <Button size="sm" variant="soft" onClick={save} loading={saving} disabled={notes === c.staff_notes}>
          Salvar anotação
        </Button>
        <p className="text-xs text-muted-foreground">Só a equipe vê.</p>
      </section>

      {c.addresses.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Endereços</h3>
          <ul className="space-y-1.5 text-sm">
            {c.addresses.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  {a.street}, {a.number}
                  {a.complement ? ` · ${a.complement}` : ""} — {a.neighborhood}, {a.city}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Pedidos</h3>
        {c.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {c.recent.map((o) => (
              <li key={o.code} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    #{o.code}
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[o.status])}>{statusLabel(o.status)}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{o.items}</span>
                  <span className="block text-xs text-muted-foreground">{formatDateTime(o.created_at)}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatBRL(o.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <p className="flex items-center gap-2">
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : <span className="size-4 shrink-0" />}
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </p>
  );
}
