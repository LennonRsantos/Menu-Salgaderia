import { cn } from "@/lib/format";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onCheckedChange, label, hideLabel, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn("group inline-flex min-h-11 items-center gap-2.5 disabled:opacity-50", className)}
    >
      <span
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
      <span className={cn("text-sm font-medium", hideLabel && "sr-only")}>{label}</span>
    </button>
  );
}
