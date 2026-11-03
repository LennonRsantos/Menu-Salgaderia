import type { Metadata } from "next";
import { CostsManager } from "@/components/admin/costs-manager";
import { AdminOnly } from "@/components/admin/panel-shell";

export const metadata: Metadata = { title: "Custos" };
// Rendered only after the client confirms the staff session (see PanelShell).
export const instant = false;

export default function CostsPage() {
  return (
    <AdminOnly>
      <CostsManager />
    </AdminOnly>
  );
}
