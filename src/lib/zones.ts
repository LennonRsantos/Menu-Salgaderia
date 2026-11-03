// Delivery fee per neighborhood. Shared by the checkout preview and buildOrder.

import type { DeliveryZone } from "@/types";
import { normalizeSearch } from "./format";

interface FeeSettings {
  delivery_fee: number;
  other_zones: boolean;
  zones: DeliveryZone[];
}

export function findZone(zones: DeliveryZone[], neighborhood: string) {
  const key = normalizeSearch(neighborhood).trim();
  return key ? zones.find((z) => normalizeSearch(z.name).trim() === key) : undefined;
}

/** Fee for the neighborhood; null when the store doesn't deliver there. */
export function deliveryFeeFor(settings: FeeSettings, neighborhood: string): number | null {
  if (!settings.zones?.length) return Number(settings.delivery_fee) || 0;
  const zone = findZone(settings.zones, neighborhood);
  if (zone) return Number(zone.fee);
  return settings.other_zones ? Number(settings.delivery_fee) || 0 : null;
}
