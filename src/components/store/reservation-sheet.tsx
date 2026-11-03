"use client";

import { CalendarCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getFullSlots } from "@/actions/schedule";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatScheduled, spInstant } from "@/lib/hours";
import { useReservation } from "@/lib/reservation-store";
import type { StoreSettings } from "@/types";
import { SchedulePicker } from "./schedule-picker";

/** "Reservar para outro dia": the agenda opened from the menu. */
export function ReservationSheet({ settings }: { settings: StoreSettings }) {
  const open = useReservation((s) => s.open);
  const setOpen = useReservation((s) => s.setOpen);
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Reservar para outro dia" description="Escolha o dia e o horário. Depois é só montar o pedido.">
      {open && <ReservationForm settings={settings} />}
    </Sheet>
  );
}

function ReservationForm({ settings }: { settings: StoreSettings }) {
  const current = useReservation((s) => s.value);
  const save = useReservation((s) => s.set);
  const [date, setDate] = useState(current?.date ?? "");
  const [time, setTime] = useState(current?.time ?? "");
  const [full, setFull] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (settings.slot_capacity) {
      getFullSlots()
        .then((keys) => !cancelled && setFull(keys))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [settings.slot_capacity]);

  function confirm() {
    if (!date || !time) return;
    save({ date, time });
    toast.success(`Reserva para ${formatScheduled(spInstant(date, time).toISOString())}. Agora escolha seus itens.`);
  }

  return (
    <div className="space-y-5 px-5 py-4">
      <SchedulePicker
        settings={settings}
        date={date}
        time={time}
        full={full}
        onChange={(d, t) => {
          setDate(d);
          setTime(t);
        }}
      />
      <div className="sticky bottom-0 -mx-5 border-t border-border bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button size="lg" className="w-full" disabled={!date || !time} onClick={confirm}>
          <CalendarCheck className="size-5" />
          {date && time ? `Reservar ${formatScheduled(spInstant(date, time).toISOString())}` : "Escolha o dia e o horário"}
        </Button>
      </div>
    </div>
  );
}
