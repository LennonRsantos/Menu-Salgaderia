"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface Reservation {
  /** "YYYY-MM-DD" in the store's time zone */
  date: string;
  /** "HH:MM" */
  time: string;
}

interface ReservationState {
  value: Reservation | null;
  /** The "Reservar" sheet, opened from the header or the reservation bar. */
  open: boolean;
  set: (value: Reservation) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
}

/** Day the customer booked from the menu; the checkout starts from it. */
export const useReservation = create<ReservationState>()(
  persist(
    (set) => ({
      value: null,
      open: false,
      set: (value) => set({ value, open: false }),
      clear: () => set({ value: null }),
      setOpen: (open) => set({ open }),
    }),
    {
      name: "salgaderia:reservation",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ value: s.value }),
      version: 1,
    },
  ),
);
