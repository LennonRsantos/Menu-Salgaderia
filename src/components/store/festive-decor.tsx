import { PartyPopper, Snowflake, Sparkles } from "lucide-react";
import { cn } from "@/lib/format";
import { FESTIVE, type ActiveTheme, type FestiveEffect, type FestiveId } from "@/lib/themes";

const ICONS: Record<FestiveId, React.ComponentType<{ className?: string }>> = {
  christmas: Snowflake,
  newyear: Sparkles,
  carnival: PartyPopper,
};

/** Thin strip above the menu header while a festive theme is on. */
export function FestiveBanner({ theme }: { theme: ActiveTheme }) {
  if (!theme.festive || !theme.message) return null;
  const Icon = ICONS[theme.festive];
  return (
    <div className="relative bg-primary text-primary-foreground">
      <p className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold sm:px-6">
        <Icon className="size-4 shrink-0" />
        <span>{theme.message}</span>
      </p>
    </div>
  );
}

// Fixed positions (left %, delay s, duration s, size px), so server and client render the same.
const PARTICLES = [
  [4, 0, 9, 6], [11, 3.2, 11, 4], [18, 1.4, 8, 7], [26, 5.1, 10, 5], [33, 2.3, 12, 4], [41, 0.8, 9, 6],
  [48, 4.4, 11, 5], [55, 1.9, 8, 7], [62, 6, 10, 4], [69, 3.6, 9, 6], [76, 0.4, 12, 5], [83, 2.8, 10, 7],
  [90, 5.5, 9, 4], [96, 1.1, 11, 6],
] as const;

// Carnival confetti mixes colors on purpose; they never carry meaning or text.
const CONFETTI = ["var(--color-brand-500)", "var(--color-gold-400)", "#2ec4b6", "#3a86ff", "#8ac926"];

function particleStyle(effect: FestiveEffect, i: number, [left, delay, duration, size]: (typeof PARTICLES)[number]): React.CSSProperties {
  if (effect === "sparkle") {
    // twinkles scattered over the header instead of falling
    return { left: `${left}%`, top: `${(i * 37) % 90}%`, width: size + 4, height: size + 4, animationDelay: `-${delay / 2}s` };
  }
  return {
    left: `${left}%`,
    width: size,
    height: effect === "confetti" ? size * 1.6 : size,
    // negative delay: particles are already mid-way when the page opens
    animationDelay: `-${delay}s`,
    animationDuration: `${effect === "confetti" ? duration * 0.75 : duration}s`,
    background: effect === "confetti" ? CONFETTI[i % CONFETTI.length] : undefined,
  };
}

/** Light decorative particles behind the header content; hidden for reduced motion. */
export function FestiveEffects({ theme }: { theme: ActiveTheme }) {
  if (!theme.festive || !theme.effects) return null;
  const effect = FESTIVE[theme.festive].effect;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          style={particleStyle(effect, i, p)}
          className={cn(
            "absolute",
            effect === "snow" && "-top-4 animate-snow-fall rounded-full bg-primary/25 dark:bg-white/40",
            effect === "confetti" && "-top-4 animate-confetti-fall rounded-[1px] opacity-80",
            effect === "sparkle" && "animate-sparkle rotate-45 bg-accent [clip-path:polygon(50%_0,62%_38%,100%_50%,62%_62%,50%_100%,38%_62%,0_50%,38%_38%)]",
          )}
        />
      ))}
    </div>
  );
}
