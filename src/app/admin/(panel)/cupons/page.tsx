import type { Metadata } from "next";
import { CouponsPage } from "@/components/admin/coupons-manager";

export const metadata: Metadata = { title: "Cupons" };
// Rendered only after the client confirms the staff session (see PanelShell).
export const instant = false;

export default function CouponsRoute() {
  return <CouponsPage />;
}
