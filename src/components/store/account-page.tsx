"use client";

import { ArrowLeft, CalendarClock, LogOut, MapPin, Receipt, RotateCcw, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getMyAccount,
  getMyOrders,
  signInCustomer,
  signOutCustomer,
  signUpCustomer,
  updateMyAccount,
  type CustomerAccount,
  type MyOrder,
} from "@/actions/customer";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useCart } from "@/lib/cart-store";
import { REFERRAL_LABEL, REFERRAL_SOURCES, type ReferralSource } from "@/lib/customer";
import { cn, formatBRL, formatDateTime, maskPhone, onlyDigits, whatsappLink } from "@/lib/format";
import { formatScheduled } from "@/lib/hours";
import { STATUS_TONE, statusLabel } from "@/lib/order-status";

const offline = { ok: false as const, error: "Sem conexão. Tente novamente." };

export function AccountPage({ storePhone }: { storePhone: string | null }) {
  // undefined: loading; null: signed out
  const [account, setAccount] = useState<CustomerAccount | null | undefined>(undefined);

  const load = useCallback(async () => {
    setAccount(await getMyAccount().catch(() => null));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="Voltar ao cardápio">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 text-lg font-bold">Minha conta</h1>
          <ThemeToggle />
        </div>
      </header>
      <main id="conteudo" tabIndex={-1} className="mx-auto max-w-2xl px-4 py-6 outline-none sm:px-6">
        {account === undefined ? (
          <div className="space-y-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-72" />
          </div>
        ) : account === null ? (
          <SignedOut storePhone={storePhone} onSignedIn={load} />
        ) : (
          <SignedIn account={account} onChange={setAccount} onSignedOut={() => setAccount(null)} />
        )}
      </main>
    </div>
  );
}

function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="mb-5 flex rounded-full border border-border-strong bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-10 flex-1 rounded-full text-sm font-semibold transition-colors",
            value === o.value ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Entrar / Criar conta ---------- */

function SignedOut({ storePhone, onSignedIn }: { storePhone: string | null; onSignedIn: () => void }) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  return (
    <>
      <div className="mb-5 text-center">
        <span className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
          <UserRound className="size-6" />
        </span>
        <p className="font-semibold">Peça mais rápido nas próximas vezes</p>
        <p className="text-sm text-muted-foreground">Seus dados e endereços ficam salvos, e você acompanha seus pedidos.</p>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "signin", label: "Entrar" },
          { value: "signup", label: "Criar conta" },
        ]}
      />
      {tab === "signin" ? <SignInForm storePhone={storePhone} onDone={onSignedIn} /> : <SignUpForm onDone={onSignedIn} />}
    </>
  );
}

function SignInForm({ storePhone, onDone }: { storePhone: string | null; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError("Informe e-mail e senha.");
    setLoading(true);
    const result = await signInCustomer(email, password).catch(() => offline);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    onDone();
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="E-mail">
          {(p) => <Input {...p} type="email" name="email" autoComplete="email" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Senha">
          {(p) => <Input {...p} type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger-soft-foreground">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Entrar
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Esqueceu a senha?{" "}
          {storePhone ? (
            <a
              href={whatsappLink(storePhone, "Olá! Esqueci a senha da minha conta no cardápio.")}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary-soft-foreground hover:underline"
            >
              Fale com a loja no WhatsApp
            </a>
          ) : (
            "Fale com a loja."
          )}
        </p>
      </form>
    </Card>
  );
}

function SignUpForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    birthday: "",
    referral_source: "" as ReferralSource | "",
    marketing_opt_in: false,
    privacy: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.privacy) return setError("Aceite a Política de Privacidade para criar a conta.");
    setLoading(true);
    const result = await signUpCustomer({
      name: form.name,
      phone: onlyDigits(form.phone),
      email: form.email,
      password: form.password,
      birthday: form.birthday || null,
      referral_source: form.referral_source || null,
      marketing_opt_in: form.marketing_opt_in,
      privacy: true,
    }).catch(() => offline);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    toast.success("Conta criada! Seus próximos pedidos ficam salvos aqui.");
    onDone();
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Nome">{(p) => <Input {...p} name="name" autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp">
            {(p) => (
              <Input
                {...p}
                type="tel"
                name="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={form.phone}
                onChange={(e) => set("phone", maskPhone(e.target.value))}
                placeholder="(11) 98888-7777"
              />
            )}
          </Field>
          <Field label="Aniversário" optional hint="Para receber um mimo no seu dia.">
            {(p) => <Input {...p} type="date" name="bday" autoComplete="bday" value={form.birthday} onChange={(e) => set("birthday", e.target.value)} />}
          </Field>
        </div>
        <Field label="E-mail">
          {(p) => <Input {...p} type="email" name="email" autoComplete="email" spellCheck={false} value={form.email} onChange={(e) => set("email", e.target.value)} />}
        </Field>
        <Field label="Senha" hint="Ao menos 8 caracteres.">
          {(p) => <Input {...p} type="password" name="new-password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />}
        </Field>
        <Field label="Como conheceu a loja?" optional>
          {(p) => (
            <Select {...p} value={form.referral_source} onChange={(e) => set("referral_source", e.target.value as ReferralSource | "")}>
              <option value="">Escolha…</option>
              {REFERRAL_SOURCES.map((r) => (
                <option key={r} value={r}>
                  {REFERRAL_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={form.marketing_opt_in} onChange={(e) => set("marketing_opt_in", e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
          <span>Quero receber promoções e novidades pelo WhatsApp.</span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={form.privacy} onChange={(e) => set("privacy", e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
          <span>
            Li e aceito a{" "}
            <Link href="/privacidade" target="_blank" className="font-semibold text-primary-soft-foreground hover:underline">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger-soft-foreground">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Criar conta
        </Button>
      </form>
    </Card>
  );
}

/* ---------- Conta aberta ---------- */

function SignedIn({
  account,
  onChange,
  onSignedOut,
}: {
  account: CustomerAccount;
  onChange: (a: CustomerAccount) => void;
  onSignedOut: () => void;
}) {
  const [tab, setTab] = useState<"orders" | "data" | "addresses">("orders");

  async function signOut() {
    await signOutCustomer().catch(() => {});
    onSignedOut();
  }

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft text-lg font-bold text-primary-soft-foreground">
          {account.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-bold">Olá, {account.name.split(" ")[0]}!</p>
          <p className="truncate text-sm text-muted-foreground">{account.email}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="size-4" />
          Sair
        </Button>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "orders", label: "Pedidos" },
          { value: "data", label: "Meus dados" },
          { value: "addresses", label: "Endereços" },
        ]}
      />
      {tab === "orders" && <OrdersTab />}
      {tab === "data" && <DataTab account={account} onSaved={onChange} />}
      {tab === "addresses" && <AddressesTab account={account} onSaved={onChange} />}
    </>
  );
}

function OrdersTab() {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const [orders, setOrders] = useState<MyOrder[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyOrders()
      .catch(() => offline)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) toast.error(r.error);
        setOrders(r.ok ? r.data : []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function reorder(order: MyOrder) {
    const items = order.items.filter((i) => i.product_id);
    for (const i of items) {
      add({
        productId: i.product_id!,
        name: i.product_name,
        imageUrl: null,
        unitPrice: i.unit_price,
        quantity: i.quantity,
        addons: i.addons.filter((a) => a.id).map((a) => ({ id: a.id!, name: a.name, price: a.price })),
        notes: i.notes ?? "",
      });
    }
    if (items.length === 0) return toast.error("Não foi possível repetir este pedido. Monte um novo pelo cardápio.");
    toast.success("Itens no carrinho. Os preços são conferidos ao finalizar.");
    router.push("/");
  }

  if (!orders) return <Skeleton className="h-48" />;
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nenhum pedido ainda"
        description="Os pedidos feitos com a conta aberta aparecem aqui."
        action={
          <Link href="/" className={buttonClasses("primary")}>
            Ver cardápio
          </Link>
        }
      />
    );
  }
  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.public_token}>
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">
                  Pedido #{o.code}{" "}
                  <span className={cn("ml-1 rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[o.status])}>{statusLabel(o.status)}</span>
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</p>
                {o.scheduled_for && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold">
                    <CalendarClock className="size-3.5" />
                    Para {formatScheduled(o.scheduled_for)}
                  </p>
                )}
              </div>
              <span className="shrink-0 font-bold tabular-nums">{formatBRL(o.total)}</span>
            </div>
            <p className="mt-2 truncate text-sm text-muted-foreground">{o.items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}</p>
            <div className="mt-3 flex gap-2">
              <Link href={`/pedido/${o.public_token}`} className={buttonClasses("outline", "sm")}>
                Acompanhar
              </Link>
              <Button variant="soft" size="sm" onClick={() => reorder(o)}>
                <RotateCcw className="size-4" />
                Pedir de novo
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function DataTab({ account, onSaved }: { account: CustomerAccount; onSaved: (a: CustomerAccount) => void }) {
  const [form, setForm] = useState({
    name: account.name,
    phone: maskPhone(account.phone),
    birthday: account.birthday ?? "",
    referral_source: (account.referral_source ?? "") as ReferralSource | "",
    marketing_opt_in: account.marketing_opt_in,
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await updateMyAccount({
      name: form.name,
      phone: onlyDigits(form.phone),
      birthday: form.birthday || null,
      referral_source: form.referral_source || null,
      marketing_opt_in: form.marketing_opt_in,
      addresses: account.addresses,
    }).catch(() => offline);
    setSaving(false);
    if (!result.ok) return toast.error(result.error);
    onSaved(result.data);
    toast.success("Dados salvos.");
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Nome">{(p) => <Input {...p} autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp">
            {(p) => <Input {...p} type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} />}
          </Field>
          <Field label="Aniversário" optional>
            {(p) => <Input {...p} type="date" value={form.birthday} onChange={(e) => set("birthday", e.target.value)} />}
          </Field>
        </div>
        <Field label="E-mail" hint="Para trocar o e-mail, fale com a loja.">
          {(p) => <Input {...p} value={account.email} disabled readOnly />}
        </Field>
        <Field label="Como conheceu a loja?" optional>
          {(p) => (
            <Select {...p} value={form.referral_source} onChange={(e) => set("referral_source", e.target.value as ReferralSource | "")}>
              <option value="">Escolha…</option>
              {REFERRAL_SOURCES.map((r) => (
                <option key={r} value={r}>
                  {REFERRAL_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="rounded-md bg-surface-2 px-4 py-1">
          <Switch checked={form.marketing_opt_in} onCheckedChange={(v) => set("marketing_opt_in", v)} label="Receber promoções pelo WhatsApp" />
        </div>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Salvar dados
        </Button>
      </form>
    </Card>
  );
}

function AddressesTab({ account, onSaved }: { account: CustomerAccount; onSaved: (a: CustomerAccount) => void }) {
  const [busy, setBusy] = useState(false);

  async function remove(index: number) {
    setBusy(true);
    const result = await updateMyAccount({
      name: account.name,
      phone: account.phone,
      birthday: account.birthday,
      referral_source: account.referral_source as ReferralSource | null,
      marketing_opt_in: account.marketing_opt_in,
      addresses: account.addresses.filter((_, i) => i !== index),
    }).catch(() => offline);
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    onSaved(result.data);
    toast.success("Endereço removido.");
  }

  if (account.addresses.length === 0) {
    return <EmptyState icon={MapPin} title="Nenhum endereço salvo" description="O endereço de cada entrega fica salvo aqui para o próximo pedido." />;
  }
  return (
    <Card className="divide-y divide-border">
      {account.addresses.map((a, i) => (
        <div key={`${a.street}-${a.number}-${i}`} className="flex items-start gap-3 px-4 py-3 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">
              {a.street}, {a.number}
            </span>
            {a.complement && ` · ${a.complement}`}
            <br />
            <span className="text-muted-foreground">
              {a.neighborhood} · {a.city}
            </span>
          </p>
          <Button variant="ghost" size="icon-sm" disabled={busy} onClick={() => remove(i)} aria-label={`Remover ${a.street}, ${a.number}`}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </Card>
  );
}
