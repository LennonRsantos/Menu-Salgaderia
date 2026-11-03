// Public address of the site, for share previews, robots and the sitemap.
// NEXT_PUBLIC_SITE_URL wins (custom domain); on Vercel the production domain is the fallback.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/$/, "");
