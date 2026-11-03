import type { Metadata } from "next";
import { PanelShell } from "@/components/admin/panel-shell";
import { getStoreSettings } from "@/lib/menu";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel" },
  robots: { index: false },
};

// The panel renders its pages only after the client confirms the staff session,
// so there is no static content to validate for instant navigation.
export const instant = false;

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  // the corner icon is always the store logo set in Configurações
  const settings = await getStoreSettings();
  return <PanelShell logoUrl={settings?.logo_url ?? null}>{children}</PanelShell>;
}
