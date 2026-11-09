/* ============================================================
   Работа без интернета (service worker).

   Правило простое: всегда сначала пробуем загрузить свежую версию из сети,
   а копию сохраняем. Если сети нет — показываем сохранённую копию.
   Так обновления приходят сразу, а без связи дашборд всё равно открывается.
   Данные (записи) и так хранятся в браузере, им интернет не нужен.
   ============================================================ */
var CACHE = 'dashboard-v2';

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

// ---------- Push-уведомления ----------
// Сервер присылает { data: { title, body, url, tag } } через Firebase Cloud Messaging.
self.addEventListener('push', function (event) {
  var p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) { p = { data: { title: 'Мой дашборд', body: event.data ? event.data.text() : '' } }; }
  var d = p.data || p.notification || p;
  event.waitUntil(self.registration.showNotification(d.title || 'Мой дашборд', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '#summary' }
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = new URL((event.notification.data && event.notification.data.url) || '#summary', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(self.registration.scope) === 0) { list[i].focus(); return list[i].navigate(url); }
    }
    return self.clients.openWindow(url);
  }));
});
