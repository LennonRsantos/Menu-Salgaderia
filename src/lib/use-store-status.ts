"use client";

import { useSyncExternalStore } from "react";
import type { StoreSettings } from "@/types";
import { hoursLabel, isOpenAt, nextOpening } from "./hours";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 15_000);
  return () => clearInterval(timer);
}
// rounded to the minute so the snapshot stays stable between ticks
const minuteNow = () => Math.floor(Date.now() / MINUTE) * MINUTE;

/**
 * Open/closed state for the storefront, recomputed every minute in the
 * browser: settings are cached on the server, so the hours can't be applied there.
 * `known` is false during SSR in automatic mode, when the time isn't available yet.
 */
export function useStoreStatus(settings: StoreSettings | null) {
  const now = useSyncExternalStore(subscribe, minuteNow, () => null);
  const auto = Boolean(settings?.auto_hours);
  const known = now !== null || !auto;
  const open = now !== null ? isOpenAt(settings, new Date(now)) : Boolean(settings?.is_open && !auto);
  return {
    known,
    open,
    /** "Abre hoje às 10h", when closed in automatic mode */
    next: !open && now !== null ? nextOpening(settings, new Date(now)) : null,
    hoursText: auto && settings?.hours.length ? hoursLabel(settings.hours) : (settings?.opening_hours ?? null),
    /** Scheduled orders may be placed while closed. */
    canSchedule: Boolean(settings?.schedule_enabled),
  };
}
