"use client";

import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { MenuActionResult } from "@/actions/menu";

export interface CategoryApi {
  create: (name: string) => Promise<MenuActionResult>;
  rename: (id: string, name: string) => Promise<MenuActionResult>;
  remove: (id: string) => Promise<MenuActionResult>;
  swap: (a: string, b: string) => Promise<MenuActionResult>;
  /** Only menu categories can be hidden. */
  setActive?: (id: string, active: boolean) => Promise<MenuActionResult>;
}

/** Category list for the menu and for the stock; `api` says which tables it writes. */
export function CategoryManager({
  open,
  onClose,
  categories,
  countFor,
  api,
  description,
  noun,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  categories: { id: string; name: string; is_active?: boolean }[];
  countFor: (id: string) => number;
  api: CategoryApi;
  description: string;
  /** What a category holds, singular and plural (e.g. produto / produtos). */
  noun: [string, string];
  onChanged: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<MenuActionResult>, success?: string) {
    setBusy(true);
    const result = await action().catch(() => ({ ok: false as const, error: "Sem conexão." }));
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    if (success) toast.success(success);
    await onChanged();
    return true;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (await run(() => api.create(name), "Categoria criada.")) setNewName("");
  }

  async function rename() {
    if (!editing || !editing.name.trim()) return;
    if (await run(() => api.rename(editing.id, editing.name.trim()))) setEditing(null);
  }

  async function move(index: number, dir: -1 | 1) {
    const a = categories[index];
    const b = categories[index + dir];
    if (!a || !b) return;
    await run(() => api.swap(a.id, b.id));
  }

  async function remove() {
    if (!toDelete) return;
    if (countFor(toDelete.id) > 0) {
      toast.error(`Mova ou exclua os ${noun[1]} desta categoria antes.`);
      setToDelete(null);
      return;
    }
    if (await run(() => api.remove(toDelete.id), "Categoria excluída.")) setToDelete(null);
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} side="right" title="Categorias" description={description}>
        <div className="space-y-4 px-5 py-5">
          <form onSubmit={add} className="flex gap-2">
            <Input aria-label="Nova categoria" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova categoria" />
            <Button type="submit" disabled={!newName.trim()} loading={busy && Boolean(newName)}>
              <Plus className="size-4" />
              Criar
            </Button>
          </form>

          <ul className="divide-y divide-border rounded-lg border border-border">
            {categories.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || busy}
                    className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-surface-2 disabled:opacity-30"
                    aria-label={`Subir ${c.name}`}
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === categories.length - 1 || busy}
                    className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-surface-2 disabled:opacity-30"
                    aria-label={`Descer ${c.name}`}
                  >
                    <ArrowDown className="size-4" />
                  </button>
                </div>
                {editing?.id === c.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename();
                    }}
                  >
                    <Input
                      aria-label="Nome da categoria"
                      value={editing.name}
                      onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                      autoFocus
                      className="h-10"
                    />
                    <Button type="submit" size="icon" aria-label="Salvar nome">
                      <Check className="size-4" />
                    </Button>
                  </form>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {countFor(c.id)} {countFor(c.id) === 1 ? noun[0] : noun[1]}
                    </p>
                  </div>
                )}
                {editing?.id !== c.id && (
                  <>
                    {api.setActive && (
                      <Switch
                        checked={c.is_active !== false}
                        onCheckedChange={(v) => run(() => api.setActive!(c.id, v), v ? "Categoria visível." : "Categoria oculta.")}
                        label={`${c.name} visível no cardápio`}
                        hideLabel
                      />
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label={`Renomear ${c.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(c)} aria-label={`Excluir ${c.name}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
            {categories.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma categoria ainda.</li>}
          </ul>
        </div>
      </Sheet>
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={busy}
        title={`Excluir “${toDelete?.name}”?`}
        description={`Só é possível excluir categorias sem ${noun[1]}.`}
        confirmLabel="Excluir"
      />
    </>
  );
}
