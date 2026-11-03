import { Minus, Plus } from "lucide-react";
import { cn, formatBRL } from "@/lib/format";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface shadow-sm", className)} {...props} />;
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "brand" | "success" | "danger" | "warning" | "info" }) {
  const tones = {
    neutral: "bg-surface-2 text-muted-foreground",
    brand: "bg-primary-soft text-primary-soft-foreground",
    success: "bg-success-soft text-success-soft-foreground",
    danger: "bg-danger-soft text-danger-soft-foreground",
    warning: "bg-warning-soft text-warning-soft-foreground",
    info: "bg-info-soft text-info-soft-foreground",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}
      {...props}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} aria-hidden />;
}

export function Price({ value, className }: { value: number; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatBRL(value)}</span>;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <div className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
  label = "Quantidade",
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  label?: string;
}) {
  const btn = size === "sm" ? "size-8" : "size-11";
  return (
    <div className="inline-flex items-center rounded-md border border-border-strong bg-surface" role="group" aria-label={label}>
      <button
        type="button"
        className={cn(btn, "grid place-items-center rounded-l-md text-primary-soft-foreground transition-colors hover:bg-surface-2 disabled:opacity-40")}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Diminuir"
      >
        <Minus className="size-4" />
      </button>
      <span className={cn("min-w-8 text-center font-semibold tabular-nums", size === "sm" && "text-sm")} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={cn(btn, "grid place-items-center rounded-r-md text-primary-soft-foreground transition-colors hover:bg-surface-2 disabled:opacity-40")}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Aumentar"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/** Radio-card group used for fulfillment, payment and similar choices. */
export function ChoiceGroup<T extends string>({
  value,
  onChange,
  options,
  name,
  columns = 2,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; description?: string; icon?: React.ComponentType<{ className?: string }> }[];
  name: string;
  columns?: 1 | 2 | 3 | 4;
}) {
  const cols = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <div role="radiogroup" className={cn("grid gap-2", cols)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              selected
                ? "border-primary bg-primary-soft text-primary-soft-foreground"
                : "border-border-strong bg-surface hover:bg-surface-2",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={selected}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.icon && <o.icon className="size-5 shrink-0" />}
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{o.label}</span>
              {o.description && (
                <span className={cn("text-xs", selected ? "opacity-80" : "text-muted-foreground")}>{o.description}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
