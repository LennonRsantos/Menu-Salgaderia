"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { OrderItemAddon } from "@/types";

export interface CartItem {
  key: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  /** Display only: the server recomputes every price in place_order(). */
  unitPrice: number;
  quantity: number;
  addons: Required<Pick<OrderItemAddon, "id" | "name" | "price">>[];
  notes: string;
  /** Out of stock today when added: the order has to be scheduled. */
  scheduleOnly?: boolean;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, "key">) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

// Same product + same addons + same notes are merged into one line.
const signature = (i: Pick<CartItem, "productId" | "addons" | "notes">) =>
  [i.productId, ...i.addons.map((a) => a.id).sort(), i.notes.trim()].join("|");

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((state) => {
          const sig = signature(item);
          const existing = state.items.find((i) => signature(i) === sig);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.key === existing.key ? { ...i, quantity: Math.min(99, i.quantity + item.quantity) } : i,
              ),
            };
          }
          return { items: [...state.items, { ...item, key: crypto.randomUUID() }] };
        }),
      setQuantity: (key, quantity) =>
        set((state) => ({
          items: state.items.map((i) => (i.key === key ? { ...i, quantity: Math.max(1, Math.min(99, quantity)) } : i)),
        })),
      remove: (key) => set((state) => ({ items: state.items.filter((i) => i.key !== key) })),
      clear: () => set({ items: [] }),
    }),
    { name: "salgaderia:cart", storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

export function cartTotals(items: CartItem[]) {
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = items.reduce((n, i) => n + i.unitPrice * i.quantity, 0);
  return { count, subtotal };
}

// ---------------------------------------------------------------------------
// Customer details remembered between orders (no account needed).
// ---------------------------------------------------------------------------

export interface SavedCustomer {
  name: string;
  phone: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  reference: string;
}

const CUSTOMER_KEY = "salgaderia:customer";
const ORDERS_KEY = "salgaderia:orders";

export function loadCustomer(): Partial<SavedCustomer> {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveCustomer(data: SavedCustomer) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable (private mode): the form simply starts empty next time
  }
}

export interface RecentOrder {
  token: string;
  code: number;
  createdAt: string;
}

export function loadRecentOrders(): RecentOrder[] {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function rememberOrder(order: RecentOrder) {
  try {
    const list = [order, ...loadRecentOrders().filter((o) => o.token !== order.token)].slice(0, 5);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}
