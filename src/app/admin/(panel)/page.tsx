import type { Metadata } from "next";
import { Dashboard } from "@/components/admin/dashboard";

export const metadata: Metadata = { title: "Dashboard" };
// Rendered only after the client confirms the staff session (see PanelShell).
export const instant = false;

export default function DashboardPage() {
  return <Dashboard />;
}
