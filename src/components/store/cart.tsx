"use client";

import { ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState, QuantityStepper } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cartTotals, useCart, type CartItem } from "@/lib/cart-store";
import { cn, formatBRL } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";
import { useStoreStatus } from "@/lib/use-store-status";
import type { StoreSettings } from "@/types";

export function CartBar({ settings }: { settings: StoreSettings | null }) {
  const mounted = useMounted();
  const items = useCart((s) => s.items);
  const [open, setOpen] = useState(false);
  const { count, subtotal } = cartTotals(mounted ? items : []);

  return (
    <>
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            key={count}
            className="mx-auto flex h-14 w-full max-w-lg animate-pop items-center gap-3 rounded-full bg-primary pr-5 pl-2 text-primary-foreground shadow-md transition-colors hover:bg-primary-hover"
          >
            <span className="grid size-10 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground tabular-nums">
              {count}
            </span>
            <span className="flex-1 text-left font-semibold">Ver carrinho</span>
            <span className="font-bold tabular-nums">{formatBRL(subtotal)}</span>
          </button>
        </div>
      )}
      <CartSheet open={open} onClose={() => setOpen(false)} settings={settings} />
    </>
  );
}

export function CartLine({ item, editable = true }: { item: CartItem; editable?: boolean }) {
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  return (
    <li className="flex gap-3 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">
          {!editable && <span className="mr-1 tabular-nums text-muted-foreground">{item.quantity}×</span>}
          {item.name}
        </p>
        {item.addons.length > 0 && (
          <p className="mt-0.5 text-sm text-muted-foreground">{item.addons.map((a) => a.name).join(", ")}</p>
        )}
        {item.notes && <p className="mt-0.5 text-sm text-muted-foreground italic">“{item.notes}”</p>}
        {item.scheduleOnly && <p className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold">Só por encomenda</p>}
        <p className="mt-1.5 text-sm font-bold tabular-nums">{formatBRL(item.unitPrice * item.quantity)}</p>
      </div>
      {editable && (
        <div className="flex flex-col items-end justify-between gap-2">
          <button
            type="button"
            onClick={() => remove(item.key)}
            className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground"
            aria-label={`Remover ${item.name}`}
          >
            <Trash2 className="size-4" />
          </button>
          <QuantityStepper size="sm" value={item.quantity} onChange={(q) => setQuantity(item.key, q)} />
        </div>
      )}
    </li>
  );
}

function CartSheet({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: StoreSettings | null }) {
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const { subtotal } = cartTotals(items);
  const minOrder = settings?.min_order ?? 0;
  const belowMin = subtotal < minOrder;
  const status = useStoreStatus(settings);
  // closed stores may still take scheduled orders
  const closed = !settings || (!status.open && !status.canSchedule);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Seu carrinho"
      side="right"
      description={items.length > 0 ? `${items.length} ${items.length === 1 ? "item" : "itens"}` : undefined}
      footer={
        items.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-lg font-bold tabular-nums">{formatBRL(subtotal)}</span>
            </div>
            {belowMin && (
              <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
                Faltam <strong className="tabular-nums">{formatBRL(minOrder - subtotal)}</strong> para o pedido mínimo de{" "}
                {formatBRL(minOrder)}.
              </p>
            )}
            {closed ? (
              <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">A loja está fechada no momento.</p>
            ) : (
              <Link
                href="/checkout"
                onClick={onClose}
                aria-disabled={belowMin}
                className={cn(buttonClasses("primary", "lg", "w-full"), belowMin && "pointer-events-none opacity-50")}
              >
                Continuar para entrega e pagamento
              </Link>
            )}
          </div>
        )
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Carrinho vazio" description="Escolha seus salgados no cardápio." className="py-16" />
      ) : (
        <div className="px-5">
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <CartLine key={i.key} item={i} />
            ))}
          </ul>
          <button type="button" onClick={clear} className="mb-4 text-sm font-semibold text-muted-foreground hover:text-danger">
            Esvaziar carrinho
          </button>
        </div>
      )}
    </Sheet>
  );
}
