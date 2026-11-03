"use client";

import {
  Boxes,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Ellipsis,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, use, useEffect, useState } from "react";
import { toast } from "sonner";
import { getMyProfile, signOutStaff } from "@/actions/auth";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";
import type { Profile } from "@/types";

const ProfileContext = createContext<Profile | null>(null);

/** Current staff profile. Only usable inside the panel shell. */
export function useProfile() {
  const profile = use(ProfileContext);
  if (!profile) throw new Error("useProfile must be used inside PanelShell");
  return profile;
}

type NavItem = {
  href: string;
  label: string;
  /** Label under the icon on phones and tablets. */
  short?: string;
  icon: typeof LayoutDashboard;
  adminOnly: boolean;
  /** "main": the daily pages, always in the bottom bar / rail. "more": management, behind "Mais". */
  group: "main" | "more";
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, adminOnly: true, group: "more" },
  { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList, adminOnly: false, group: "main" },
  { href: "/admin/encomendas", label: "Encomendas", short: "Agenda", icon: CalendarClock, adminOnly: false, group: "main" },
  { href: "/admin/cardapio", label: "Cardápio", icon: UtensilsCrossed, adminOnly: false, group: "main" },
  { href: "/admin/estoque", label: "Estoque", icon: Boxes, adminOnly: false, group: "main" },
  { href: "/admin/equipe", label: "Equipe", icon: Users, adminOnly: true, group: "more" },
  { href: "/admin/configuracoes", label: "Loja", icon: Settings, adminOnly: true, group: "more" },
];

export function PanelShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  // "Mais" closes by itself on navigation
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMoreOpen(false);
  }

  // Re-checks the session and staff row on load and whenever the tab regains
  // focus, so a deactivated or demoted account loses access without reloading.
  // Server actions and routes check it again on every call.
  useEffect(() => {
    let cancelled = false;
    let hadProfile = false;

    const check = async () => {
      const result = await getMyProfile().catch(() => ({ profile: null, error: "Sem conexão. Tente novamente." }));
      if (cancelled) return;
      if (result.profile) {
        hadProfile = true;
        setProfile(result.profile);
        setLoadError(null);
      } else if (result.error) {
        if (!hadProfile) setLoadError(result.error);
      } else {
        if (hadProfile) toast.error("Sua conta não tem mais acesso ao painel.");
        setProfile(null);
        await signOutStaff();
        router.replace("/admin/login");
      }
    };

    check();
    const onFocus = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [router]);

  async function signOut() {
    await signOutStaff();
    router.replace("/admin/login");
  }

  const nav = NAV.filter((n) => !n.adminOnly || profile?.role === "admin");
  const main = nav.filter((n) => n.group === "main");
  const more = nav.filter((n) => n.group === "more");
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const moreActive = more.some((n) => isActive(n.href));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar: every page, labelled */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand image */}
          <img src="/brand/menu-icon.png" alt="" width={36} height={36} className="size-9 rounded-lg border border-border" />
          <div className="leading-tight">
            <p className="font-bold" translate="no">
              Menu
            </p>
            <p className="text-xs text-muted-foreground">Gestão de pedidos</p>
          </div>
          <ThemeToggle className="ml-auto" />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Painel">
          {profile
            ? nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors",
                    isActive(n.href)
                      ? "bg-primary-soft text-primary-soft-foreground"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <n.icon className="size-5" />
                  {n.label}
                </Link>
              ))
            : Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
        </nav>
        <div className="border-t border-border p-3">
          <Link href="/" target="_blank" className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground">
            <ExternalLink className="size-4" />
            Ver cardápio público
          </Link>
          {profile && <UserCard profile={profile} onSignOut={signOut} />}
        </div>
      </aside>

      {/* Tablet rail: the daily pages + "Mais" */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-center border-r border-border bg-surface py-4 md:flex lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand image */}
        <img src="/brand/menu-icon.png" alt="Menu" width={40} height={40} className="mb-6 size-10 rounded-xl border border-border" />
        {profile && (
          <nav className="flex w-full flex-1 flex-col items-center gap-1 px-2" aria-label="Painel">
            {main.map((n) => (
              <NavTab key={n.href} item={n} active={isActive(n.href)} />
            ))}
            <div className="mt-auto w-full">
              <MoreButton active={moreActive} onOpen={() => setMoreOpen(true)} />
            </div>
          </nav>
        )}
      </aside>

      <div className="flex min-w-0 flex-col md:pl-20 lg:pl-0">
        <main id="conteudo" tabIndex={-1} className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] outline-none md:pb-0">
          {profile ? (
            <ProfileContext value={profile}>{children}</ProfileContext>
          ) : loadError ? (
            <EmptyState
              icon={ShieldCheck}
              title="Não foi possível abrir o painel"
              description={loadError}
              action={
                <div className="flex gap-2">
                  <button type="button" onClick={() => window.location.reload()} className={buttonClasses("primary")}>
                    Tentar de novo
                  </button>
                  <button type="button" onClick={signOut} className={buttonClasses("outline")}>
                    Sair
                  </button>
                </div>
              }
              className="py-24"
            />
          ) : (
            <div className="space-y-4 p-4 sm:p-6">
              <Skeleton className="h-8 w-48" />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28" />
                ))}
              </div>
              <Skeleton className="h-72" />
            </div>
          )}
        </main>

        {/* Phone bottom bar: the daily pages + "Mais" */}
        {profile && (
          <nav
            className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
            aria-label="Painel"
          >
            {main.map((n) => (
              <NavTab key={n.href} item={n} active={isActive(n.href)} />
            ))}
            <MoreButton active={moreActive} onOpen={() => setMoreOpen(true)} />
          </nav>
        )}
      </div>

      {profile && <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={more} isActive={isActive} profile={profile} onSignOut={signOut} />}
    </div>
  );
}

function MoreButton({ active, onOpen }: { active: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" className={tabClasses(active)}>
      <span className={pillClasses(active)}>
        <Ellipsis className="size-5" />
      </span>
      Mais
    </button>
  );
}

const tabClasses = (active: boolean) =>
  cn(
    "flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors md:w-full md:flex-none",
    active ? "text-primary-soft-foreground" : "text-muted-foreground hover:text-foreground",
  );
const pillClasses = (active: boolean) => cn("grid h-8 w-14 place-items-center rounded-full transition-colors", active && "bg-primary-soft");

function NavTab({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={tabClasses(active)}>
      <span className={pillClasses(active)}>
        <item.icon className="size-5" />
      </span>
      {item.short ?? item.label}
    </Link>
  );
}

/** "Mais": management pages, the public menu, theme and sign out, for phones and tablets. */
function MoreSheet({
  open,
  onClose,
  items,
  isActive,
  profile,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  isActive: (href: string) => boolean;
  profile: Profile;
  onSignOut: () => void;
}) {
  const row = "flex h-12 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors hover:bg-surface-2";
  return (
    <Sheet open={open} onClose={onClose} title="Menu" size="sm">
      <div className="space-y-4 px-5 pt-1 pb-5">
        <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-3">
          <Initials profile={profile} />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-semibold">{profile.full_name || profile.email}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {profile.role === "admin" && <ShieldCheck className="size-3" />}
              {profile.role === "admin" ? "Gerente" : "Funcionário"}
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <nav aria-label="Gestão">
            <p className="px-3 pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">Gestão</p>
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={onClose}
                aria-current={isActive(n.href) ? "page" : undefined}
                className={cn(row, isActive(n.href) && "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft")}
              >
                <n.icon className="size-5 text-muted-foreground" />
                <span className="flex-1">{n.label}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </nav>
        )}

        <div className="space-y-1 border-t border-border pt-3">
          <Link href="/" target="_blank" onClick={onClose} className={row}>
            <ExternalLink className="size-5 text-muted-foreground" />
            <span className="flex-1">Ver cardápio público</span>
          </Link>
          <div className="flex items-center gap-3 px-3 py-1.5">
            <span className="flex-1 text-sm font-semibold">Tema</span>
            <ThemeChoice />
          </div>
          <button type="button" onClick={onSignOut} className={cn(row, "text-danger hover:bg-danger-soft")}>
            <LogOut className="size-5" />
            Sair
          </button>
        </div>
      </div>
    </Sheet>
  );
}

const THEMES = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? (theme ?? "system") : "system";
  return (
    <div className="flex rounded-full border border-border-strong p-0.5" role="radiogroup" aria-label="Tema">
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={current === t.value}
          aria-label={t.label}
          title={t.label}
          onClick={() => setTheme(t.value)}
          className={cn(
            "grid size-8 place-items-center rounded-full transition-colors",
            current === t.value ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <t.icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

function Initials({ profile }: { profile: Profile }) {
  const initials = (profile.full_name || profile.email)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-3 text-sm font-bold">{initials}</span>;
}

function UserCard({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-md px-2 py-2">
      <Initials profile={profile} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">{profile.full_name || profile.email}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {profile.role === "admin" && <ShieldCheck className="size-3" />}
          {profile.role === "admin" ? "Gerente" : "Funcionário"}
        </p>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        aria-label="Sair"
        title="Sair"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

/** Wraps admin-only pages; staff sees a friendly notice instead. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  if (profile.role === "admin") return children;
  return (
    <EmptyState
      icon={ShieldCheck}
      title="Acesso restrito ao gerente"
      description="Seu perfil de funcionário tem acesso a pedidos e cardápio."
      action={
        <Link href="/admin/pedidos" className={buttonClasses("primary")}>
          Ir para pedidos
        </Link>
      }
      className="py-24"
    />
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-5 pb-4 sm:px-6 sm:pt-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">{actions}</div>}
    </div>
  );
}
