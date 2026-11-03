import type { Metadata } from "next";
import { OrdersBoard } from "@/components/admin/orders-board";

export const metadata: Metadata = { title: "Pedidos" };
// Rendered only after the client confirms the staff session (see PanelShell).
export const instant = false;

export default function OrdersPage() {
  return <OrdersBoard />;
}
