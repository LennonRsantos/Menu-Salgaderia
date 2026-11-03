"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** "center": dialog on desktop, bottom sheet on mobile. "right": side panel on desktop. */
  side?: "center" | "right";
  size?: "sm" | "md" | "lg";
  /** Hide the header (for custom hero content such as a product photo). */
  bare?: boolean;
}

const openStack: symbol[] = [];

const FOCUSABLE ='a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, description, children, footer, side = "center", size = "md", bare }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    first?.focus({ preventScroll: true });

    const token = Symbol();
    openStack.push(token);

    const onKey = (e: KeyboardEvent) => {
      // only the top-most sheet reacts when sheets are stacked
      if (openStack[openStack.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === "Tab" && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      openStack.splice(openStack.indexOf(token), 1);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" }[size];

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-overlay backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex",
          side === "right" ? "items-end sm:items-stretch sm:justify-end" : "items-end sm:items-center sm:justify-center sm:p-6",
        )}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn(
            "pointer-events-auto relative flex max-h-[92dvh] w-full animate-sheet-up flex-col overflow-hidden bg-surface shadow-md outline-none",
            "rounded-t-xl border-t border-border sm:rounded-xl sm:border",
            side === "right" && "sm:h-full sm:max-h-none sm:rounded-none sm:rounded-l-xl sm:border-y-0 sm:border-r-0",
            widths,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-surface-3 sm:hidden" aria-hidden />
          {bare ? (
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
          ) : (
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 pt-3 pb-4 sm:pt-5">
              <div className="min-w-0 space-y-1">
                <h2 id={titleId} className="text-lg font-bold">
                  {title}
                </h2>
                {description && <div className="text-sm text-muted-foreground">{description}</div>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="size-5" />
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer && (
            <div className="shrink-0 border-t border-border bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
          {bare && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full bg-surface/90 text-foreground shadow-sm backdrop-blur hover:bg-surface"
              aria-label="Fechar"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Small confirmation dialog for destructive actions. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-md px-4 text-sm font-semibold hover:bg-surface-2">
            Voltar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            data-autofocus
            className="h-11 rounded-md bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60 dark:text-black"
          >
            {loading ? "Aguarde…" : confirmLabel}
          </button>
        </div>
      }
    >
      {description && <p className="px-5 py-4 text-sm text-muted-foreground">{description}</p>}
    </Sheet>
  );
}
