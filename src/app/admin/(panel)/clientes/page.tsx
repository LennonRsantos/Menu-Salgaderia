import type { Metadata } from "next";
import { CustomersPage } from "@/components/admin/customers-manager";

export const metadata: Metadata = { title: "Clientes" };
// Rendered only after the client confirms the staff session (see PanelShell).
export const instant = false;

export default function CustomersRoute() {
  return <CustomersPage />;
}
