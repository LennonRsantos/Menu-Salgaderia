"use client";

import { ArrowLeft, Banknote, Bike, CalendarClock, CreditCard, Loader2, MapPin, QrCode, ShoppingBag, Store, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import { placeOrder } from "@/actions/orders";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, ChoiceGroup, EmptyState, Skeleton } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cartTotals, loadCustomer, rememberOrder, saveCustomer, useCart } from "@/lib/cart-store";
import { formatBRL, mapsLink, maskPhone, maskZip, onlyDigits, parseMoney } from "@/lib/format";
import { etaLabel, formatScheduled, spInstant } from "@/lib/hours";
import { useStoreStatus } from "@/lib/use-store-status";
import { deliveryFeeFor, findZone } from "@/lib/zones";
import { useMounted } from "@/lib/use-mounted";
import { checkoutSchema, fieldErrors } from "@/lib/validators";
import type { Fulfillment, PaymentMethod, StoreSettings } from "@/types";
import { getFullSlots } from "@/actions/schedule";
import { CartLine } from "./cart";
import { SchedulePicker } from "./schedule-picker";

export function CheckoutForm({ settings }: { settings: StoreSettings | null }) {
  const mounted = useMounted();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="Voltar ao cardápio">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 text-lg font-bold">Finalizar pedido</h1>
          <ThemeToggle />
        </div>
      </header>
      <main id="conteudo" tabIndex={-1} className="outline-none">
        {mounted ? (
          <CheckoutBody settings={settings} />
        ) : (
          <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
            <Skeleton className="h-40" />
            <Skeleton className="h-64" />
          </div>
        )}
      </main>
    </div>
  );
}

type Form = {
  name: string;
  phone: string;
  fulfillment: Fulfillment;
  zip: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  reference: string;
  payment_method: PaymentMethod;
  needs_change: boolean;
  change_for: string;
  notes: string;
  when: "asap" | "scheduled";
  date: string;
  time: string;
  /** Neighborhood typed by hand ("Outro bairro") instead of picked from the zones. */
  otherZone: boolean;
};

const OTHER_ZONE = "__other";

function CheckoutBody({ settings }: { settings: StoreSettings | null }) {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const [form, setForm] = useState<Form>(() => {
    const saved = loadCustomer();
    return {
      name: saved.name ?? "",
      phone: saved.phone ? maskPhone(saved.phone) : "",
      fulfillment: settings?.delivery_enabled === false ? "pickup" : "delivery",
      zip: saved.zip ? maskZip(saved.zip) : "",
      street: saved.street ?? "",
      number: saved.number ?? "",
      complement: saved.complement ?? "",
      neighborhood: saved.neighborhood ?? "",
      city: saved.city ?? "",
      reference: saved.reference ?? "",
      payment_method: "pix",
      needs_change: false,
      change_for: "",
      notes: "",
      when: "asap",
      date: "",
      time: "",
      otherZone: false,
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [fullSlots, setFullSlots] = useState<string[]>([]);

  const status = useStoreStatus(settings);
  const zones = settings?.zones ?? [];
  const { subtotal } = cartTotals(items);
  const zoneFee = settings ? deliveryFeeFor(settings, form.neighborhood) : 0;
  // only the modes the store has on; a single one is picked for the customer
  const modes: Fulfillment[] = [settings?.delivery_enabled !== false && "delivery", settings?.pickup_enabled !== false && "pickup"].filter(
    (m): m is Fulfillment => Boolean(m),
  );
  const fulfillment: Fulfillment = modes.includes(form.fulfillment) ? form.fulfillment : (modes[0] ?? "pickup");
  const deliveryEta = etaLabel(settings?.delivery_min, settings?.delivery_max);
  const pickupEta = etaLabel(settings?.pickup_min, settings?.pickup_max);
  const noDelivery = fulfillment === "delivery" && zoneFee === null && form.neighborhood.trim() !== "";
  const fee = fulfillment === "delivery" ? (zoneFee ?? 0) : 0;
  const total = subtotal + fee;
  const minOrder = settings?.min_order ?? 0;

  // out-of-stock items, or a closed store, leave scheduling as the only way to order
  const scheduleOnly = items.some((i) => i.scheduleOnly);
  const mustSchedule = Boolean(settings?.schedule_enabled) && (scheduleOnly || !status.open);
  const when = mustSchedule ? "scheduled" : form.when;
  const canOrderNow = status.open && !scheduleOnly;

  // slots at the per-slot limit, refreshed whenever the agenda opens
  const showAgenda = when === "scheduled" && Boolean(settings?.slot_capacity);
  useEffect(() => {
    if (!showAgenda) return;
    let cancelled = false;
    getFullSlots()
      .then((keys) => !cancelled && setFullSlots(keys))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showAgenda]);
  const blocked = when === "asap" ? !canOrderNow : !form.date || !form.time;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  async function lookupZip(masked: string) {
    const zip = onlyDigits(masked);
    if (zip.length !== 8) return;
    setZipLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
      const data = await res.json();
      if (data.erro) {
        setErrors((e) => ({ ...e, zip: "CEP não encontrado." }));
        return;
      }
      // with zones, the neighborhood from the CEP is matched to the list by name
      const zone = data.bairro ? findZone(zones, data.bairro) : undefined;
      setForm((f) => ({
        ...f,
        street: data.logradouro || f.street,
        neighborhood: zone ? zone.name : data.bairro || f.neighborhood,
        otherZone: zones.length > 0 && !zone && Boolean(data.bairro),
        city: data.localidade || f.city,
      }));
      document.querySelector<HTMLElement>(`[data-field="number"] input`)?.focus();
    } catch {
      // offline or blocked: the customer fills the address by hand
    } finally {
      setZipLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsed = checkoutSchema.safeParse({
      ...form,
      fulfillment,
      change_for: form.payment_method === "cash" && form.needs_change && form.change_for ? parseMoney(form.change_for) : null,
    });
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      const first = Object.keys(errs)[0];
      document.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] textarea`)?.focus();
      toast.error("Revise os campos destacados.");
      return;
    }
    const v = parsed.data;
    if (v.change_for !== null && v.change_for < total) {
      setErrors((er) => ({ ...er, change_for: `O troco deve ser para um valor acima de ${formatBRL(total)}.` }));
      return;
    }
    if (when === "scheduled" && (!form.date || !form.time)) {
      setErrors((er) => ({ ...er, time: "Escolha a data e o horário da encomenda." }));
      document.querySelector<HTMLElement>(`[data-field="date"] input`)?.focus();
      return;
    }

    setSubmitting(true);
    const result = await placeOrder({
      customer: { name: v.name, phone: v.phone },
      fulfillment: v.fulfillment,
      address:
        v.fulfillment === "delivery"
          ? {
              zip: onlyDigits(v.zip),
              street: v.street,
              number: v.number,
              complement: v.complement,
              neighborhood: v.neighborhood,
              city: v.city,
              reference: v.reference,
            }
          : null,
      payment_method: v.payment_method,
      change_for: v.change_for,
      notes: v.notes,
      scheduled_for: when === "scheduled" ? spInstant(form.date, form.time).toISOString() : null,
      items: items.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
        notes: i.notes,
        addon_ids: i.addons.map((a) => a.id),
      })),
    }).catch(() => ({ ok: false as const, error: "Sem conexão. Verifique a internet e tente novamente." }));

    if (!result.ok) {
      setSubmitting(false);
      toast.error(result.error);
      if (result.error.includes("lotar")) {
        // someone took the last place: show the agenda as it is now
        setForm((f) => ({ ...f, time: "" }));
        getFullSlots().then(setFullSlots).catch(() => {});
      }
      return;
    }

    saveCustomer({
      name: v.name,
      phone: v.phone,
      zip: onlyDigits(v.zip),
      street: v.street,
      number: v.number,
      complement: v.complement,
      neighborhood: v.neighborhood,
      city: v.city,
      reference: v.reference,
    });
    rememberOrder({ token: result.public_token, code: result.code, createdAt: new Date().toISOString() });
    router.replace(`/pedido/${result.public_token}`);
    clear();
    toast.success(`Pedido #${result.code} recebido! Envie também pelo WhatsApp.`);
  }

  if (items.length === 0 && !submitting) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Seu carrinho está vazio"
        description="Adicione itens do cardápio para finalizar o pedido."
        action={
          <Link href="/" className={buttonClasses("primary")}>
            Ver cardápio
          </Link>
        }
        className="py-24"
      />
    );
  }

  const field = (name: keyof Form) => ({ "data-field": name });
  const scheduling = Boolean(settings?.schedule_enabled);
  const step = (n: number) => (scheduling ? n + 1 : n);

  return (
    <form onSubmit={submit} noValidate className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_380px] lg:items-start">
      {/* min-w-0: the scrolling day strip must not widen the grid column */}
      <div className="min-w-0 space-y-6">
        <Section step={1} title="Seus dados" description="Usamos seu WhatsApp para avisar sobre o pedido.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div {...field("name")}>
              <Field label="Nome" error={errors.name}>
                {(p) => <Input {...p} name="name" autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Como podemos te chamar?" />}
              </Field>
            </div>
            <div {...field("phone")}>
              <Field label="WhatsApp" error={errors.phone}>
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    inputMode="tel"
                    name="tel"
                    autoComplete="tel-national"
                    spellCheck={false}
                    value={form.phone}
                    onChange={(e) => set("phone", maskPhone(e.target.value))}
                    placeholder="(11) 98888-7777"
                  />
                )}
              </Field>
            </div>
          </div>
        </Section>


        <Section step={2} title="Como você quer receber?">
          {modes.length < 2 && (
            <p className="mb-3 rounded-md bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
              {fulfillment === "pickup" ? "No momento, só retirada no balcão." : "No momento, só entrega."}
            </p>
          )}
          <ChoiceGroup<Fulfillment>
            name="fulfillment"
            columns={modes.length === 1 ? 1 : 2}
            value={fulfillment}
            onChange={(v) => set("fulfillment", v)}
            options={[
              {
                value: "delivery" as const,
                label: "Entrega",
                description: [
                  zones.length > 0 ? "Taxa conforme o bairro" : settings && settings.delivery_fee > 0 ? `Taxa ${formatBRL(settings.delivery_fee)}` : "Grátis",
                  deliveryEta,
                ]
                  .filter(Boolean)
                  .join(" · "),
                icon: Bike,
              },
              {
                value: "pickup" as const,
                label: "Retirada",
                description: pickupEta ? `Grátis · pronto em ${pickupEta}` : "Sem taxa",
                icon: Store,
              },
            ].filter((o) => modes.includes(o.value))}
          />
          {fulfillment === "delivery" && (
            <div className="mt-5 grid animate-fade-in gap-4 sm:grid-cols-6">
              <div className="sm:col-span-2" {...field("zip")}>
                <Field label="CEP" optional error={errors.zip} hint={zipLoading ? "Buscando endereço…" : undefined}>
                  {(p) => (
                    <div className="relative">
                      <Input
                        {...p}
                        inputMode="numeric"
                        name="postal-code"
                        autoComplete="postal-code"
                        spellCheck={false}
                        value={form.zip}
                        onChange={(e) => {
                          const masked = maskZip(e.target.value);
                          set("zip", masked);
                          lookupZip(masked);
                        }}
                        placeholder="00000-000"
                      />
                      {zipLoading && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                    </div>
                  )}
                </Field>
              </div>
              <div className="sm:col-span-4" {...field("street")}>
                <Field label="Rua" error={errors.street}>
                  {(p) => <Input {...p} name="street-address" autoComplete="address-line1" value={form.street} onChange={(e) => set("street", e.target.value)} />}
                </Field>
              </div>
              <div className="sm:col-span-2" {...field("number")}>
                <Field label="Número" error={errors.number}>
                  {(p) => <Input {...p} inputMode="numeric" value={form.number} onChange={(e) => set("number", e.target.value)} />}
                </Field>
              </div>
              <div className="sm:col-span-4" {...field("complement")}>
                <Field label="Complemento" optional>
                  {(p) => <Input {...p} value={form.complement} onChange={(e) => set("complement", e.target.value)} placeholder="Apto, bloco, casa…" />}
                </Field>
              </div>
              <div className="sm:col-span-3" {...field("neighborhood")}>
                {zones.length > 0 ? (
                  <Field
                    label="Bairro"
                    error={errors.neighborhood || (noDelivery ? `Ainda não entregamos em ${form.neighborhood}. Escolha retirada.` : undefined)}
                  >
                    {(p) => (
                      <div className="space-y-2">
                        <Select
                          {...p}
                          value={form.otherZone ? OTHER_ZONE : (findZone(zones, form.neighborhood)?.name ?? "")}
                          onChange={(e) =>
                            setForm((f) =>
                              e.target.value === OTHER_ZONE ? { ...f, otherZone: true, neighborhood: "" } : { ...f, otherZone: false, neighborhood: e.target.value },
                            )
                          }
                        >
                          <option value="">Escolha o bairro</option>
                          {zones.map((z) => (
                            <option key={z.id} value={z.name}>
                              {z.name} · {z.fee > 0 ? formatBRL(z.fee) : "grátis"}
                            </option>
                          ))}
                          {settings?.other_zones && <option value={OTHER_ZONE}>Outro bairro</option>}
                        </Select>
                        {form.otherZone && (
                          <Input aria-label="Nome do bairro" value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} placeholder="Nome do bairro" />
                        )}
                      </div>
                    )}
                  </Field>
                ) : (
                  <Field label="Bairro" error={errors.neighborhood}>
                    {(p) => <Input {...p} value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} />}
                  </Field>
                )}
              </div>
              <div className="sm:col-span-3" {...field("city")}>
                <Field label="Cidade" error={errors.city}>
                  {(p) => <Input {...p} name="city" autoComplete="address-level2" value={form.city} onChange={(e) => set("city", e.target.value)} />}
                </Field>
              </div>
              <div className="sm:col-span-6" {...field("reference")}>
                <Field label="Ponto de referência" optional>
                  {(p) => (
                    <Input {...p} value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Ex.: portão azul, ao lado da padaria" />
                  )}
                </Field>
              </div>
            </div>
          )}
          {fulfillment === "pickup" && (settings?.address || status.hoursText || pickupEta) && (
            <div className="mt-4 space-y-1.5 rounded-md bg-surface-2 px-3 py-3 text-sm text-muted-foreground">
              {settings?.address && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary-soft-foreground" />
                  <span>
                    Retire em <strong className="text-foreground">{settings.address}</strong>{" "}
                    <a href={mapsLink(settings.address)} target="_blank" rel="noreferrer" className="font-semibold whitespace-nowrap text-primary-soft-foreground hover:underline">
                      Abrir no mapa
                    </a>
                  </span>
                </p>
              )}
              {status.hoursText && (
                <p>
                  Horário: <strong className="text-foreground">{status.hoursText}</strong>
                </p>
              )}
              {pickupEta && (
                <p>
                  Fica pronto em <strong className="text-foreground">{pickupEta}</strong>
                </p>
              )}
            </div>
          )}
        </Section>

        {scheduling && (
          <Section
            step={3}
            title={fulfillment === "pickup" ? "Quando você quer retirar?" : "Quando você quer receber?"}
            description="Veja a agenda da loja e escolha o dia e o horário."
          >
            {mustSchedule ? (
              <p className="mb-4 rounded-md bg-accent-soft px-3 py-2.5 text-sm">
                {scheduleOnly
                  ? "Há itens esgotados hoje no carrinho. Escolha um dia na agenda."
                  : `A loja está fechada agora${status.next ? ` (${status.next.toLowerCase()})` : ""}. Escolha um dia na agenda.`}
              </p>
            ) : (
              <ChoiceGroup<Form["when"]>
                name="when"
                value={form.when}
                onChange={(v) => set("when", v)}
                options={[
                  { value: "asap", label: "O quanto antes", description: fulfillment === "pickup" ? "Retiro hoje" : "Preparamos agora", icon: Zap },
                  { value: "scheduled", label: "Agendar", description: "Escolher dia e horário", icon: CalendarClock },
                ]}
              />
            )}
            {when === "scheduled" && settings && (
              <div className="mt-4 animate-fade-in" {...field("time")}>
                <SchedulePicker
                  settings={settings}
                  date={form.date}
                  time={form.time}
                  full={fullSlots}
                  onChange={(date, time) => {
                    setForm((f) => ({ ...f, date, time }));
                    if (errors.time) setErrors((e) => ({ ...e, time: "" }));
                  }}
                  error={errors.time}
                />
              </div>
            )}
          </Section>
        )}

        <Section step={step(3)} title="Pagamento" description="O pagamento é feito na entrega ou retirada.">
          <ChoiceGroup<PaymentMethod>
            name="payment"
            columns={4}
            value={form.payment_method}
            onChange={(v) => set("payment_method", v)}
            options={[
              { value: "pix", label: "Pix", icon: QrCode },
              { value: "credit", label: "Crédito", icon: CreditCard },
              { value: "debit", label: "Débito", icon: Wallet },
              { value: "cash", label: "Dinheiro", icon: Banknote },
            ]}
          />
          {form.payment_method === "cash" && (
            <div className="mt-4 animate-fade-in space-y-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.needs_change}
                  onChange={(e) => set("needs_change", e.target.checked)}
                  className="size-5 accent-[var(--primary)]"
                />
                Preciso de troco
              </label>
              {form.needs_change && (
                <div className="max-w-60" {...field("change_for")}>
                  <Field label="Troco para quanto?" error={errors.change_for}>
                    {(p) => (
                      <Input
                        {...p}
                        inputMode="decimal"
                        value={form.change_for}
                        onChange={(e) => set("change_for", e.target.value.replace(/[^\d,.]/g, ""))}
                        placeholder="Ex.: 100,00"
                      />
                    )}
                  </Field>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section step={step(4)} title="Observações do pedido">
          <div {...field("notes")}>
            <Textarea
              aria-label="Observações do pedido"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value.slice(0, 300))}
              placeholder="Algo que devemos saber? (opcional)"
              rows={3}
            />
          </div>
        </Section>
      </div>

      <aside className="lg:sticky lg:top-20">
        <Card className="p-5">
          <h2 className="text-lg font-bold">Resumo</h2>
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <CartLine key={i.key} item={i} editable={false} />
            ))}
          </ul>
          <dl className="space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatBRL(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Taxa de entrega</dt>
              <dd className="tabular-nums">{fee > 0 ? formatBRL(fee) : "Grátis"}</dd>
            </div>
            <div className="flex items-baseline justify-between pt-2 text-base">
              <dt className="font-semibold">Total</dt>
              <dd className="text-xl font-bold tabular-nums">{formatBRL(total)}</dd>
            </div>
          </dl>
          {when === "scheduled" && form.date && form.time && (
            <p className="mt-4 flex items-center gap-2 rounded-md bg-accent-soft px-3 py-2 text-sm">
              <CalendarClock className="size-4 shrink-0" />
              <span>
                Encomenda para <strong>{formatScheduled(spInstant(form.date, form.time).toISOString())}</strong>
              </span>
            </p>
          )}
          {subtotal < minOrder && (
            <p className="mt-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
              Pedido mínimo de {formatBRL(minOrder)}.{" "}
              <Link href="/" className="font-semibold underline">
                Adicionar itens
              </Link>
            </p>
          )}
          {settings && !status.open && !scheduling && (
            <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
              A loja está fechada no momento.{status.next ? ` ${status.next}.` : ""}
            </p>
          )}
          {scheduleOnly && !scheduling && (
            <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">Há itens esgotados no carrinho.</p>
          )}
          <Button
            type="submit"
            size="lg"
            className="mt-5 w-full"
            loading={submitting}
            disabled={!settings || blocked || noDelivery || subtotal < minOrder}
          >
            {submitting ? "Enviando pedido…" : `${when === "scheduled" ? "Fazer encomenda" : "Fazer pedido"} · ${formatBRL(total)}`}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">Os valores são confirmados pela loja ao enviar.</p>
        </Card>
      </aside>
    </form>
  );
}

function Section({ step, title, description, children }: { step: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary-soft-foreground">
          {step}
        </span>
        <div>
          <h2 className="font-bold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}
