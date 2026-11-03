import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import { getActiveTheme } from "@/lib/menu";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const DESCRIPTION = "Cardápio digital da Menu Salgaderia e Confeitaria: escolha seus salgados e doces, peça online e acompanhe a entrega.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Menu Salgaderia e Confeitaria — Peça online",
    template: "%s · Menu",
  },
  description: DESCRIPTION,
  // preview when the link is shared on WhatsApp, Instagram and others
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Menu Salgaderia e Confeitaria",
    title: "Menu Salgaderia e Confeitaria — Peça online",
    description: DESCRIPTION,
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Menu Salgaderia e Confeitaria" }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/og.png"] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ece6d6" },
    { media: "(prefers-color-scheme: dark)", color: "#13110f" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // palette chosen in the panel (or today's festive theme), for the whole site
  const theme = await getActiveTheme();
  return (
    <html
      lang="pt-BR"
      className={`${manrope.variable} h-full antialiased`}
      data-palette={theme.palette}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {/* visible only on keyboard focus; every page marks its content with id="conteudo" */}
        <a
          href="#conteudo"
          className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]"
        >
          Pular para o conteúdo
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
