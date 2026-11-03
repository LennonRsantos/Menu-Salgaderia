import type { Metadata } from "next";
import { SettingsPage } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Loja" };
// Rendered only after the client confirms the staff session (see PanelShell).
export const instant = false;

export default function StoreSettingsPage() {
  return <SettingsPage />;
}
