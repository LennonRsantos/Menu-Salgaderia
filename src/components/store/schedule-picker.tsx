"use client";

import { useState } from "react";
import { cn } from "@/lib/format";
import { scheduleDays } from "@/lib/hours";
import type { StoreSettings } from "@/types";

/**
 * The store's agenda for the customer: next days (closed ones greyed out) and
 * the free 30-minute slots of the chosen day. Full slots stay visible as "Lotado".
 */
export function SchedulePicker({
  settings,
  date,
  time,
  full,
  onChange,
  error,
}: {
  settings: StoreSettings;
  date: string;
  time: string;
  /** "YYYY-MM-DD HH:MM" keys of slots at the per-slot limit */
  full: string[];
  onChange: (date: string, time: string) => void;
  error?: string;
}) {
  // computed once per visit; the server re-checks lead time and hours on submit
  const [days] = useState(() => scheduleDays(settings, new Date()));
  const current = date || days.find((d) => d.slots.length > 0)?.date || "";
  const day = days.find((d) => d.date === current);
  const freeCount = day ? day.slots.filter((t) => !full.includes(`${day.date} ${t}`)).length : 0;

  if (!days.some((d) => d.slots.length > 0)) {
    return <p className="rounded-md bg-surface-2 px-3 py-3 text-sm text-muted-foreground">Não há horários disponíveis nos próximos dias.</p>;
  }

  return (
    <div className="space-y-4">
      <div
        role="radiogroup"
        aria-label="Dia"
        className="no-scrollbar -mx-5 flex snap-x gap-2 overflow-x-auto scroll-px-5 px-5 pb-1"
      >
        {days.map((d) => {
          const selected = d.date === current;
          const disabled = d.slots.length === 0;
          return (
            <button
              key={d.date}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(d.date, "")}
              className={cn(
                "flex w-[4.5rem] shrink-0 snap-start flex-col items-center rounded-lg border px-2 py-2 transition-colors",
                selected ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border-strong bg-surface hover:bg-surface-2",
                disabled && "cursor-not-allowed border-border bg-surface-2 opacity-60 hover:bg-surface-2",
              )}
            >
              <span className="text-xs font-semibold">{d.label}</span>
              <span className="text-base font-bold tabular-nums">{d.dayMonth}</span>
              {disabled && <span className="text-[10px] font-medium text-muted-foreground">{d.reason === "closed" ? "Fechado" : "Sem horário"}</span>}
            </button>
          );
        })}
      </div>

      {day && (
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            {freeCount > 0 ? `${freeCount} ${freeCount === 1 ? "horário livre" : "horários livres"}` : "Todos os horários deste dia estão lotados."}
          </p>
          <div role="radiogroup" aria-label="Horário" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {day.slots.map((t) => {
              const isFull = full.includes(`${day.date} ${t}`);
              const selected = current === date && t === time;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={isFull ? `${t}, lotado` : t}
                  disabled={isFull}
                  onClick={() => onChange(day.date, t)}
                  className={cn(
                    "flex h-11 flex-col items-center justify-center rounded-md border text-sm font-semibold tabular-nums transition-colors",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface hover:bg-surface-2",
                    isFull && "cursor-not-allowed border-border bg-surface-2 text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  <span className={cn(isFull && "line-through")}>{t}</span>
                  {isFull && <span className="text-[10px] leading-none font-medium">Lotado</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
