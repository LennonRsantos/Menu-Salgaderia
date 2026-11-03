import type { Metadata } from "next";
import { AccountSettings } from "@/components/admin/account-settings";

export const metadata: Metadata = { title: "Minha conta" };
// Rendered only after the client confirms the staff session (see PanelShell).
export const instant = false;

export default function AccountPage() {
  return <AccountSettings />;
}
