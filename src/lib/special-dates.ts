// National holidays and commemorative dates in Brazil, plus the store's own
// dates, suggested to customers when they book a day. Pure, no imports.

export type SpecialKind = "feriado" | "comemorativa" | "loja";

export interface SpecialDate {
  /** "YYYY-MM-DD" */
  date: string;
  title: string;
  kind: SpecialKind;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Easter Sunday (Gregorian, Meeus/Jones/Butcher). */
export function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const shift = (date: Date, days: number) => {
  const d = new Date(date.getTime() + days * 86_400_000);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

/** n-th Sunday of a month (1-based). */
function nthSunday(year: number, month: number, n: number) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return iso(year, month, 1 + ((7 - first) % 7) + (n - 1) * 7);
}

export function specialDates(year: number): SpecialDate[] {
  const e = easter(year);
  const list: SpecialDate[] = [
    { date: iso(year, 1, 1), title: "Ano Novo", kind: "feriado" },
    { date: shift(e, -48), title: "Carnaval", kind: "feriado" },
    { date: shift(e, -47), title: "Carnaval", kind: "feriado" },
    { date: shift(e, -2), title: "Sexta-feira Santa", kind: "feriado" },
    { date: shift(e, 0), title: "Páscoa", kind: "comemorativa" },
    { date: iso(year, 4, 21), title: "Tiradentes", kind: "feriado" },
    { date: iso(year, 5, 1), title: "Dia do Trabalho", kind: "feriado" },
    { date: nthSunday(year, 5, 2), title: "Dia das Mães", kind: "comemorativa" },
    { date: shift(e, 60), title: "Corpus Christi", kind: "feriado" },
    { date: iso(year, 6, 12), title: "Dia dos Namorados", kind: "comemorativa" },
    { date: iso(year, 6, 24), title: "São João", kind: "comemorativa" },
    { date: nthSunday(year, 8, 2), title: "Dia dos Pais", kind: "comemorativa" },
    { date: iso(year, 9, 7), title: "Independência", kind: "feriado" },
    { date: iso(year, 10, 12), title: "Dia das Crianças", kind: "feriado" },
    { date: iso(year, 11, 2), title: "Finados", kind: "feriado" },
    { date: iso(year, 11, 15), title: "Proclamação da República", kind: "feriado" },
    { date: iso(year, 11, 20), title: "Consciência Negra", kind: "feriado" },
    { date: iso(year, 12, 24), title: "Véspera de Natal", kind: "comemorativa" },
    { date: iso(year, 12, 25), title: "Natal", kind: "feriado" },
    { date: iso(year, 12, 31), title: "Réveillon", kind: "comemorativa" },
  ];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Special dates from `today` ("YYYY-MM-DD") up to `days` ahead: automatic ones
 * plus the store's. A store date replaces an automatic one on the same day.
 */
export function upcomingSpecialDates(today: string, storeDates: { date: string; title: string }[], days: number): SpecialDate[] {
  const start = new Date(`${today}T00:00:00Z`);
  const end = shift(start, days);
  const year = start.getUTCFullYear();
  const byDate = new Map<string, SpecialDate>();
  for (const d of [...specialDates(year), ...specialDates(year + 1)]) {
    // Carnaval spans two days; keep the first title per day
    if (!byDate.has(d.date)) byDate.set(d.date, d);
  }
  for (const d of storeDates) byDate.set(d.date, { date: d.date, title: d.title, kind: "loja" });
  return [...byDate.values()].filter((d) => d.date >= today && d.date <= end).sort((a, b) => a.date.localeCompare(b.date));
}
