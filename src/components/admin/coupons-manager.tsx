"use client";

import { Pencil, Plus, Shuffle, TicketPercent, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { couponUses, deleteCoupon, listCoupons, saveCoupon, setCouponActive, type Coupon, type CouponUse } from "@/actions/coupons";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Card, ChoiceGroup, EmptyState, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { couponLabel, normalizeCode, type CouponKind } from "@/lib/coupons";
import { cn, formatBRL, formatDateTime, parseMoney } from "@/lib/format";
import { spNow } from "@/lib/hours";
import { AdminOnly, PageHeader } from "./panel-shell";

export function CouponsPage() {
  return (
    <AdminOnly>
      <CouponsManager />
    </AdminOnly>
  );
}

type Status = "active" | "expired" | "used_up" | "paused";
const STATUS: Record<Status, { label: string; tone: "success" | "neutral" | "warning" | "danger" }> = {
  active: { label: "Ativo", tone: "success" },
  paused: { label: "Pausado", tone: "neutral" },
  expired: { label: "Vencido", tone: "danger" },
  used_up: { label: "Esgotado", tone: "warning" },
};

function statusOf(c: Coupon, today: string): Status {
  if (!c.active) return "paused";
  if (c.expires_on < today) return "expired";
  if (c.max_uses !== null && c.uses >= c.max_uses) return "used_up";
  return "active";
}

const dateBR = (iso: string) => iso.split("-").reverse().join("/");
const usesLabel = (c: Coupon) => (c.max_uses === null ? `${c.uses} ${c.uses === 1 ? "uso" : "usos"}` : `${c.uses} de ${c.max_uses} ${c.max_uses === 1 ? "uso" : "usos"}`);

type Filter = "all" | "active" | "closed";

function CouponsManager() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Coupon | null>(null);
  const [deleting, startDelete] = useTransition();
  const today = spNow(new Date()).date;

  const load = useCallback(async () => {
    const result = await listCoupons().catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
    if (result.ok) setCoupons(result.data);
    else {
      toast.error(result.error);
      setCoupons((c) => c ?? []);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);

  async function toggle(c: Coupon, active: boolean) {
    setCoupons((list) => list?.map((x) => (x.id === c.id ? { ...x, active } : x)) ?? list);
    const result = await setCouponActive(c.id, active).catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
    if (!result.ok) {
      toast.error(result.error);
      load();
    }
  }

  function confirmDelete() {
    if (!toDelete) return;
    startDelete(async () => {
      const result = await deleteCoupon(toDelete.id).catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
      if (!result.ok) return void toast.error(result.error);
      toast.success("Cupom excluído.");
      setToDelete(null);
      load();
    });
  }

  const visible = (coupons ?? []).filter((c) => {
    const s = statusOf(c, today);
    return filter === "all" || (filter === "active" ? s === "active" : s !== "active");
  });

  return (
    <div className="pb-8">
      <PageHeader
        title="Cupons"
        description="Descontos que o cliente digita ao fechar o pedido. Cada cliente usa um cupom uma vez só."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Novo cupom
          </Button>
        }
      />
      <div className="space-y-4 px-4 sm:px-6">
        <div className="inline-flex rounded-md border border-border-strong bg-surface p-0.5" role="group" aria-label="Filtrar cupons">
          {(
            [
              ["all", "Todos"],
              ["active", "Ativos"],
              ["closed", "Encerrados"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                "h-9 rounded-sm px-3 text-sm font-semibold transition-colors",
                filter === value ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {!coupons ? (
          <Skeleton className="h-64" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={TicketPercent}
            title={coupons.length === 0 ? "Nenhum cupom ainda" : "Nenhum cupom neste filtro"}
            description={coupons.length === 0 ? "Crie um cupom e divulgue o código para seus clientes." : undefined}
            action={
              coupons.length === 0 ? (
                <Button onClick={() => setEditing("new")}>
                  <Plus className="size-4" />
                  Novo cupom
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {visible.map((c) => {
              const s = statusOf(c, today);
              return (
                <div key={c.id} className="flex items-start gap-3 px-4 py-3.5 sm:items-center">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
                    <TicketPercent className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 sm:flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-bold tracking-wide" translate="no">
                          {c.code}
                        </span>
                        <Badge tone={STATUS[s].tone}>{STATUS[s].label}</Badge>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {couponLabel(c)} de desconto · {usesLabel(c)} · até {dateBR(c.expires_on)}
                      </p>
                    </div>
                  </div>
                  <div className="-mr-2 flex shrink-0 items-center">
                    <Switch checked={c.active} onCheckedChange={(v) => toggle(c, v)} label={c.active ? `Pausar ${c.code}` : `Ativar ${c.code}`} hideLabel />
                    <Button variant="ghost" size="icon" onClick={() => setEditing(c)} aria-label={`Editar ${c.code}`}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setToDelete(c)}
                      disabled={c.uses > 0}
                      title={c.uses > 0 ? "Cupom já usado: pause em vez de excluir" : undefined}
                      aria-label={`Excluir ${c.code}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        side="right"
        title={editing === "new" ? "Novo cupom" : "Editar cupom"}
        description="O desconto vale só nos produtos, nunca na taxa de entrega."
      >
        {editing !== null && (
          <CouponForm
            key={editing === "new" ? "new" : editing.id}
            coupon={editing === "new" ? null : editing}
            today={today}
            onDone={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Sheet>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={`Excluir o cupom ${toDelete?.code}?`}
        description="Ele ainda não foi usado. O código deixa de funcionar na hora."
        confirmLabel="Excluir cupom"
      />
    </div>
  );
}

const plusDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** 8 characters without look-alikes (0/O, 1/I), easy to read aloud. */
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(8)), (n) => alphabet[n % alphabet.length]).join("");
}

function CouponForm({ coupon, today, onDone }: { coupon: Coupon | null; today: string; onDone: () => void }) {
  const used = (coupon?.uses ?? 0) > 0;
  const [form, setForm] = useState({
    code: coupon?.code ?? "",
    kind: (coupon?.kind ?? "percent") as CouponKind,
    value: coupon ? String(coupon.value).replace(".", ",") : "",
    max_uses: coupon?.max_uses ? String(coupon.max_uses) : "",
    expires_on: coupon?.expires_on ?? plusDays(today, 30),
    active: coupon?.active ?? true,
  });
  const [pending, startTransition] = useTransition();
  const [uses, setUses] = useState<CouponUse[] | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!coupon || !used) return;
    couponUses(coupon.id)
      .then((r) => setUses(r.ok ? r.data : []))
      .catch(() => setUses([]));
  }, [coupon, used]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseMoney(form.value || "0");
    if (!Number.isFinite(value) || value <= 0) return void toast.error("Informe o valor do desconto.");
    if (form.kind === "percent" && value > 100) return void toast.error("A porcentagem vai até 100%.");
    if (!form.expires_on) return void toast.error("Informe até quando o cupom vale.");
    startTransition(async () => {
      const result = await saveCoupon({
        id: coupon?.id,
        code: form.code,
        kind: form.kind,
        value,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        expires_on: form.expires_on,
        active: form.active,
      }).catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
      if (!result.ok) return void toast.error(result.error);
      toast.success(coupon ? "Cupom atualizado." : `Cupom ${result.data.code} criado.`);
      onDone();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 px-5 py-5">
      <Field label="Código" hint={used ? "Já usado: crie outro cupom para mudar o código ou o desconto." : "De 3 a 20 letras ou números. É o que o cliente digita."}>
        {(p) => (
          <div className="flex gap-2">
            <Input
              {...p}
              value={form.code}
              onChange={(e) => set("code", normalizeCode(e.target.value))}
              disabled={used}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="BEMVINDO10"
              className="uppercase"
            />
            {!used && (
              <Button type="button" variant="outline" onClick={() => set("code", randomCode())} className="shrink-0">
                <Shuffle className="size-4" />
                Gerar
              </Button>
            )}
          </div>
        )}
      </Field>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Tipo de desconto</p>
        <ChoiceGroup<CouponKind>
          name="kind"
          value={form.kind}
          onChange={(v) => !used && set("kind", v)}
          columns={2}
          options={[
            { value: "percent", label: "Porcentagem", description: "Ex.: 10% dos produtos" },
            { value: "amount", label: "Valor fixo", description: "Ex.: R$ 5,00 de desconto" },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={form.kind === "percent" ? "Desconto (%)" : "Desconto (R$)"}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              value={form.value}
              disabled={used}
              onChange={(e) => set("value", e.target.value.replace(/[^\d,.]/g, ""))}
              placeholder={form.kind === "percent" ? "10" : "5,00"}
            />
          )}
        </Field>
        <Field label="Limite de usos" optional hint="1 = uso único. Vazio = sem limite. Cada cliente usa uma vez.">
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={form.max_uses}
              onChange={(e) => set("max_uses", e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 7))}
              placeholder="Sem limite"
            />
          )}
        </Field>
        <Field label="Válido até" hint="Inclusive este dia.">
          {(p) => <Input {...p} type="date" min={today} value={form.expires_on} onChange={(e) => set("expires_on", e.target.value)} />}
        </Field>
      </div>

      <div className="rounded-md bg-surface-2 px-4 py-1">
        <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} label={form.active ? "Cupom ativo" : "Cupom pausado"} />
      </div>

      {used && (
        <section className="space-y-2">
          <p className="text-sm font-semibold">Quem usou</p>
          {!uses ? (
            <Skeleton className="h-20" />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {uses.map((u) => (
                <li key={u.order_code} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-semibold tabular-nums">#{u.order_code}</span>
                  <span className="min-w-0 flex-1 truncate">{u.customer_name}</span>
                  <span className="text-muted-foreground tabular-nums">−{formatBRL(u.discount)}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{formatDateTime(u.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={pending}>
          {coupon ? "Salvar alterações" : "Criar cupom"}
        </Button>
      </div>
    </form>
  );
}
