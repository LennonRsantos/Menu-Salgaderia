"use client";

import { Plus, Store, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getSettingsAdmin, saveSettings, type SettingsInput } from "@/actions/settings";
import { StoreLogo } from "@/components/store/store-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card, Skeleton } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { cn, maskPhone, onlyDigits, parseMoney } from "@/lib/format";
import { hoursLabel, isOpenAt, nextOpening, spNow, WEEKDAYS, type OpeningHours } from "@/lib/hours";
import { cleanImageUrl } from "@/lib/menu-admin";
import { activeTheme, carnivalWindow, FESTIVE, FESTIVE_IDS, PALETTE_IDS, PALETTES, type FestiveMode, type ThemeSettings } from "@/lib/themes";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import type { StoreSettings } from "@/types";
import { ImageUpload } from "./image-upload";
import { AdminOnly, PageHeader } from "./panel-shell";

export function SettingsPage() {
  return (
    <AdminOnly>
      <SettingsLoader />
    </AdminOnly>
  );
}

const EMPTY: StoreSettings = {
  id: 1,
  name: "Salgaderia",
  tagline: null,
  phone: null,
  logo_url: null,
  delivery_fee: 0,
  min_order: 0,
  is_open: false,
  opening_hours: null,
  auto_hours: false,
  hours: [],
  other_zones: true,
  zones: [],
  schedule_enabled: false,
  schedule_min_hours: 24,
  schedule_max_days: 30,
  address: null,
  delivery_enabled: true,
  pickup_enabled: true,
  delivery_min: null,
  delivery_max: null,
  pickup_min: null,
  pickup_max: null,
  slot_capacity: null,
  special_dates: [],
  theme_palette: "purple",
  festive_mode: "off",
  festive_message: null,
  festive_effects: true,
};

function SettingsLoader() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  useEffect(() => {
    getSettingsAdmin()
      .catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }))
      .then((result) => {
        if (!result.ok) toast.error(result.error);
        setSettings((result.ok ? result.settings : null) ?? EMPTY);
      });
  }, []);

  return (
    <div className="pb-8">
      <PageHeader title="Loja" description="Informações exibidas no cardápio público e regras do pedido." />
      <div className="px-4 sm:px-6">{settings ? <SettingsForm initial={settings} /> : <Skeleton className="h-96 max-w-3xl" />}</div>
    </div>
  );
}

const money = (n: number) => n.toFixed(2).replace(".", ",");
const onlyMoney = (v: string) => v.replace(/[^\d,.]/g, "");
// Monday first, as stores usually think about the week
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type DayForm = { enabled: boolean; open: string; close: string };
type ZoneForm = { key: string; name: string; fee: string };

const toInput = (s: StoreSettings): SettingsInput => ({ ...s, zones: s.zones.map((z) => ({ name: z.name, fee: z.fee })) });
const minutesText = (n: number | null) => (n === null ? "" : String(n));
const parseMinutes = (v: string) => (v.trim() === "" ? null : Number(v));

function SettingsForm({ initial }: { initial: StoreSettings }) {
  const [form, setForm] = useState({
    name: initial.name,
    tagline: initial.tagline ?? "",
    phone: initial.phone ? maskPhone(initial.phone) : "",
    logo_url: initial.logo_url,
    delivery_fee: money(initial.delivery_fee),
    min_order: money(initial.min_order),
    is_open: initial.is_open,
    opening_hours: initial.opening_hours ?? "",
    auto_hours: initial.auto_hours,
    days: Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((d) => {
        const h = initial.hours.find((x) => x.day === d);
        return [d, { enabled: Boolean(h), open: h?.open ?? "10:00", close: h?.close ?? "22:00" }];
      }),
    ) as Record<number, DayForm>,
    other_zones: initial.other_zones,
    zones: initial.zones.map<ZoneForm>((z) => ({ key: z.id, name: z.name, fee: money(z.fee) })),
    schedule_enabled: initial.schedule_enabled,
    schedule_min_hours: String(initial.schedule_min_hours),
    schedule_max_days: String(initial.schedule_max_days),
    slot_capacity: initial.slot_capacity === null ? "" : String(initial.slot_capacity),
    special_dates: initial.special_dates.map((d) => ({ key: `${d.date}-${d.title}`, date: d.date, title: d.title })),
    address: initial.address ?? "",
    delivery_enabled: initial.delivery_enabled,
    pickup_enabled: initial.pickup_enabled,
    delivery_min: minutesText(initial.delivery_min),
    delivery_max: minutesText(initial.delivery_max),
    pickup_min: minutesText(initial.pickup_min),
    pickup_max: minutesText(initial.pickup_max),
    theme_palette: initial.theme_palette,
    festive_mode: initial.festive_mode,
    festive_message: initial.festive_message ?? "",
    festive_effects: initial.festive_effects,
  });
  const [saving, setSaving] = useState(false);
  const [togglingOpen, setTogglingOpen] = useState(false);
  // what was last saved; the open/closed switch saves on its own, so it stays out
  const snapshot = (f: typeof form) =>
    JSON.stringify({ ...f, is_open: null, zones: f.zones.map((z) => [z.name, z.fee]), special_dates: f.special_dates.map((d) => [d.date, d.title]) });
  const [baseline, setBaseline] = useState(() => snapshot(form));
  useUnsavedChanges(snapshot(form) !== baseline);
  // last saved values; the open/closed switch saves on its own
  const saved = useRef(initial);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setDay = (day: number, patch: Partial<DayForm>) => setForm((f) => ({ ...f, days: { ...f.days, [day]: { ...f.days[day], ...patch } } }));
  const setZone = (key: string, patch: Partial<ZoneForm>) =>
    setForm((f) => ({ ...f, zones: f.zones.map((z) => (z.key === key ? { ...z, ...patch } : z)) }));

  const hours: OpeningHours[] = WEEK_ORDER.filter((d) => form.days[d].enabled).map((d) => ({ day: d, open: form.days[d].open, close: form.days[d].close }));

  async function persist(patch: Partial<SettingsInput>) {
    const next = { ...toInput(saved.current), ...patch };
    const result = await saveSettings(next).catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
    if (!result.ok) throw new Error(result.error);
    if (result.settings) saved.current = result.settings;
  }

  async function toggleOpen(value: boolean) {
    setTogglingOpen(true);
    set("is_open", value);
    try {
      await persist({ is_open: value });
      toast.success(value ? "Pedidos liberados." : "Pedidos pausados. O cardápio continua visível.");
    } catch (e) {
      set("is_open", !value);
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar.");
    } finally {
      setTogglingOpen(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fee = parseMoney(form.delivery_fee || "0");
    const min = parseMoney(form.min_order || "0");
    const zones = form.zones.map((z) => ({ name: z.name.trim(), fee: parseMoney(z.fee || "0") }));
    const minHours = Number(form.schedule_min_hours);
    const maxDays = Number(form.schedule_max_days);
    if (!form.name.trim()) return toast.error("Informe o nome da loja.");
    if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(min) || min < 0) return toast.error("Revise os valores.");
    if (zones.some((z) => !z.name || !Number.isFinite(z.fee) || z.fee < 0)) return toast.error("Revise o nome e a taxa de cada bairro.");
    if (form.logo_url?.trim() && !cleanImageUrl(form.logo_url)) return toast.error("O link da logo deve começar com https://");
    if (form.auto_hours && hours.length === 0) return toast.error("Marque ao menos um dia de funcionamento.");
    if (!Number.isInteger(minHours) || minHours < 0 || !Number.isInteger(maxDays) || maxDays < 1) return toast.error("Revise as regras de encomenda.");
    if (!form.delivery_enabled && !form.pickup_enabled) return toast.error("Ative a entrega ou a retirada.");
    if (form.special_dates.some((d) => !d.date || !d.title.trim())) return toast.error("Preencha a data e o nome de cada data especial.");
    const eta = {
      delivery_min: parseMinutes(form.delivery_min),
      delivery_max: parseMinutes(form.delivery_max),
      pickup_min: parseMinutes(form.pickup_min),
      pickup_max: parseMinutes(form.pickup_max),
    };
    if ((eta.delivery_min !== null && eta.delivery_max !== null && eta.delivery_max < eta.delivery_min) || (eta.pickup_min !== null && eta.pickup_max !== null && eta.pickup_max < eta.pickup_min)) {
      return toast.error("Nos tempos, o máximo deve ser maior que o mínimo.");
    }
    setSaving(true);
    try {
      await persist({
        name: form.name.trim(),
        tagline: form.tagline.trim() || null,
        phone: onlyDigits(form.phone) || null,
        logo_url: cleanImageUrl(form.logo_url),
        delivery_fee: fee,
        min_order: min,
        opening_hours: form.opening_hours.trim() || null,
        auto_hours: form.auto_hours,
        hours,
        other_zones: form.other_zones,
        zones,
        schedule_enabled: form.schedule_enabled,
        schedule_min_hours: minHours,
        schedule_max_days: maxDays,
        address: form.address.trim() || null,
        delivery_enabled: form.delivery_enabled,
        pickup_enabled: form.pickup_enabled,
        ...eta,
        slot_capacity: form.slot_capacity ? Number(form.slot_capacity) : null,
        special_dates: form.special_dates.map((d) => ({ date: d.date, title: d.title.trim() })),
        theme_palette: form.theme_palette,
        festive_mode: form.festive_mode,
        festive_message: form.festive_message.trim() || null,
        festive_effects: form.festive_effects,
      });
      setForm((f) => ({ ...f, zones: saved.current.zones.map((z) => ({ key: z.id, name: z.name, fee: money(z.fee) })) }));
      setBaseline(snapshot(form));
      toast.success("Configurações salvas.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  // what the storefront shows right now, with the hours being edited
  const preview = { is_open: form.is_open, auto_hours: form.auto_hours, hours };
  const openNow = isOpenAt(preview, new Date());
  const next = nextOpening(preview, new Date());

  return (
    <div className="max-w-3xl space-y-4">
      <Card className={cn("flex items-center justify-between gap-4 p-5", openNow ? "border-success/40" : "border-danger/40")}>
        <div className="flex items-center gap-3">
          <span className={cn("grid size-11 place-items-center rounded-full", openNow ? "bg-success-soft text-success-soft-foreground" : "bg-danger-soft text-danger-soft-foreground")}>
            <Store className="size-5" />
          </span>
          <div>
            <p className="font-bold">{!form.is_open ? "Pedidos pausados" : openNow ? "Aberta para pedidos" : "Fechada pelo horário"}</p>
            <p className="text-sm text-muted-foreground">
              {!form.is_open
                ? "O cardápio continua visível, mas pedidos ficam pausados."
                : openNow
                  ? form.auto_hours
                    ? "Abre e fecha sozinha conforme o horário abaixo."
                    : "Clientes podem fazer pedidos agora."
                  : `${next ?? "Fora do horário"}. Fecha e abre sozinha.`}
            </p>
          </div>
        </div>
        <Switch checked={form.is_open} onCheckedChange={toggleOpen} disabled={togglingOpen} label="Receber pedidos" hideLabel />
      </Card>

      <form onSubmit={submit} noValidate className="space-y-4">
        <Card className="space-y-5 p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <StoreLogo settings={{ ...initial, name: form.name, logo_url: cleanImageUrl(form.logo_url) }} size={72} />
              {form.logo_url && (
                <button
                  type="button"
                  onClick={() => set("logo_url", null)}
                  className="absolute -top-1 -right-1 grid size-7 place-items-center rounded-full border border-border bg-surface shadow-sm"
                  aria-label="Remover logo"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <ImageUpload
              label="Logo"
              hint="Imagem quadrada fica melhor. Sem logo, aparece a marca padrão."
              value={form.logo_url}
              onChange={(url) => set("logo_url", url)}
              maxSide={512}
              className="min-w-0 flex-1"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da loja">{(p) => <Input {...p} value={form.name} onChange={(e) => set("name", e.target.value)} />}</Field>
            <Field label="WhatsApp da loja" optional hint="Exibido para o cliente falar com vocês.">
              {(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} placeholder="(11) 99999-9999" />}
            </Field>
            <Field label="Endereço da loja" optional hint="Aparece no cardápio e para quem vai retirar." className="sm:col-span-2">
              {(p) => <Input {...p} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Rua das Flores, 123 - Centro, São Paulo" maxLength={200} />}
            </Field>
            <Field label="Frase de destaque" optional className="sm:col-span-2">
              {(p) => <Input {...p} value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Salgados fresquinhos, fritos na hora" />}
            </Field>
            <Field label="Pedido mínimo (R$)" hint="Use 0 para sem mínimo.">
              {(p) => <Input {...p} inputMode="decimal" value={form.min_order} onChange={(e) => set("min_order", onlyMoney(e.target.value))} />}
            </Field>
          </div>
        </Card>

        <AppearanceCard
          value={{ theme_palette: form.theme_palette, festive_mode: form.festive_mode, festive_message: form.festive_message, festive_effects: form.festive_effects }}
          saved={saved}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        />

        <Card className="space-y-4 p-5">
          <SectionTitle title="Horário de funcionamento" description="No modo automático, a loja abre e fecha sozinha nestes horários." />
          <div className="rounded-md bg-surface-2 px-4 py-1">
            <Switch checked={form.auto_hours} onCheckedChange={(v) => set("auto_hours", v)} label="Abrir e fechar automaticamente" />
          </div>
          {form.auto_hours ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {WEEK_ORDER.map((d) => {
                const day = form.days[d];
                return (
                  <li key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                    <Switch checked={day.enabled} onCheckedChange={(v) => setDay(d, { enabled: v })} label={WEEKDAYS[d]} className="w-24" />
                    {day.enabled ? (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-28">
                          <Input type="time" aria-label={`${WEEKDAYS[d]}: abre às`} value={day.open} onChange={(e) => setDay(d, { open: e.target.value })} className="h-10" />
                        </div>
                        <span className="text-muted-foreground">às</span>
                        <div className="w-28">
                          <Input type="time" aria-label={`${WEEKDAYS[d]}: fecha às`} value={day.close} onChange={(e) => setDay(d, { close: e.target.value })} className="h-10" />
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Fechado</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Field label="Horário exibido no cardápio" optional hint="Só informativo. A loja abre e fecha pelo botão no topo.">
              {(p) => <Input {...p} value={form.opening_hours} onChange={(e) => set("opening_hours", e.target.value)} placeholder="Ter a Dom, 10h às 22h" />}
            </Field>
          )}
          {form.auto_hours && hours.length > 0 && (
            <p className="text-sm text-muted-foreground">
              No cardápio: <strong className="text-foreground">{hoursLabel(hours)}</strong>
            </p>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle title="Entrega" description="Com bairros cadastrados, o cliente escolhe o bairro e a taxa é calculada sozinha." />
          <div className="rounded-md bg-surface-2 px-4 py-1">
            <Switch checked={form.delivery_enabled} onCheckedChange={(v) => set("delivery_enabled", v)} label="Fazer entregas" />
          </div>
          {form.delivery_enabled && (
            <>
              <EtaFields
                label="Tempo de entrega"
                min={form.delivery_min}
                max={form.delivery_max}
                onMin={(v) => set("delivery_min", v)}
                onMax={(v) => set("delivery_max", v)}
              />
              <div className="max-w-xs">
                <Field label={form.zones.length ? "Taxa padrão (R$)" : "Taxa de entrega (R$)"} hint={form.zones.length ? "Para bairros fora da lista." : "Use 0 para entrega grátis."}>
                  {(p) => <Input {...p} inputMode="decimal" value={form.delivery_fee} onChange={(e) => set("delivery_fee", onlyMoney(e.target.value))} />}
                </Field>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Taxas por bairro</p>
                {form.zones.length === 0 && (
                  <p className="rounded-md border border-dashed border-border-strong px-4 py-4 text-center text-sm text-muted-foreground">
                    Nenhum bairro. Todos pagam a taxa de entrega acima.
                  </p>
                )}
                <ul className="space-y-2">
                  {form.zones.map((z) => (
                    <li key={z.key} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <Input aria-label="Bairro" value={z.name} onChange={(e) => setZone(z.key, { name: e.target.value })} placeholder="Nome do bairro" className="h-10" />
                      </div>
                      <div className="w-24 shrink-0">
                        <Input aria-label={`Taxa de ${z.name || "bairro"}`} inputMode="decimal" value={z.fee} onChange={(e) => setZone(z.key, { fee: onlyMoney(e.target.value) })} placeholder="0,00" className="h-10" />
                      </div>
                      <button
                        type="button"
                        onClick={() => set("zones", form.zones.filter((x) => x.key !== z.key))}
                        className="grid size-9 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground"
                        aria-label={`Remover ${z.name || "bairro"}`}
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <Button variant="soft" size="sm" onClick={() => set("zones", [...form.zones, { key: crypto.randomUUID(), name: "", fee: "" }])}>
                  <Plus className="size-4" />
                  Bairro
                </Button>
              </div>
              {form.zones.length > 0 && (
                <div className="rounded-md bg-surface-2 px-4 py-1">
                  <Switch checked={form.other_zones} onCheckedChange={(v) => set("other_zones", v)} label="Entregar em outros bairros com a taxa padrão" />
                </div>
              )}
            </>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle title="Retirada no balcão" description="O cliente busca o pedido na loja, sem taxa." />
          <div className="rounded-md bg-surface-2 px-4 py-1">
            <Switch checked={form.pickup_enabled} onCheckedChange={(v) => set("pickup_enabled", v)} label="Aceitar retirada" />
          </div>
          {form.pickup_enabled && (
            <>
              <EtaFields
                label="Tempo para ficar pronto"
                min={form.pickup_min}
                max={form.pickup_max}
                onMin={(v) => set("pickup_min", v)}
                onMax={(v) => set("pickup_max", v)}
              />
              {!form.address.trim() && (
                <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
                  Cadastre o endereço da loja acima para o cliente saber onde buscar.
                </p>
              )}
            </>
          )}
          {!form.delivery_enabled && !form.pickup_enabled && (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">Ative a entrega ou a retirada para receber pedidos.</p>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle title="Agendamento" description="O cliente escolhe o dia e o horário da retirada ou entrega, dentro do funcionamento, mesmo com a loja fechada agora." />
          <div className="rounded-md bg-surface-2 px-4 py-1">
            <Switch checked={form.schedule_enabled} onCheckedChange={(v) => set("schedule_enabled", v)} label="Aceitar agendamento" />
          </div>
          {form.schedule_enabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Antecedência mínima (horas)" hint="Ex.: 24 para encomendar até o dia anterior.">
                {(p) => <Input {...p} inputMode="numeric" value={form.schedule_min_hours} onChange={(e) => set("schedule_min_hours", e.target.value.replace(/\D/g, ""))} />}
              </Field>
              <Field label="Agendar até (dias à frente)">
                {(p) => <Input {...p} inputMode="numeric" value={form.schedule_max_days} onChange={(e) => set("schedule_max_days", e.target.value.replace(/\D/g, ""))} />}
              </Field>
              <Field label="Pedidos por horário" optional hint="Vazio = sem limite. Cada horário dura 30 minutos; cheio, aparece como lotado.">
                {(p) => (
                  <Input
                    {...p}
                    inputMode="numeric"
                    value={form.slot_capacity}
                    onChange={(e) => set("slot_capacity", e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 3))}
                    placeholder="Sem limite"
                  />
                )}
              </Field>
            </div>
          )}
          {form.schedule_enabled && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Datas especiais da loja</p>
              <p className="text-xs text-muted-foreground">
                Feriados e datas comemorativas (Natal, Dia das Mães, Páscoa…) já aparecem sozinhos na agenda do cliente. Acrescente aqui as datas da sua loja, como a
                festa da cidade ou o aniversário da loja.
              </p>
              <ul className="space-y-2">
                {form.special_dates.map((d) => (
                  <li key={d.key} className="flex items-center gap-2">
                    <div className="w-40 shrink-0">
                      <Input
                        type="date"
                        aria-label="Data especial"
                        value={d.date}
                        onChange={(e) => set("special_dates", form.special_dates.map((x) => (x.key === d.key ? { ...x, date: e.target.value } : x)))}
                        className="h-10"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Input
                        aria-label="Nome da data"
                        value={d.title}
                        maxLength={40}
                        onChange={(e) => set("special_dates", form.special_dates.map((x) => (x.key === d.key ? { ...x, title: e.target.value } : x)))}
                        placeholder="Ex.: Festa da cidade"
                        className="h-10"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => set("special_dates", form.special_dates.filter((x) => x.key !== d.key))}
                      className="grid size-9 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground"
                      aria-label={`Remover ${d.title || "data"}`}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                variant="soft"
                size="sm"
                onClick={() => set("special_dates", [...form.special_dates, { key: crypto.randomUUID(), date: "", title: "" }])}
              >
                <Plus className="size-4" />
                Data especial
              </Button>
            </div>
          )}
        </Card>

        {/* phones and tablets: a full-width bar above the bottom navigation; desktop: plain button at the end */}
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 flex justify-end border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:bottom-0 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <Button type="submit" loading={saving} className="w-full sm:w-auto">
            Salvar alterações
          </Button>
        </div>
      </form>
    </div>
  );
}

type AppearanceForm = Omit<ThemeSettings, "festive_message"> & { festive_message: string };

const FESTIVE_OPTIONS: { id: FestiveMode; label: string; swatch?: { primary: string; accent: string } }[] = [
  { id: "off", label: "Desligado" },
  { id: "auto", label: "Automático pelo calendário" },
  ...FESTIVE_IDS.map((id) => ({ id, label: FESTIVE[id].label, swatch: FESTIVE[id] })),
];

const longDate = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** Palette and festive theme. The choice previews on the whole page until it is left. */
function AppearanceCard({
  value,
  saved,
  onChange,
}: {
  value: AppearanceForm;
  saved: React.RefObject<StoreSettings>;
  onChange: (patch: Partial<AppearanceForm>) => void;
}) {
  const today = spNow(new Date()).date;
  const preview = activeTheme({ ...value, festive_message: value.festive_message.trim() || null }, today);
  useEffect(() => {
    document.documentElement.dataset.palette = preview.palette;
  }, [preview.palette]);
  // leaving the page puts back what is saved (the layout only re-renders on save)
  useEffect(() => {
    const html = document.documentElement;
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the latest saved settings are wanted here, not the first ones
      html.dataset.palette = activeTheme(saved.current, spNow(new Date()).date).palette;
    };
  }, [saved]);

  const year = Number(today.slice(0, 4));
  const carnival = [carnivalWindow(year), carnivalWindow(year + 1)].find((w) => w.end >= today) ?? carnivalWindow(year + 1);

  return (
    <Card className="space-y-5 p-5">
      <SectionTitle title="Aparência" description="Cores do cardápio e do painel. Um tema festivo substitui a cor enquanto estiver ativo." />

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Cor</legend>
        <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-2">
          {PALETTE_IDS.map((id) => (
            <ThemeOption key={id} label={PALETTES[id].label} swatch={PALETTES[id]} checked={value.theme_palette === id} onSelect={() => onChange({ theme_palette: id })} />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Tema festivo</legend>
        <div role="radiogroup" aria-label="Tema festivo" className="flex flex-wrap gap-2">
          {FESTIVE_OPTIONS.map((o) => (
            <ThemeOption key={o.id} label={o.label} swatch={o.swatch} checked={value.festive_mode === o.id} onSelect={() => onChange({ festive_mode: o.id })} />
          ))}
        </div>
        {value.festive_mode === "auto" && (
          <div className="rounded-md bg-surface-2 px-4 py-3 text-sm">
            <p className="font-semibold">{preview.festive ? `Hoje: ${FESTIVE[preview.festive].label}.` : "Hoje: nenhum tema festivo, vale a cor escolhida."}</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              <li>Natal: {FESTIVE.christmas.period}</li>
              <li>Ano Novo: {FESTIVE.newyear.period}</li>
              <li>
                Carnaval: {longDate(carnival.start)} a {longDate(carnival.end)} de {carnival.end.slice(0, 4)}
              </li>
            </ul>
          </div>
        )}
      </fieldset>

      {value.festive_mode !== "off" && (
        <div className="space-y-4">
          <Field label="Mensagem da faixa" optional hint="Aparece no topo do cardápio enquanto o tema festivo estiver ativo. Vazio = mensagem do tema.">
            {(p) => (
              <Input
                {...p}
                value={value.festive_message}
                onChange={(e) => onChange({ festive_message: e.target.value })}
                placeholder={preview.festive ? FESTIVE[preview.festive].message : "Ex.: Boas festas! Encomende sua ceia."}
                maxLength={80}
              />
            )}
          </Field>
          <div className="rounded-md bg-surface-2 px-4 py-1">
            <Switch checked={value.festive_effects} onCheckedChange={(v) => onChange({ festive_effects: v })} label="Animação decorativa (neve, brilhos, confete)" />
          </div>
        </div>
      )}
    </Card>
  );
}

function ThemeOption({
  label,
  swatch,
  checked,
  onSelect,
}: {
  label: string;
  swatch?: { primary: string; accent: string };
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors",
        checked ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border-strong hover:bg-surface-2",
      )}
    >
      {swatch && (
        <span className="relative size-5 shrink-0 rounded-full" style={{ background: swatch.primary }} aria-hidden>
          <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface" style={{ background: swatch.accent }} />
        </span>
      )}
      {label}
    </button>
  );
}

/** "de [__] a [__] min": estimated time shown on the menu. Both optional. */
function EtaFields({ label, min, max, onMin, onMax }: { label: string; min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void }) {
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 3);
  return (
    <fieldset>
      <legend className="text-sm font-semibold">
        {label} <span className="font-normal text-muted-foreground">(opcional)</span>
      </legend>
      <div className="mt-1.5 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">de</span>
        <div className="w-20">
          <Input inputMode="numeric" aria-label={`${label}: mínimo em minutos`} value={min} onChange={(e) => onMin(digits(e.target.value))} placeholder="30" className="h-10 text-center" />
        </div>
        <span className="text-muted-foreground">a</span>
        <div className="w-20">
          <Input inputMode="numeric" aria-label={`${label}: máximo em minutos`} value={max} onChange={(e) => onMax(digits(e.target.value))} placeholder="45" className="h-10 text-center" />
        </div>
        <span className="text-muted-foreground">min</span>
      </div>
    </fieldset>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="font-bold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
