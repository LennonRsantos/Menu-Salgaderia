// Color palettes and festive themes chosen in the panel. Pure, no server imports.
// Each id matches an `html[data-palette="…"]` block in globals.css, which only
// swaps the brand and gold ramps; every component keeps using semantic tokens.

import { easter } from "./special-dates";

export const PALETTE_IDS = ["purple", "wine", "green", "blue", "terracotta"] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export const FESTIVE_IDS = ["christmas", "newyear", "carnival"] as const;
export type FestiveId = (typeof FESTIVE_IDS)[number];

export const FESTIVE_MODES = ["off", "auto", ...FESTIVE_IDS] as const;
export type FestiveMode = (typeof FESTIVE_MODES)[number];

export type FestiveEffect = "snow" | "sparkle" | "confetti";

/** Swatches are brand-700 and gold-500 of each ramp, for the picker. */
export const PALETTES: Record<PaletteId, { label: string; primary: string; accent: string }> = {
  purple: { label: "Roxo", primary: "#6b2c7a", accent: "#c9b84a" },
  wine: { label: "Vinho", primary: "#7f213b", accent: "#c9b84a" },
  green: { label: "Verde", primary: "#27562f", accent: "#c9b84a" },
  blue: { label: "Azul", primary: "#27477c", accent: "#c9b84a" },
  terracotta: { label: "Terracota", primary: "#883825", accent: "#c9b84a" },
};

export const FESTIVE: Record<FestiveId, { label: string; message: string; effect: FestiveEffect; primary: string; accent: string; period: string }> = {
  christmas: { label: "Natal", message: "Boas festas! Encomende sua ceia de Natal.", effect: "snow", primary: "#922323", accent: "#3f9c5e", period: "1 a 26 de dezembro" },
  newyear: { label: "Ano Novo", message: "Feliz Ano Novo! Garanta os salgados do Réveillon.", effect: "sparkle", primary: "#353b72", accent: "#d4af37", period: "27 de dezembro a 2 de janeiro" },
  carnival: { label: "Carnaval", message: "É Carnaval! Salgados para o bloco todo.", effect: "confetti", primary: "#a91f67", accent: "#f5c518", period: "sexta-feira antes do Carnaval até a Quarta de Cinzas" },
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** Friday before Carnaval to Ash Wednesday ("YYYY-MM-DD"). */
export function carnivalWindow(year: number) {
  const e = easter(year);
  return { start: iso(shift(e, -51)), end: iso(shift(e, -46)) };
}

/** Festive theme the calendar picks for a day ("YYYY-MM-DD"), if any. */
export function festiveFor(date: string): FestiveId | null {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (month === 12 && day <= 26) return "christmas";
  if ((month === 12 && day >= 27) || (month === 1 && day <= 2)) return "newyear";
  const carnival = carnivalWindow(year);
  if (date >= carnival.start && date <= carnival.end) return "carnival";
  return null;
}

export interface ThemeSettings {
  theme_palette: PaletteId;
  festive_mode: FestiveMode;
  festive_message: string | null;
  festive_effects: boolean;
}

export interface ActiveTheme {
  /** Value for html[data-palette]: a festive theme replaces the palette. */
  palette: PaletteId | FestiveId;
  festive: FestiveId | null;
  message: string | null;
  effects: boolean;
}

export const DEFAULT_THEME: ActiveTheme = { palette: "purple", festive: null, message: null, effects: false };

export const toPalette = (v: unknown): PaletteId => (PALETTE_IDS.includes(v as PaletteId) ? (v as PaletteId) : "purple");
export const toFestiveMode = (v: unknown): FestiveMode => (FESTIVE_MODES.includes(v as FestiveMode) ? (v as FestiveMode) : "off");

export function activeTheme(s: ThemeSettings, today: string): ActiveTheme {
  const festive = s.festive_mode === "off" ? null : s.festive_mode === "auto" ? festiveFor(today) : s.festive_mode;
  if (!festive) return { palette: s.theme_palette, festive: null, message: null, effects: false };
  return { palette: festive, festive, message: s.festive_message || FESTIVE[festive].message, effects: s.festive_effects };
}
