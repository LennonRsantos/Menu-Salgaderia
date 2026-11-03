import type { Metadata } from "next";
import { AccountPage } from "@/components/store/account-page";
import { getStoreSettings } from "@/lib/menu";

export const metadata: Metadata = { title: "Minha conta", robots: { index: false } };

export default async function MyAccountPage() {
  const settings = await getStoreSettings();
  return <AccountPage storePhone={settings?.phone ?? null} />;
}
