// Service worker of the panel app, registered with scope /admin by
// src/components/admin/app-updates.tsx. It keeps nothing in cache, so every
// deploy reaches the app at once: it only answers a page load that fails
// without internet with a "no connection" page.

const OFFLINE_PAGE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem conexão · Painel</title>
<style>
  :root { color-scheme: light dark; --bg: #f7f1f5; --fg: #1a1218; --muted: #63555d; --btn: #6b2c7a; }
  @media (prefers-color-scheme: dark) { :root { --bg: #13110f; --fg: #f3eef1; --muted: #b5a9b0; --btn: #b07cbd; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
         font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 24px; box-sizing: border-box; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  p { margin: 0 0 24px; color: var(--muted); line-height: 1.5; }
  button { font: inherit; font-weight: 600; border: 0; border-radius: 999px; padding: 12px 24px; background: var(--btn); color: #fff; }
</style>
</head>
<body>
<main>
  <h1>Sem conexão com a internet</h1>
  <p>Confira o Wi-Fi ou os dados móveis e tente de novo.</p>
  <button type="button" onclick="location.reload()">Tentar de novo</button>
</main>
</body>
</html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // starts the page request while the worker boots, so it adds no delay
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(event.request));
      } catch {
        return new Response(OFFLINE_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
    })(),
  );
});
