import type { Metadata } from "next";
import { ScheduleView } from "@/components/admin/schedule-view";

export const metadata: Metadata = { title: "Encomendas" };
// Rendered only after the client confirms the staff session (see PanelShell).
export const instant = false;

export default function SchedulePage() {
  return <ScheduleView />;
}
