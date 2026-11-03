import type { Metadata } from "next";
import { PanelShell } from "@/components/admin/panel-shell";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel" },
  robots: { index: false },
};

// The panel renders its pages only after the client confirms the staff session,
// so there is no static content to validate for instant navigation.
export const instant = false;

export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return <PanelShell>{children}</PanelShell>;
}
