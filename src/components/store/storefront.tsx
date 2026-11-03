"use client";

import { Search, SearchX, Store, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/misc";
import type { MenuResult } from "@/lib/menu";
import { cn, normalizeSearch } from "@/lib/format";
import { useStoreStatus } from "@/lib/use-store-status";
import type { Product, StoreSettings } from "@/types";
import { CartBar } from "./cart";
import { ProductCard } from "./product-card";
import { ProductSheet } from "./product-sheet";
import { StoreHeader } from "./store-header";

export function Storefront({ menu, settings }: { menu: MenuResult; settings: StoreSettings | null }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const status = useStoreStatus(settings);

  const categories = useMemo(() => (menu.ok ? menu.categories : []), [menu]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return categories;
    return categories
      .map((c) => ({
        ...c,
        products: c.products.filter((p) => normalizeSearch(`${p.name} ${p.description ?? ""}`).includes(q)),
      }))
      .filter((c) => c.products.length > 0);
  }, [categories, query]);

  // Scroll-spy: highlight the category whose section is under the sticky bar.
  useEffect(() => {
    if (query) return;
    const sections = categories
      .map((c) => document.getElementById(`cat-${c.id}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveCategory(visible[0].target.id.replace("cat-", ""));
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [categories, query]);

  // Keep the active tab visible in the horizontal tab bar.
  useEffect(() => {
    if (!activeCategory) return;
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-cat="${activeCategory}"]`);
    tab?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeCategory]);

  const current = activeCategory ?? categories[0]?.id ?? null;

  return (
    <div className="min-h-dvh pb-28">
      <StoreHeader settings={settings} />

      {settings && status.known && !status.open && (
        <div className="border-b border-border bg-warning-soft px-4 py-3 text-center text-sm font-medium text-warning-soft-foreground">
          {status.canSchedule
            ? `Estamos fechados agora${status.next ? ` (${status.next.toLowerCase()})` : ""}. Você pode fazer uma encomenda para outro dia.`
            : `Estamos fechados agora${status.next ? ` (${status.next.toLowerCase()})` : ""}. Você pode ver o cardápio, mas os pedidos estão pausados.`}
        </div>
      )}

      <div className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 pt-3 sm:px-6">
          <label className="relative block">
            <span className="sr-only">Buscar no cardápio</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar salgado, bebida…"
              className="h-11 w-full rounded-full border border-border bg-surface pr-10 pl-10 text-base placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/20 focus:outline-none sm:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-surface-2"
                aria-label="Limpar busca"
              >
                <X className="size-4" />
              </button>
            )}
          </label>
          {!query && categories.length > 0 && (
            <nav ref={tabsRef} className="no-scrollbar -mx-4 mt-2 flex gap-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6" aria-label="Categorias">
              {categories.map((c) => (
                <a
                  key={c.id}
                  href={`#cat-${c.id}`}
                  data-cat={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  aria-current={current === c.id ? "true" : undefined}
                  className={cn(
                    "relative shrink-0 px-3 py-3 text-sm font-semibold whitespace-nowrap transition-colors",
                    current === c.id ? "text-primary-soft-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.name}
                  <span
                    className={cn(
                      "absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent transition-opacity",
                      current === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                </a>
              ))}
            </nav>
          )}
          {(query || categories.length === 0) && <div className="h-3" />}
        </div>
      </div>

      <main id="conteudo" tabIndex={-1} className="mx-auto max-w-5xl px-4 outline-none sm:px-6">
        {!menu.ok ? (
          <EmptyState
            icon={Store}
            title="Cardápio indisponível"
            description="Não foi possível carregar o cardápio agora. Tente novamente em instantes."
            className="py-20"
          />
        ) : categories.length === 0 ? (
          <EmptyState icon={Store} title="Cardápio em preparação" description="Ainda não há produtos publicados." className="py-20" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Nada encontrado"
            description={`Nenhum item corresponde a “${query}”.`}
            className="py-20"
          />
        ) : (
          filtered.map((c) => (
            <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-32 pt-7" aria-labelledby={`h-${c.id}`}>
              <h2 id={`h-${c.id}`} className="mb-3 text-lg font-bold tracking-tight">
                {c.name}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {c.products.map((p) => (
                  <ProductCard key={p.id} product={p} onSelect={() => setSelected(p)} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <ProductSheet product={selected} onClose={() => setSelected(null)} />
      <CartBar settings={settings} />
    </div>
  );
}
