"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInStaff } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { StoreMark } from "./panel-shell";

export function LoginForm({ configured, logoUrl }: { configured: boolean; logoUrl: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    const result = await signInStaff(email, password).catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
    if (!result.ok) {
      setLoading(false);
      setError(result.error);
      return;
    }
    router.replace("/admin");
    // the panel may bounce back here (e.g. deactivated account); never leave the button stuck
    setLoading(false);
  }

  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-primary-soft to-transparent" aria-hidden />
      <ThemeToggle className="absolute top-4 right-4" />
      <main id="conteudo" tabIndex={-1} className="relative w-full max-w-sm outline-none">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <StoreMark logoUrl={logoUrl} size={56} className="rounded-2xl shadow-md" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Painel da loja</h1>
            <p className="text-sm text-muted-foreground">Acesso restrito à equipe</p>
          </div>
        </div>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="E-mail">
              {(p) => (
                <Input {...p} type="email" name="email" autoComplete="username" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@loja.com" />
              )}
            </Field>
            <Field label="Senha">
              {(p) => (
                <div className="relative">
                  <Input
                    {...p}
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
                    aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {show ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                  </button>
                </div>
              )}
            </Field>
            {error && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger-soft-foreground">
                {error}
              </p>
            )}
            {!configured && (
              <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
                Neon não configurado. Rode <code>neon deploy</code> e preencha o <code>.env.local</code> (veja o README).
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Entrar
            </Button>
          </form>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/" className="font-semibold hover:text-foreground">
            ← Voltar ao cardápio
          </Link>
        </p>
      </main>
    </div>
  );
}
