import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getStoreSettings } from "@/lib/menu";
import { DEFAULT_STORE_NAME } from "@/components/store/store-header";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default async function PrivacyPage() {
  const settings = await getStoreSettings();
  const store = settings?.name || DEFAULT_STORE_NAME;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="Voltar ao cardápio">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 text-lg font-bold">Política de Privacidade</h1>
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-2xl space-y-5 px-4 py-6 text-sm leading-relaxed sm:px-6 [&_h2]:text-base [&_h2]:font-bold">
        <p>
          Esta página explica como a <strong>{store}</strong> usa os seus dados, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
        </p>
        <section className="space-y-2">
          <h2>Quais dados coletamos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Nome, WhatsApp e e-mail, para identificar você e falar sobre os pedidos.</li>
            <li>Endereços de entrega, para levar os pedidos.</li>
            <li>Histórico de pedidos (itens, valores e datas).</li>
            <li>Opcionais: data de aniversário, como conheceu a loja e se quer receber ofertas.</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h2>Para que usamos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Preparar, entregar e cobrar os pedidos.</li>
            <li>Preencher seus dados nos próximos pedidos.</li>
            <li>Enviar promoções pelo WhatsApp, somente se você autorizar. Você pode desligar quando quiser em Minha conta.</li>
            <li>Entender de onde vêm nossos clientes e melhorar o atendimento.</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h2>Com quem compartilhamos</h2>
          <p>Não vendemos nem compartilhamos seus dados. Eles ficam guardados em servidores seguros e só a equipe da loja tem acesso.</p>
        </section>
        <section className="space-y-2">
          <h2>Seus direitos</h2>
          <p>
            Você pode ver e corrigir seus dados em <Link href="/conta" className="font-semibold text-primary-soft-foreground hover:underline">Minha conta</Link>. Para
            pedir a exclusão da conta e dos dados, fale com a loja pelo WhatsApp{settings?.phone ? "" : " ou no balcão"}.
          </p>
        </section>
      </main>
    </div>
  );
}
