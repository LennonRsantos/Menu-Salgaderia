import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // only the public menu is meant for search engines
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/pedido", "/checkout", "/conta"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
