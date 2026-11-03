import type { OpeningHours } from "@/lib/hours";

// Domain types for the Postgres rows (see db/schema.sql).
// Timestamps are converted to ISO strings when read.

export type UserRole = "admin" | "staff";
export type OrderStatus = "new" | "preparing" | "out_for_delivery" | "completed" | "cancelled";
export type Fulfillment = "delivery" | "pickup";
export type PaymentMethod = "pix" | "credit" | "debit" | "cash";

export interface StoreSettings {
  id: number;
  name: string;
  tagline: string | null;
  phone: string | null;
  logo_url: string | null;
  delivery_fee: number;
  min_order: number;
  is_open: boolean;
  opening_hours: string | null;
  /** Automatic mode follows `hours`; `is_open` stays as the manual pause. */
  auto_hours: boolean;
  hours: OpeningHours[];
  /** Neighborhoods outside `zones` pay delivery_fee (true) or are refused (false). */
  other_zones: boolean;
  zones: DeliveryZone[];
  schedule_enabled: boolean;
  schedule_min_hours: number;
  schedule_max_days: number;
  /** Shown on the menu and to customers picking up. */
  address: string | null;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  /** Estimated minutes; null = not shown. */
  delivery_min: number | null;
  delivery_max: number | null;
  pickup_min: number | null;
  pickup_max: number | null;
  /** Most scheduled orders per 30-minute slot; null = no limit. */
  slot_capacity: number | null;
}

export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  position: number;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  position: number;
  is_active: boolean;
}

export interface Addon {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  position: number;
}

/** Stored in the product row (addon_groups jsonb). */
export interface AddonGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  position: number;
  addons: Addon[];
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_visible: boolean;
  is_available: boolean;
  position: number;
  addon_groups: AddonGroup[];
  /** Out of stock today; still orderable as a scheduled order (encomenda). */
  stock_out?: boolean;
}

export interface MenuCategory extends Category {
  products: Product[];
}

export interface OrderAddress {
  zip: string | null;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  reference: string | null;
}

export interface OrderItemAddon {
  id?: string;
  name: string;
  price: number;
  group?: string;
}

export interface OrderItem {
  id?: string;
  /** Kept so scheduled orders can take stock when accepted (absent on older orders). */
  product_id?: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  addons: OrderItemAddon[];
  notes: string | null;
  line_total: number;
}

export interface Order {
  id: string;
  code: number;
  public_token: string;
  customer_name: string;
  customer_phone: string;
  address: OrderAddress | null;
  fulfillment: Fulfillment;
  payment_method: PaymentMethod;
  change_for: number | null;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  total: number;
  notes: string | null;
  /** Scheduled order (encomenda); null = as soon as possible. */
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  order_items: OrderItem[];
}

/** What the public tracking page receives (GET /api/track/[token]). */
export type PublicOrder = Omit<Order, "id" | "public_token" | "customer_phone" | "updated_at" | "order_items"> & {
  items: OrderItem[];
};

export interface StockCategory {
  id: string;
  name: string;
  position: number;
}

export interface StockItem {
  id: string;
  category_id: string;
  name: string;
  unit: string;
  quantity: number;
  min_quantity: number;
  /** Cost per unit, for margins and cost of goods sold. */
  cost: number;
  /** Menu products (and addons) that consume this item. */
  used_in: string[];
}

/** One unit of the product (addon_id null) or of the addon consumes `quantity` of the item. */
export interface StockLink {
  product_id: string;
  addon_id: string | null;
  item_id: string;
  quantity: number;
}

export type StockReason = "sale" | "cancel" | "restock" | "adjust";

export interface StockMovement {
  id: number;
  item_id: string;
  item_name: string;
  unit: string;
  delta: number;
  reason: StockReason;
  order_code: number | null;
  user_name: string | null;
  note: string | null;
  created_at: string;
}
