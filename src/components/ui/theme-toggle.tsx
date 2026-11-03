"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/format";

const ORDER = ["light", "dark", "system"] as const;
const META = {
  light: { icon: Sun, label: "Tema claro" },
  dark: { icon: Moon, label: "Tema escuro" },
  system: { icon: Monitor, label: "Tema do sistema" },
};

/** Cycles light → dark → system. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = (mounted && (theme as (typeof ORDER)[number])) || "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
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
