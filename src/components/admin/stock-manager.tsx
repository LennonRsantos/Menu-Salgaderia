"use client";

import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  FolderCog,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createStockCategory,
  deleteStockCategory,
  deleteStockItem,
  fetchMovements,
  fetchStock,
  moveStock,
  saveStockItem,
  swapStockCategories,
  updateStockCategory,
} from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { cn, formatBRL, formatDateTime, normalizeSearch, parseMoney } from "@/lib/format";
import { formatQty, round2, stockStatus, type StockStatus } from "@/lib/stock";
import type { StockCategory, StockItem, StockMovement } from "@/types";
import { CategoryManager, type CategoryApi } from "./category-manager";
import { PageHeader } from "./panel-shell";

const STOCK_CATEGORY_API: CategoryApi = {
  create: createStockCategory,
  rename: (id, name) => updateStockCategory(id, { name }),
  remove: deleteStockCategory,
  swap: swapStockCategories,
};

const STATUS: Record<StockStatus, { label: string; tone: "success" | "warning" | "danger"; icon: typeof CircleCheck }> = {
  ok: { label: "Em estoque", tone: "success", icon: CircleCheck },
  low: { label: "Estoque baixo", tone: "warning", icon: AlertTriangle },
  out: { label: "Esgotado", tone: "danger", icon: CircleX },
};

type Data = { categories: StockCategory[]; items: StockItem[] };
type Move = { item: StockItem; kind: "restock" | "adjust" };

export function StockManager() {
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StockStatus | "all">("all");
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [move, setMove] = useState<Move | null>(null);
  const [history, setHistory] = useState<StockItem | "all" | null>(null);
  const [toDelete, setToDelete] = useState<StockItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchStock().catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
    if (result.ok) {
      setData(result.data);
    } else {
      toast.error(result.error);
      setData((d) => d ?? { categories: [], items: [] });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: 0, ok: 0, low: 0, out: 0 };
    for (const i of data?.items ?? []) {
      c.all++;
      c[stockStatus(i)]++;
    }
    return c;
  }, [data]);

  const stockValue = useMemo(() => (data?.items ?? []).reduce((n, i) => n + Math.max(0, i.quantity) * i.cost, 0), [data]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const q = normalizeSearch(query);
    const filtering = Boolean(q) || status !== "all";
    return data.categories
      .filter((c) => category === "all" || c.id === category)
      .map((c) => ({
        category: c,
        items: data.items.filter(
          (i) =>
            i.category_id === c.id &&
            (status === "all" || stockStatus(i) === status) &&
            (!q || normalizeSearch(`${i.name} ${i.used_in.join(" ")}`).includes(q)),
        ),
      }))
      .filter((g) => g.items.length > 0 || !filtering);
  }, [data, query, category, status]);

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    const result = await deleteStockItem(toDelete.id).catch(() => ({ ok: false as const, error: "Sem conexão." }));
    setDeleting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Item excluído.");
    setToDelete(null);
    load();
  }

  const openNew = () => {
    if (!data?.categories.length) {
      toast.info("Crie uma categoria primeiro.");
      setCategoriesOpen(true);
      return;
    }
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="pb-8">
      <PageHeader
        title="Estoque"
        description="Cada venda baixa os itens ligados ao produto. Sem estoque, o produto aparece como esgotado."
        actions={
          <>
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              <FolderCog className="size-4" />
              Categorias
            </Button>
            <Button variant="outline" onClick={() => setHistory("all")}>
              <History className="size-4" />
              Movimentações
            </Button>
            <Button onClick={openNew}>
              <Plus className="size-4" />
              Novo item
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:max-w-3xl sm:grid-cols-4 sm:gap-3 sm:px-6">
        {(
          [
            ["all", "Itens", Boxes],
            ["low", "Baixo", AlertTriangle],
            ["out", "Esgotados", CircleX],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus((s) => (s === key ? "all" : key))}
            aria-pressed={status === key && key !== "all"}
            className={cn(
              "rounded-lg border bg-surface p-3 text-left shadow-sm transition-colors hover:bg-surface-2",
              status === key && key !== "all" ? "border-primary ring-2 ring-primary/20" : "border-border",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Icon className={cn("size-3.5", key === "low" && counts.low > 0 && "text-warning-soft-foreground", key === "out" && counts.out > 0 && "text-danger")} />
              {label}
            </span>
            <span className="mt-1 block text-2xl font-bold tabular-nums">{data ? counts[key] : "–"}</span>
          </button>
        ))}
        <div className="col-span-3 rounded-lg border border-border bg-surface p-3 shadow-sm sm:col-span-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <CircleDollarSign className="size-3.5" />
            Valor em estoque
          </span>
          <span className="mt-1 block text-2xl font-bold tabular-nums">{data ? formatBRL(stockValue) : "–"}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4 sm:px-6">
        <label className="relative sm:max-w-sm">
          <span className="sr-only">Buscar item</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar item ou produto"
            className="h-10 w-full rounded-md border border-border-strong bg-surface pr-3 pl-9 text-base focus:border-primary focus:ring-3 focus:ring-primary/20 focus:outline-none sm:text-sm"
          />
        </label>
        {data && data.categories.length > 0 && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {[{ id: "all", name: "Todas" }, ...data.categories].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                aria-pressed={category === c.id}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                  category === c.id
                    ? "border-primary bg-primary-soft text-primary-soft-foreground"
                    : "border-border-strong bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6 px-4 sm:px-6">
        {!data ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)
        ) : data.categories.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="Comece pelas categorias"
            description="Crie categorias como “Salgados”, “Bebidas” e “Embalagens” para organizar o estoque."
            action={<Button onClick={() => setCategoriesOpen(true)}>Criar categoria</Button>}
          />
        ) : grouped.every((g) => g.items.length === 0) && (query || status !== "all") ? (
          <EmptyState icon={Search} title="Nenhum item encontrado" />
        ) : (
          grouped.map(({ category: c, items }) => (
            <section key={c.id} aria-labelledby={`sc-${c.id}`}>
              <div className="mb-2 flex items-center gap-2">
                <h2 id={`sc-${c.id}`} className="font-bold">
                  {c.name}
                </h2>
                <span className="text-sm text-muted-foreground">· {items.length}</span>
              </div>
              <Card className="divide-y divide-border overflow-hidden">
                {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum item nesta categoria.</p>}
                {items.map((item) => (
                  <StockRow
                    key={item.id}
                    item={item}
                    onRestock={() => setMove({ item, kind: "restock" })}
                    onAdjust={() => setMove({ item, kind: "adjust" })}
                    onHistory={() => setHistory(item)}
                    onEdit={() => {
                      setEditing(item);
                      setFormOpen(true);
                    }}
                    onDelete={() => setToDelete(item)}
                  />
                ))}
              </Card>
            </section>
          ))
        )}
      </div>

      {data && (
        <>
          <ItemFormSheet
            open={formOpen}
            item={editing}
            categories={data.categories}
            defaultCategoryId={category !== "all" ? category : (data.categories[0]?.id ?? "")}
            onClose={() => setFormOpen(false)}
            onSaved={() => {
              setFormOpen(false);
              load();
            }}
          />
          <CategoryManager
            open={categoriesOpen}
            onClose={() => setCategoriesOpen(false)}
            categories={data.categories}
            countFor={(id) => data.items.filter((i) => i.category_id === id).length}
            api={STOCK_CATEGORY_API}
            description="Organize o estoque. Estas categorias não aparecem no cardápio."
            noun={["item", "itens"]}
            onChanged={load}
          />
        </>
      )}
      <MoveSheet
        move={move}
        onClose={() => setMove(null)}
        onSaved={() => {
          setMove(null);
          load();
        }}
      />
      <HistorySheet target={history} onClose={() => setHistory(null)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
        title={`Excluir “${toDelete?.name}”?`}
        description="O item e o histórico dele saem do estoque. Itens ligados a produtos do cardápio não podem ser excluídos."
        confirmLabel="Excluir item"
      />
    </div>
  );
}

function StockRow({
  item,
  onRestock,
  onAdjust,
  onHistory,
  onEdit,
  onDelete,
}: {
  item: StockItem;
  onRestock: () => void;
  onAdjust: () => void;
  onHistory: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = STATUS[stockStatus(item)];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{item.name}</p>
          <Badge tone={status.tone}>
            <status.icon className="size-3" aria-hidden />
            {status.label}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {item.used_in.length ? `Usado em: ${item.used_in.join(", ")}` : "Não ligado a produtos do cardápio"}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xl leading-none font-bold tabular-nums">
          {formatQty(item.quantity)} <span className="text-sm font-semibold text-muted-foreground">{item.unit}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {[item.min_quantity > 0 && `mín. ${formatQty(item.min_quantity)}`, item.cost > 0 && `${formatBRL(item.cost)}/${item.unit}`].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-end">
        <Button variant="soft" size="sm" onClick={onRestock} aria-label={`Entrada de ${item.name}`}>
          <Plus className="size-4" />
          Entrada
        </Button>
        <div className="flex">
          <Button variant="ghost" size="icon" onClick={onAdjust} aria-label={`Ajustar contagem de ${item.name}`} title="Ajustar contagem">
            <SlidersHorizontal className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onHistory} aria-label={`Histórico de ${item.name}`} title="Histórico">
            <History className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Editar ${item.name}`} title="Editar">
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Excluir ${item.name}`} title="Excluir">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ItemFormSheet({
  open,
  item,
  categories,
  defaultCategoryId,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: StockItem | null;
  categories: StockCategory[];
  defaultCategoryId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} side="right" title={item ? "Editar item" : "Novo item do estoque"}>
      {open && <ItemForm key={item?.id ?? "new"} item={item} categories={categories} defaultCategoryId={defaultCategoryId} onCancel={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function ItemForm({
  item,
  categories,
  defaultCategoryId,
  onCancel,
  onSaved,
}: {
  item: StockItem | null;
  categories: StockCategory[];
  defaultCategoryId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [categoryId, setCategoryId] = useState(item?.category_id ?? defaultCategoryId);
  const [unit, setUnit] = useState(item?.unit ?? "un");
  const [minText, setMinText] = useState(item ? formatQty(item.min_quantity) : "0");
  const [costText, setCostText] = useState(item ? item.cost.toFixed(2).replace(".", ",") : "");
  const [initialText, setInitialText] = useState("0");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const min = parseMoney(minText || "0");
    const initial = parseMoney(initialText || "0");
    const cost = parseMoney(costText || "0");
    if (!name.trim()) return toast.error("Informe o nome do item.");
    if (!categoryId) return toast.error("Escolha a categoria.");
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(initial) || initial < 0) return toast.error("Revise as quantidades.");
    if (!Number.isFinite(cost) || cost < 0) return toast.error("Revise o custo.");
    setSaving(true);
    const result = await saveStockItem({
      id: item?.id,
      category_id: categoryId,
      name,
      unit: unit.trim() || "un",
      min_quantity: min,
      cost,
      initial_quantity: item ? undefined : initial,
    }).catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
    setSaving(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(item ? "Item atualizado." : "Item criado.");
    onSaved();
  }

  const decimal = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/[^\d,.]/g, ""));

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
      <div className="flex-1 space-y-4 px-5 py-5">
        <Field label="Nome" hint="Ex.: Coxinha, Refrigerante lata, Caixa para 25.">
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Categoria">
          {(p) => (
            <Select {...p} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Selecione…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Unidade" hint="un, kg, cx…">
            {(p) => <Input {...p} value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={12} />}
          </Field>
          <Field label="Estoque mínimo" hint="Alerta de estoque baixo">
            {(p) => <Input {...p} inputMode="decimal" value={minText} onChange={decimal(setMinText)} />}
          </Field>
        </div>
        <Field label={`Custo por ${unit.trim() || "unidade"} (R$)`} optional hint="Quanto custa produzir ou comprar. Usado no lucro e na margem do dashboard.">
          {(p) => <Input {...p} inputMode="decimal" value={costText} onChange={decimal(setCostText)} placeholder="0,00" />}
        </Field>
        {!item && (
          <Field label="Quantidade atual" hint="Quanto existe hoje. Depois, use Entrada e Ajustar.">
            {(p) => <Input {...p} inputMode="decimal" value={initialText} onChange={decimal(setInitialText)} />}
          </Field>
        )}
        {item && item.used_in.length > 0 && (
          <div className="rounded-md bg-surface-2 px-4 py-3 text-sm">
            <p className="font-semibold">Usado em</p>
            <p className="text-muted-foreground">{item.used_in.join(", ")}</p>
            <p className="mt-1 text-xs text-muted-foreground">Para mudar o que cada produto baixa, edite o produto no Cardápio.</p>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          Salvar item
        </Button>
      </div>
    </form>
  );
}

function MoveSheet({ move, onClose, onSaved }: { move: Move | null; onClose: () => void; onSaved: () => void }) {
  const restock = move?.kind === "restock";
  return (
    <Sheet
      open={Boolean(move)}
      onClose={onClose}
      size="sm"
      title={restock ? `Entrada de ${move?.item.name}` : `Ajustar contagem de ${move?.item.name}`}
      description={restock ? "Some o que chegou ou foi produzido." : "Informe quanto existe agora, depois de contar."}
    >
      {move && <MoveForm key={`${move.item.id}-${move.kind}`} move={move} onCancel={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function MoveForm({ move, onCancel, onSaved }: { move: Move; onCancel: () => void; onSaved: () => void }) {
  const { item, kind } = move;
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const value = parseMoney(text || "NaN");
  const valid = Number.isFinite(value) && (kind === "restock" ? value > 0 : value >= 0);
  const next = valid ? (kind === "restock" ? round2(item.quantity + value) : value) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return toast.error(kind === "restock" ? "Informe quanto entrou." : "Informe a quantidade contada.");
    setSaving(true);
    const result = await moveStock(item.id, kind, value, note).catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }));
    setSaving(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(`${item.name}: ${formatQty(next ?? 0)} ${item.unit} em estoque.`);
    onSaved();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 px-5 py-4">
      <Field label={kind === "restock" ? `Quantidade que entrou (${item.unit})` : `Quantidade contada (${item.unit})`}>
        {(p) => <Input {...p} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value.replace(/[^\d,.]/g, ""))} autoFocus />}
      </Field>
      <Field label="Observação" optional>
        {(p) => (
          <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={kind === "restock" ? "Ex.: produção da manhã" : "Ex.: contagem de fim de dia"} />
        )}
      </Field>
      <p className="rounded-md bg-surface-2 px-4 py-3 text-sm tabular-nums">
        Agora: <strong>{formatQty(item.quantity)} {item.unit}</strong>
        {next !== null && (
          <>
            {" "}
            → depois: <strong>{formatQty(next)} {item.unit}</strong>
          </>
        )}
      </p>
      <div className="flex justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving} disabled={!valid}>
          {kind === "restock" ? "Registrar entrada" : "Salvar contagem"}
        </Button>
      </div>
    </form>
  );
}

const REASON: Record<StockMovement["reason"], { label: string; icon: typeof Plus }> = {
  sale: { label: "Venda", icon: ArrowDownLeft },
  cancel: { label: "Cancelamento", icon: RotateCcw },
  restock: { label: "Entrada", icon: ArrowUpRight },
  adjust: { label: "Ajuste", icon: SlidersHorizontal },
};

function HistorySheet({ target, onClose }: { target: StockItem | "all" | null; onClose: () => void }) {
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      side="right"
      title={target === "all" ? "Movimentações do estoque" : `Histórico de ${target?.name ?? ""}`}
      description="As 100 mais recentes."
    >
      {target !== null && <HistoryList key={target === "all" ? "all" : target.id} itemId={target === "all" ? undefined : target.id} />}
    </Sheet>
  );
}

function HistoryList({ itemId }: { itemId?: string }) {
  const [rows, setRows] = useState<StockMovement[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMovements(itemId)
      .catch(() => ({ ok: false as const, error: "Sem conexão. Tente novamente." }))
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) toast.error(result.error);
        setRows(result.ok ? result.data : []);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  if (!rows) {
    return (
      <div className="space-y-2 px-5 py-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) return <EmptyState icon={History} title="Nenhuma movimentação ainda" className="py-16" />;

  return (
    <ul className="divide-y divide-border px-5 py-2">
      {rows.map((m) => {
        const reason = REASON[m.reason];
        return (
          <li key={m.id} className="flex items-center gap-3 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted-foreground">
              <reason.icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">
                {reason.label}
                {m.order_code ? ` · pedido #${m.order_code}` : ""}
                {!itemId && <span className="font-normal text-muted-foreground"> · {m.item_name}</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDateTime(m.created_at)}
                {m.user_name ? ` · ${m.user_name}` : m.reason === "sale" ? " · cardápio online" : ""}
                {m.note ? ` · ${m.note}` : ""}
              </p>
            </div>
            <span className={cn("shrink-0 font-bold tabular-nums", m.delta < 0 ? "text-danger" : "text-success")}>
              {m.delta > 0 ? "+" : "−"}
              {formatQty(Math.abs(m.delta))} {m.unit}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
