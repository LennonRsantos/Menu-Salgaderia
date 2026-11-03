import type { MetadataRoute } from "next";

// Install manifest of the panel only, linked from src/app/admin/layout.tsx, so
// the storefront never offers to install the panel. It lives outside /admin/ on
// purpose: the login proxy would redirect it. The Android app (android/) opens
// the same start_url.
const manifest: MetadataRoute.Manifest = {
  id: "/admin",
  name: "Menu Salgaderia — Painel",
  short_name: "Menu Painel",
  description: "Pedidos, encomendas, cardápio e estoque da Menu Salgaderia e Confeitaria.",
  lang: "pt-BR",
  dir: "ltr",
  start_url: "/admin",
  scope: "/admin",
  display: "standalone",
  orientation: "any",
  background_color: "#F3EBDD",
  theme_color: "#F7F1F5",
  icons: [
    { src: "/admin-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/admin-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/admin-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/admin-icons/monochrome-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
  ],
};

export function GET() {
  return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/manifest+json; charset=utf-8" } });
}
