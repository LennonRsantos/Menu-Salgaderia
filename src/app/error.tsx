"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="conteudo" className="grid min-h-dvh place-items-center px-4">
      <EmptyState
        icon={TriangleAlert}
        title="Algo deu errado"
        description="Não conseguimos carregar esta página. Tente de novo em instantes."
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => retry()} className={buttonClasses("primary")}>
              Tentar de novo
            </button>
            <Link href="/" className={buttonClasses("outline")}>
              Ver cardápio
            </Link>
          </div>
        }
      />
    </main>
  );
}
