// Service worker of the installed app (PWA).
// It caches nothing: the data always comes from Firestore and the pages from the server, so
// what is shown is never out of date. It only answers page navigations with a notice when
// there is no connection, instead of the browser's error page.

const OFFLINE_HTML = `<!doctype html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Som Llar - Justificacions</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font-family: system-ui, "Segoe UI", Arial, sans-serif; background: #f8fafc; color: #0f172a; }
  .card { max-width: 26rem; margin: 1rem; padding: 2rem; background: #fff; border: 1px solid #e2e8f0;
          border-radius: 1rem; text-align: center; }
  .logo { width: 3rem; height: 3rem; margin: 0 auto 1rem; border-radius: .75rem; background: #059669;
          color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  button { margin-top: 1rem; padding: .6rem 1.2rem; border: 0; border-radius: .6rem; background: #059669;
           color: #fff; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">SL</div>
    <h1 style="font-size:1.1rem">Sense connexió</h1>
    <p style="font-size:.9rem;color:#475569">La plataforma de justificacions necessita connexió a Internet. Comprova la xarxa i torna-ho a provar.</p>
    <button onclick="location.reload()">Tornar-ho a provar</button>
  </div>
</body>
</html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })
    )
  );
});
