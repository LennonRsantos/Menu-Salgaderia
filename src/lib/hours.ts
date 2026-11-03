// Opening hours and scheduling rules, in the store's time zone. Pure (no
// imports), so the server order check and the client header agree.

export interface OpeningHours {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  /** "HH:MM"; a close earlier than open runs past midnight. */
  open: string;
  close: string;
}

interface HoursSettings {
  is_open: boolean;
  auto_hours: boolean;
  hours: OpeningHours[];
}

interface ScheduleSettings extends HoursSettings {
  schedule_enabled: boolean;
  schedule_min_hours: number;
  schedule_max_days: number;
}

export const TIME_ZONE = "America/Sao_Paulo";
// Brazil has had no daylight saving time since 2019.
const OFFSET = "-03:00";
export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const SLOT_MINUTES = 30;

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekday, minutes since midnight and the date ("YYYY-MM-DD") in the store's time zone. */
export function spNow(date: Date) {
  const p = Object.fromEntries(parts.formatToParts(date).map((x) => [x.type, x.value]));
  return { day: DAY_INDEX[p.weekday], minutes: Number(p.hour) * 60 + Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Keeps valid entries only, one per weekday. */
export function cleanHours(value: unknown): OpeningHours[] {
  const list = Array.isArray(value) ? value : [];
  const byDay = new Map<number, OpeningHours>();
  for (const h of list) {
    const day = Number(h?.day);
    if (Number.isInteger(day) && day >= 0 && day <= 6 && isTime(h?.open) && isTime(h?.close) && h.open !== h.close) {
      byDay.set(day, { day, open: h.open, close: h.close });
    }
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

export function withinHours(hours: OpeningHours[], date: Date) {
  const { day, minutes } = spNow(date);
  const today = hours.find((h) => h.day === day);
  if (today) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    if (close > open ? minutes >= open && minutes < close : minutes >= open) return true;
  }
  // yesterday's shift may still be running after midnight
  const yesterday = hours.find((h) => h.day === (day + 6) % 7);
  return Boolean(yesterday && toMinutes(yesterday.close) <= toMinutes(yesterday.open) && minutes < toMinutes(yesterday.close));
}

/** Takes orders for right now: not paused and, in automatic mode, inside the hours. */
export function isOpenAt(settings: HoursSettings | null | undefined, date: Date) {
  if (!settings?.is_open) return false;
  return !settings.auto_hours || withinHours(settings.hours ?? [], date);
}

export const formatHour = (hhmm: string) => {
  const [h, m] = hhmm.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
};

/** "Abre hoje às 10h" / "Abre amanhã às 10h" / "Abre ter. às 10h"; null when paused or not automatic. */
export function nextOpening(settings: HoursSettings | null | undefined, date: Date) {
  if (!settings?.is_open || !settings.auto_hours) return null;
  const { day, minutes } = spNow(date);
  for (let offset = 0; offset < 8; offset++) {
    const h = settings.hours.find((x) => x.day === (day + offset) % 7);
    if (!h || (offset === 0 && toMinutes(h.open) <= minutes)) continue;
    const when = offset === 0 ? "hoje" : offset === 1 ? "amanhã" : `${WEEKDAYS[(day + offset) % 7].toLowerCase()}.`;
    return `Abre ${when} às ${formatHour(h.open)}`;
  }
  return null;
}

// the week reads Monday to Sunday, so "Ter a Dom" stays one group
const WEEK_POSITION = [6, 0, 1, 2, 3, 4, 5];

/** "Ter a Dom, 10h às 22h" — consecutive days with the same hours are grouped. */
export function hoursLabel(hours: OpeningHours[]) {
  const groups: { from: number; to: number; open: string; close: string }[] = [];
  for (const h of [...hours].sort((a, b) => WEEK_POSITION[a.day] - WEEK_POSITION[b.day])) {
    const last = groups.at(-1);
    if (last && WEEK_POSITION[last.to] === WEEK_POSITION[h.day] - 1 && last.open === h.open && last.close === h.close) last.to = h.day;
    else groups.push({ from: h.day, to: h.day, open: h.open, close: h.close });
  }
  return groups
    .map((g) => {
      const days = g.from === g.to ? WEEKDAYS[g.from] : `${WEEKDAYS[g.from]} a ${WEEKDAYS[g.to]}`;
      return `${days}, ${formatHour(g.open)} às ${formatHour(g.close)}`;
    })
    .join(" · ");
}

/** "40–60 min", "~40 min" or null when no estimate is set. */
export function etaLabel(min: number | null | undefined, max: number | null | undefined) {
  if (min == null && max == null) return null;
  if (min != null && max != null && max > min) return `${min}–${max} min`;
  return `~${min ?? max} min`;
}

/** A local date + time in the store's zone, as an instant. */
export const spInstant = (date: string, time: string) => new Date(`${date}T${time}:00${OFFSET}`);

const DEFAULT_SLOTS = { open: "08:00", close: "22:00" };

/** Times ("HH:MM") a scheduled order may pick on `date`, honoring hours and lead time. */
export function scheduleSlots(settings: ScheduleSettings, date: string, now: Date): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const earliest = now.getTime() + settings.schedule_min_hours * 3_600_000;
  const latest = now.getTime() + settings.schedule_max_days * 86_400_000;
  const { day } = spNow(spInstant(date, "12:00"));
  const hours = settings.hours?.length ? settings.hours.find((h) => h.day === day) : DEFAULT_SLOTS;
  if (!hours) return [];
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close) > open ? toMinutes(hours.close) : 24 * 60;
  const slots: string[] = [];
  // the last slot leaves half an hour before closing
  for (let m = Math.ceil(open / SLOT_MINUTES) * SLOT_MINUTES; m <= close - SLOT_MINUTES; m += SLOT_MINUTES) {
    const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const at = spInstant(date, time).getTime();
    if (at >= earliest && at <= latest) slots.push(time);
  }
  return slots;
}

export interface ScheduleDay {
  /** "YYYY-MM-DD" in the store's zone */
  date: string;
  /** "Hoje", "Amanhã" or the weekday ("Qua") */
  label: string;
  /** "06/11" */
  dayMonth: string;
  slots: string[];
  /** Why there are no slots: the store doesn't open that weekday, or the lead time / limit leaves none. */
  reason: "closed" | "none" | null;
}

/** The customer's agenda: today up to schedule_max_days ahead, each day with its free slots. */
export function scheduleDays(settings: ScheduleSettings, now: Date): ScheduleDay[] {
  const today = spNow(now).date;
  const noon = spInstant(today, "12:00").getTime();
  const days: ScheduleDay[] = [];
  for (let i = 0; i <= settings.schedule_max_days; i++) {
    const { date, day } = spNow(new Date(noon + i * 86_400_000));
    const opens = !settings.hours?.length || settings.hours.some((h) => h.day === day);
    const slots = scheduleSlots(settings, date, now);
    days.push({
      date,
      label: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : WEEKDAYS[day],
      dayMonth: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      slots,
      reason: slots.length ? null : opens ? "none" : "closed",
    });
  }
  return days;
}

/** "2026-11-06 15:00": the key a slot is counted by, in the store's zone. */
export function slotKey(iso: string) {
  const { date, minutes } = spNow(new Date(iso));
  return `${date} ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Error to show the customer, or null when `iso` is a valid scheduled time. */
export function scheduleError(settings: ScheduleSettings, iso: string, now: Date): string | null {
  if (!settings.schedule_enabled) return "Esta loja não aceita encomendas agendadas.";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Escolha a data e o horário da encomenda.";
  const { date, minutes } = spNow(at);
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  if (scheduleSlots(settings, date, now).includes(time)) return null;
  if (at.getTime() < now.getTime() + settings.schedule_min_hours * 3_600_000) {
    return `Encomendas precisam de ${settings.schedule_min_hours}h de antecedência.`;
  }
  if (at.getTime() > now.getTime() + settings.schedule_max_days * 86_400_000) {
    return `Dá para agendar com até ${settings.schedule_max_days} dias de antecedência.`;
  }
  return "Escolha um horário dentro do funcionamento da loja.";
}

/** "sáb., 14/11 às 15h" */
export function formatScheduled(iso: string) {
  const at = new Date(iso);
  const date = at.toLocaleDateString("pt-BR", { timeZone: TIME_ZONE, weekday: "short", day: "2-digit", month: "2-digit" });
  const { minutes } = spNow(at);
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${date} às ${formatHour(time)}`;
}
