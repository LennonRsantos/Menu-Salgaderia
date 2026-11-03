"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const CHECK_EVERY = 10 * 60_000;

/**
 * Panel app support. Registers the service worker (offline page) and tells a
 * panel left open that a newer version was deployed. The Android app loads the
 * site, so opening it again always brings the newest version.
 */
export function AppUpdates({ version }: { version: string }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin", updateViaCache: "none" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (version === "dev") return;
    let notified = false;
    // no automatic reload: it could throw away something being typed
    async function check() {
      if (notified || document.visibilityState !== "visible") return;
      const res = await fetch("/api/version", { cache: "no-store" }).catch(() => null);
      const latest = res?.ok ? ((await res.json().catch(() => null)) as { version?: string } | null)?.version : undefined;
      if (!latest || latest === "dev" || latest === version) return;
      notified = true;
      toast("Nova versão do painel disponível.", {
        id: "app-update",
        duration: Infinity,
        action: { label: "Atualizar", onClick: () => window.location.reload() },
      });
    }
    const timer = window.setInterval(check, CHECK_EVERY);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [version]);

  return null;
}
