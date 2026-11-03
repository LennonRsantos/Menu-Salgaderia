import type { Metadata } from "next";
import { StockManager } from "@/components/admin/stock-manager";

export const metadata: Metadata = { title: "Estoque" };
// Rendered only after the client confirms the staff session (see PanelShell).
export const instant = false;

export default function StockPage() {
  return <StockManager />;
}
