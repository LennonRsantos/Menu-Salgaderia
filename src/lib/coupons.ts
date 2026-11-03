// Discount coupon rules. Pure: the checkout previews with them and placeOrder
// applies them again inside its transaction.

export type CouponKind = "percent" | "amount";

export interface CouponRule {
  kind: CouponKind;
  value: number;
  max_uses: number | null;
  /** "YYYY-MM-DD": valid through this day (São Paulo). */
  expires_on: string;
  active: boolean;
}

export const COUPON_CODE = /^[A-Z0-9]{3,20}$/;

/** Upper case, without spaces or anything outside A-Z 0-9. */
export const normalizeCode = (v: unknown) =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20);

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Discount on the products' subtotal; never more than the subtotal itself. */
export function couponDiscount(c: Pick<CouponRule, "kind" | "value">, subtotal: number) {
  const raw = c.kind === "percent" ? (subtotal * c.value) / 100 : c.value;
  return round2(Math.max(0, Math.min(raw, subtotal)));
}

/** Message for the customer when the coupon can't be used, or null. */
export function couponProblem(
  c: CouponRule | null | undefined,
  { today, uses, usedByCustomer }: { today: string; uses: number; usedByCustomer: boolean },
): string | null {
  if (!c || !c.active) return "Cupom inválido.";
  if (c.expires_on < today) return "Este cupom expirou.";
  if (usedByCustomer) return "Você já usou este cupom.";
  if (c.max_uses !== null && uses >= c.max_uses) return "Este cupom já atingiu o limite de usos.";
  return null;
}

export const couponLabel = (c: Pick<CouponRule, "kind" | "value">) =>
  c.kind === "percent" ? `${String(c.value).replace(".", ",")}%` : `R$ ${c.value.toFixed(2).replace(".", ",")}`;
