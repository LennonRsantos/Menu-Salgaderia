import type { Metadata } from "next";
import { MenuManager } from "@/components/admin/menu-manager";

export const metadata: Metadata = { title: "Cardápio" };
// Rendered only after the client confirms the staff session (see PanelShell).
export const instant = false;

export default function MenuAdminPage() {
  return <MenuManager />;
}
