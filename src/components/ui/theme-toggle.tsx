"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useIsDesktop } from "@/lib/use-media-query";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/format";

type Mode = "light" | "dark" | "system";
// "system" only on computers; phones and tablets switch between light and dark
const DESKTOP_ORDER: Mode[] = ["light", "dark", "system"];
const TOUCH_ORDER: Mode[] = ["light", "dark"];
const META = {
  light: { icon: Sun, label: "Tema claro" },
  dark: { icon: Moon, label: "Tema escuro" },
  system: { icon: Monitor, label: "Tema do sistema" },
};

/** Cycles light → dark (→ system on computers). */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const desktop = useIsDesktop();
  const order = desktop ? DESKTOP_ORDER : TOUCH_ORDER;
  const saved = (mounted && (theme as Mode)) || "system";
  // off computers a saved "system" shows as the theme it resolves to
  const current: Mode = mounted && !desktop && saved === "system" ? (resolvedTheme === "dark" ? "dark" : "light") : saved;
  const next = order[(order.indexOf(current) + 1) % order.length];
  const Icon = META[current].icon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={cn(
        "grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground",
        className,
      )}
      aria-label={`${META[current].label}. Mudar para ${META[next].label.toLowerCase()}`}
      title={META[current].label}
    >
      <Icon className="size-5" />
    </button>
  );
}
