import type { Metadata } from "next";
import { AppUpdates } from "@/components/admin/app-updates";
import { APP_VERSION } from "@/lib/app-version";

// Login and panel can be installed as an app; the Android app (android/) opens
// the same pages.
export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      {children}
      <AppUpdates version={APP_VERSION} />
    </>
  );
}
