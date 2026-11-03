import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";
import { isDatabaseConfigured } from "@/lib/db";
import { getStoreSettings } from "@/lib/menu";
import { isAuthConfigured } from "@/lib/neon-auth";

export const metadata: Metadata = { title: "Entrar no painel", robots: { index: false } };

export default async function LoginPage() {
  const settings = await getStoreSettings();
  return <LoginForm configured={isAuthConfigured && isDatabaseConfigured} logoUrl={settings?.logo_url ?? null} />;
}
