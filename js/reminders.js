/* ============================================================
   Напоминания (уведомления браузера).

   - за 10 минут до начала пары;
   - утром (после 8:00) — сколько дел на сегодня;
   - в день регулярного платежа.
   Работают, пока дашборд открыт во вкладке или установлен на телефон как приложение.
   (Чтобы уведомления приходили при закрытом сайте, нужен сервер — это следующий шаг.)
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var FLAG = 'dash:reminders', SENT = 'dash:notified';

  function supported() { return 'Notification' in window; }
  function enabled() {
    try { return supported() && Notification.permission === 'granted' && localStorage.getItem(FLAG) === '1'; } catch (e) { return false; }
  }

  function statusText() {
    if (!supported()) return 'Этот браузер не умеет показывать уведомления.';
    if (Notification.permission === 'denied') return 'Уведомления запрещены в настройках браузера — разреши их для этого сайта.';
    if (enabled()) return 'Включены: за 10 минут до пары, утром — дела на день, в день регулярного платежа. Работают, пока дашборд открыт или установлен на телефон.';
    return 'Выключены. Напомню о парах, делах на день и платежах.';
  }

  function toggle() {
    if (!supported()) return Promise.resolve();
    if (enabled()) { localStorage.setItem(FLAG, '0'); return Promise.resolve(); }
    return Notification.requestPermission().then(function (p) {
      if (p === 'granted') {
        localStorage.setItem(FLAG, '1');
        notify('Напоминания включены', 'Теперь я напомню о парах и делах 👋', 'hello-' + Date.now());
        check();
      }
    });
  }

  function sentMap() { try { return JSON.parse(localStorage.getItem(SENT) || '{}'); } catch (e) { return {}; } }
  function markSent(key) {
    var m = sentMap();
    m[key] = U.today();
    // Чистим старые отметки (старше недели).
    var weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    var lim = U.iso(weekAgo);
    Object.keys(m).forEach(function (k) { if (m[k] < lim) delete m[k]; });
    try { localStorage.setItem(SENT, JSON.stringify(m)); } catch (e) {}
  }

  function notify(title, body, key) {
    if (key && sentMap()[key]) return;
    if (key) markSent(key);
    var opts = { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: key || undefined };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg && reg.showNotification) reg.showNotification(title, opts);
        else new Notification(title, opts);
      });
    } else {
      try { new Notification(title, opts); } catch (e) {}
    }
  }

  function minutesUntil(hm) {
    var p = hm.split(':'), d = new Date();
    return (+p[0]) * 60 + (+p[1]) - (d.getHours() * 60 + d.getMinutes());
  }

  function check() {
    if (!enabled()) return;
    if (window.Push && Push.enabled()) return;   // напоминания уже приходят пушами с сервера — не дублируем
    var T = window.Tabs || {}, today = U.today();

    // Пары
    if (T.study && T.study.lessonsOn) {
      T.study.lessonsOn(today).forEach(function (l) {
        var m = minutesUntil(l.start);
        if (m >= 0 && m <= 10) notify('Скоро пара: ' + l.subject, l.start + '–' + l.end + (l.room ? ' · ауд. ' + l.room : '') + (l.teacher ? ' · ' + l.teacher : ''), 'lesson|' + today + '|' + l.num);
      });
    }

    // Утро: дела на день
    if (new Date().getHours() >= 8 && T.summary && T.summary.agenda) {
      var items = T.summary.agenda().filter(function (it) { return it.date === today && (it.check || it.kind === 'event' || it.kind === 'exam'); });
      var late = T.summary.agenda().filter(function (it) { return it.check && it.date < today; }).length;
      var lessons = T.study && T.study.lessonsOn ? T.study.lessonsOn(today).length : 0;
      if (items.length || late || lessons) {
        var parts = [];
        if (lessons) parts.push(lessons + ' ' + U.plural(lessons, 'пара', 'пары', 'пар'));
        if (items.length) parts.push(items.length + ' ' + U.plural(items.length, 'дело', 'дела', 'дел') + ': ' + items.slice(0, 3).map(function (i) { return i.title; }).join(', '));
        if (late) parts.push('просрочено ' + late);
        notify('Доброе утро! Сегодня', parts.join(' · '), 'morning|' + today);
      }
    }

    // Вечер: итог дня
    if (new Date().getHours() >= 21 && T.summary && T.summary.agenda) {
      var leftN = T.summary.agenda().filter(function (it) { return it.check && it.date <= today; }).length;
      notify('🌙 Итог дня', leftN ? 'Осталось ' + leftN + ' ' + U.plural(leftN, 'дело', 'дела', 'дел') + ' — перенести на завтра? И запиши, на что ушло время.' : 'Все дела сделаны! Запиши, на что ушло время сегодня.', 'evening|' + today);
    }

    // Регулярные платежи
    if (T.money && T.money.overview) {
      T.money.overview().recurring.forEach(function (r) {
        if (!r.paid && r.date === today) notify('Сегодня платёж: ' + r.name, U.money(r.amount) + ' — не забудь отметить в «Деньгах»', 'pay|' + today + '|' + r.id);
      });
    }
  }

  setInterval(check, 60 * 1000);
  window.addEventListener('load', function () { setTimeout(check, 3000); });

  window.Reminders = { toggle: toggle, enabled: enabled, statusText: statusText, check: check };
})();
