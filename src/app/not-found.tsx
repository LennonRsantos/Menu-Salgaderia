import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <main id="conteudo" className="grid min-h-dvh place-items-center px-4">
      <EmptyState
        icon={SearchX}
        title="Página não encontrada"
        description="O endereço pode ter mudado ou o link está incompleto."
        action={
          <Link href="/" className={buttonClasses("primary")}>
            Ver cardápio
          </Link>
        }
      />
    </main>
  );
}
