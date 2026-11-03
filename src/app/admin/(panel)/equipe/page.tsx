import type { Metadata } from "next";
import { StaffPage } from "@/components/admin/staff-manager";

export const metadata: Metadata = { title: "Equipe" };
// Rendered only after the client confirms the staff session (see PanelShell).
export const instant = false;

export default function TeamPage() {
  return <StaffPage />;
}
