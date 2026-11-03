import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";
import { isDatabaseConfigured } from "@/lib/db";
import { isAuthConfigured } from "@/lib/neon-auth";

export const metadata: Metadata = { title: "Entrar no painel", robots: { index: false } };

export default function LoginPage() {
  return <LoginForm configured={isAuthConfigured && isDatabaseConfigured} />;
}
