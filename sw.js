/* ============================================================
   Работа без интернета (service worker).

   Правило простое: всегда сначала пробуем загрузить свежую версию из сети,
   а копию сохраняем. Если сети нет — показываем сохранённую копию.
   Так обновления приходят сразу, а без связи дашборд всё равно открывается.
   Данные (записи) и так хранятся в браузере, им интернет не нужен.
   ============================================================ */
var CACHE = 'dashboard-v1';

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['./', 'index.html']); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var pdfLib = url.hostname === 'cdnjs.cloudflare.com' && url.pathname.indexOf('/pdf.js/') !== -1;
  var fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !pdfLib && !fonts) return;

  // Свои файлы храним без «?v=…» и «?t=…», чтобы не копились старые версии.
  var key = sameOrigin ? url.origin + url.pathname : req.url;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(key, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(key).then(function (hit) {
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match(url.origin + url.pathname.replace(/[^/]*$/, ''));
          return Response.error();
        });
      })
  );
});
