"use client";

import { Pencil, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createStaff, deleteStaff, listStaff, updateStaff } from "@/actions/staff";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Card, ChoiceGroup, EmptyState, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/format";
import { fieldErrors, staffSchema } from "@/lib/validators";
import type { Profile, UserRole } from "@/types";
import { AdminOnly, PageHeader, useProfile } from "./panel-shell";

export function StaffPage() {
  return (
    <AdminOnly>
      <StaffManager />
    </AdminOnly>
  );
}

function StaffManager() {
  const me = useProfile();
  const [staff, setStaff] = useState<Profile[] | null>(null);
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Profile | null>(null);
  const [deleting, startDelete] = useTransition();

  const load = useCallback(async () => {
    const result = await listStaff().catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
    if (result.ok) {
      // managers first, then by name
      setStaff(result.staff.sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name, "pt-BR")));
    } else {
      toast.error(result.error);
      setStaff((s) => s ?? []);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);

  function confirmDelete() {
    if (!toDelete) return;
    startDelete(async () => {
      const res = await deleteStaff(toDelete.id).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erro inesperado." }));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Conta excluída.");
      setToDelete(null);
      load();
    });
  }

  return (
    <div className="pb-8">
      <PageHeader
        title="Equipe"
        description="Gerentes têm acesso total. Funcionários gerenciam pedidos e cardápio."
        actions={
          <Button onClick={() => setEditing("new")}>
            <UserPlus className="size-4" />
            Nova conta
          </Button>
        }
      />
      <div className="px-4 sm:px-6">
        {!staff ? (
          <Skeleton className="h-64" />
        ) : staff.length === 0 ? (
          <EmptyState icon={Users} title="Nenhuma conta" />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {staff.map((p) => (
              <div key={p.id} className="flex items-start gap-3 px-4 py-3.5 sm:items-center">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-3 text-sm font-bold">
                  {(p.full_name || p.email).charAt(0).toUpperCase()}
                </span>
                {/* phones: name, then badges, then e-mail; from sm everything sits in one row */}
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 sm:flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <span className="truncate">{p.full_name || "Sem nome"}</span>
                      {p.id === me.id && <Badge>Você</Badge>}
                    </p>
                    <p className="text-sm break-all text-muted-foreground sm:truncate sm:break-normal">{p.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.role === "admin" ? (
                      <Badge tone="brand">
                        <ShieldCheck className="size-3" />
                        Gerente
                      </Badge>
                    ) : (
                      <Badge>Funcionário</Badge>
                    )}
                    {!p.active && <Badge tone="danger">Desativado</Badge>}
                  </div>
                  <span className="hidden text-xs text-muted-foreground lg:block">desde {formatDateTime(p.created_at)}</span>
                </div>
                <div className="-mr-2 flex shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(p)} aria-label={`Editar ${p.full_name || p.email}`}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setToDelete(p)}
                    disabled={p.id === me.id}
                    aria-label={`Excluir ${p.full_name || p.email}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nova conta" : "Editar conta"}
        description={editing !== "new" && editing ? editing.email : "A pessoa entra no painel com este e-mail e senha."}
      >
        {editing !== null && (
          <StaffForm
            key={editing === "new" ? "new" : editing.id}
            profile={editing === "new" ? null : editing}
            isSelf={editing !== "new" && editing.id === me.id}
            onDone={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Sheet>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={`Excluir a conta de ${toDelete?.full_name || toDelete?.email}?`}
        description="O acesso é removido permanentemente. Para bloquear temporariamente, use “Desativar”."
        confirmLabel="Excluir conta"
      />
    </div>
  );
}

function StaffForm({ profile, isSelf, onDone }: { profile: Profile | null; isSelf: boolean; onDone: () => void }) {
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? "",
    email: profile?.email ?? "",
    password: "",
    role: (profile?.role ?? "staff") as UserRole,
    active: profile?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) {
      const parsed = staffSchema.safeParse(form);
      if (!parsed.success) {
        setErrors(fieldErrors(parsed.error));
        return;
      }
    } else if (form.password && form.password.length < 8) {
      setErrors({ password: "A senha precisa ter ao menos 8 caracteres." });
      return;
    }

    startTransition(async () => {
      const res = await (
        profile
          ? updateStaff({ id: profile.id, full_name: form.full_name, role: form.role, active: form.active, password: form.password || undefined })
          : createStaff({ full_name: form.full_name, email: form.email, password: form.password, role: form.role })
      ).catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(profile ? "Conta atualizada." : "Conta criada.");
      onDone();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 px-5 py-5">
      <Field label="Nome" error={errors.full_name}>
        {(p) => <Input {...p} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />}
      </Field>
      {!profile && (
        <Field label="E-mail" error={errors.email}>
          {(p) => <Input {...p} type="email" autoComplete="off" spellCheck={false} value={form.email} onChange={(e) => set("email", e.target.value)} />}
        </Field>
      )}
      <Field
        label={profile ? "Nova senha" : "Senha"}
        optional={Boolean(profile)}
        hint={profile ? "Deixe em branco para manter a atual." : "Mínimo de 8 caracteres. Compartilhe com a pessoa."}
        error={errors.password}
      >
        {(p) => <Input {...p} type="text" autoComplete="new-password" spellCheck={false} autoCapitalize="off" value={form.password} onChange={(e) => set("password", e.target.value)} />}
      </Field>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Perfil de acesso</p>
        <ChoiceGroup<UserRole>
          name="role"
          value={form.role}
          onChange={(v) => !isSelf && set("role", v)}
          options={[
            { value: "staff", label: "Funcionário", description: "Pedidos e cardápio" },
            { value: "admin", label: "Gerente", description: "Acesso total" },
          ]}
        />
        {isSelf && <p className="text-xs text-muted-foreground">Você não pode alterar o próprio perfil.</p>}
      </div>
      {profile && !isSelf && (
        <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} label={form.active ? "Conta ativa" : "Conta desativada"} />
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={pending}>
          {profile ? "Salvar alterações" : "Criar conta"}
        </Button>
      </div>
    </form>
  );
}
