/* ============================================================
   Push-уведомления (приходят, даже когда дашборд закрыт).

   Как это работает:
   1) Телефон/компьютер разрешает уведомления, и дашборд сохраняет в облаке
      «адрес» этого устройства для пушей (токен).
   2) Дашборд заранее составляет план напоминаний на 3 дня вперёд
      (пары, смены, сроки, платежи, зарплата, утро и вечер) и кладёт его в облако.
      План обновляется сам, когда меняются данные.
   3) Маленький сервер на Google Apps Script раз в минуту смотрит в план
      и отправляет то, чему пришло время.
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var CFG = window.CLOUD_CONFIG || {};
  var SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  var TOKEN_KEY = 'dash:push-token';
  var HORIZON_H = 72;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function addDays(date, n) { var d = U.toDate(date); d.setDate(d.getDate() + n); return U.iso(d); }
  function at(date, hm, shiftMin) {
    var p = String(hm || '00:00').split(':');
    var d = U.toDate(date);
    d.setHours(+p[0] || 0, (+p[1] || 0) - (shiftMin || 0), 0, 0);
    return d;
  }
  function hmMinus(hm, min) { var d = at('2000-01-01', hm, min); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function supported() { return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window; }
  function enabled() { return !!token() && supported() && Notification.permission === 'granted'; }

  // ---------- План напоминаний ----------
  function buildPlan() {
    var T = window.Tabs || {};
    var now = new Date(), until = new Date(now.getTime() + HORIZON_H * 3600e3);
    var today = U.today();
    var items = [];
    function add(id, when, title, body, tab) {
      if (when > now && when <= until) items.push({ id: id, at: when.toISOString(), title: title, body: body || '', url: '#' + (tab || 'summary') });
    }
    var agenda = T.summary && T.summary.agenda ? T.summary.agenda() : [];

    for (var i = 0; i <= 3; i++) {
      var date = addDays(today, i);
      var lessons = T.study && T.study.lessonsOn ? T.study.lessonsOn(date) : [];
      var shift = T.time && T.time.scheduledShift ? T.time.scheduledShift(date) : null;
      var dayItems = agenda.filter(function (it) { return it.date === date; });

      // Утро: что сегодня
      var parts = [];
      if (lessons.length) parts.push(lessons.length + ' ' + U.plural(lessons.length, 'пара', 'пары', 'пар') + ' с ' + lessons[0].start);
      if (shift) parts.push('смена ' + shift.start + '–' + shift.end);
      var dl = dayItems.filter(function (it) { return it.check; });
      if (dl.length) parts.push(dl.length + ' ' + U.plural(dl.length, 'дело', 'дела', 'дел') + ': ' + dl.slice(0, 3).map(function (x) { return x.title; }).join(', '));
      var late = i === 0 ? agenda.filter(function (it) { return it.check && it.date < today; }).length : 0;
      if (late) parts.push('просрочено ' + late);
      if (parts.length) add('morning|' + date, at(date, '08:00'), '☀️ Доброе утро! Сегодня', parts.join(' · '), 'summary');

      // Пары — за 10 минут
      lessons.forEach(function (l) {
        add('lesson|' + date + '|' + l.num, at(date, l.start, 10), '🎓 Через 10 минут: ' + l.subject,
          l.start + '–' + l.end + (l.room ? ' · ауд. ' + l.room : '') + (l.type ? ' · ' + l.type : ''), 'study');
      });
      // Смена — за 30 минут
      if (shift) add('shift|' + date, at(date, shift.start, 30), '💼 Через 30 минут смена', shift.start + '–' + shift.end, 'work');

      // Сроки: накануне вечером
      var tomorrowItems = agenda.filter(function (it) { return it.date === addDays(date, 1); });
      var dueTomorrow = tomorrowItems.filter(function (it) { return it.check; });
      if (dueTomorrow.length) {
        add('due|' + date, at(date, '19:00'), '⏰ Завтра срок: ' + dueTomorrow.length + ' ' + U.plural(dueTomorrow.length, 'дело', 'дела', 'дел'),
          dueTomorrow.slice(0, 4).map(function (x) { return x.title; }).join(', '), 'summary');
      }
      tomorrowItems.filter(function (it) { return it.kind === 'exam' || it.kind === 'event'; }).forEach(function (it) {
        add('eve|' + it.kind + '|' + it.id, at(date, '19:00'), (it.kind === 'exam' ? '📝 Завтра: ' : '🎤 Завтра: ') + it.title, it.source + (it.time ? ' · ' + it.time : ''), 'study');
      });
      dayItems.filter(function (it) { return it.kind === 'event' && it.time; }).forEach(function (it) {
        add('event|' + it.id + '|' + date, at(date, it.time, 60), '🎤 Через час: ' + it.title, it.source, 'study');
      });

      // Деньги: платежи и зарплата
      dayItems.filter(function (it) { return it.kind === 'pay'; }).forEach(function (it) {
        add('pay|' + it.id + '|' + date, at(date, '10:00'), '💸 Сегодня платёж', it.title, 'money');
      });
      var day = +date.slice(8, 10), last = U.daysIn(U.monthKey(date));
      (Store.getSetting('work.office.parts', []) || []).forEach(function (p, k) {
        if (Math.min(Number(p.day) || 1, last) === day) add('salary|' + k + '|' + date, at(date, '12:00'), '💰 Сегодня ожидается зарплата', p.name + (p.amount ? ' ~' + U.money(p.amount) : '') + ' — отметь в «Работе», когда придёт', 'work');
      });
      if (day === 1) add('cashback|' + date, at(date, '10:00'), '💳 Новый месяц — выбери кэшбэк', 'Зайди в Т-Банк и выбери категории. Подсказка — в «Деньгах»', 'money');

      // Вечер: итог дня
      var leftN = agenda.filter(function (it) { return it.check && it.date <= date; }).length;
      var spent = i === 0 ? Store.list('transactions').filter(function (t) { return t.type === 'expense' && t.date === today; }).reduce(function (s, t) { return s + t.amount; }, 0) : 0;
      var w = T.money && T.money.weekly ? T.money.weekly() : null;
      var eve = [];
      if (i === 0) eve.push('потрачено ' + U.money(Math.round(spent)));
      if (w && i === 0) eve.push(w.left >= 0 ? 'на неделю осталось ' + U.money(Math.max(0, w.left)) : 'неделя: перерасход ' + U.money(-w.left));
      eve.push(leftN ? 'не сделано ' + leftN + ' ' + U.plural(leftN, 'дело', 'дела', 'дел') : 'все дела сделаны 🎉');
      add('evening|' + date, at(date, '21:00'), '🌙 Итог дня', cap(eve.join(' · ')) + '. Загляни в дашборд — план на завтра.', 'summary');
    }

    // Особые даты (дни рождения, праздники): за 7 дней, за 3 дня, накануне и в сам день.
    var nextDate = T.summary && T.summary.nextDate;
    if (nextDate) Store.list('countdowns').forEach(function (c) {
      var d = nextDate(c, today);
      [[7, 'Через неделю'], [3, 'Через 3 дня'], [1, 'Завтра'], [0, 'Сегодня']].forEach(function (o) {
        var day = addDays(d, -o[0]);
        if (day < today) return;
        add('date|' + c.id + '|' + d + '|' + o[0], at(day, o[0] ? '10:00' : '09:00'), (c.emoji || '📅') + ' ' + o[1] + ': ' + c.title,
          U.toDate(d).getDate() + ' ' + U.monthGen(d) + (o[0] ? '' : ' — не забудь поздравить!'), 'summary');
      });
    });

    // Перерасход недели — сразу (один раз за неделю)
    var wk = T.money && T.money.weekly ? T.money.weekly() : null;
    if (wk && wk.spent / wk.amount >= 0.85) {
      var mon = U.toDate(today); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
      var soon = new Date(now.getTime() + 60e3);
      add('week|' + U.iso(mon) + '|' + (wk.left < 0 ? 'over' : '85'), soon, wk.left < 0 ? '⛔ Бюджет недели превышен' : '🗓️ Бюджет недели почти закончился',
        wk.left < 0 ? 'Перерасход ' + U.money(-wk.left) : 'Осталось ' + U.money(wk.left) + ' до воскресенья', 'money');
    }
    // Долги старше месяца — по воскресеньям в 18:00
    return items.sort(function (a, b) { return a.at.localeCompare(b.at); });
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // ---------- Сохранение плана в облако ----------
  var lastPlan = '', planTimer = null;
  function savePlan() {
    clearTimeout(planTimer);
    planTimer = null;
    if (!window.Cloud || !Cloud._db || !Cloud._uid()) return;
    var json = JSON.stringify({ items: buildPlan(), tz: -new Date().getTimezoneOffset() });
    if (json === lastPlan) return;
    lastPlan = json;
    Cloud._db().collection('users').doc(Cloud._uid()).collection('meta').doc('plan')
      .set({ json: json, at: firebase.firestore.FieldValue.serverTimestamp() })
      .catch(function () { lastPlan = ''; });
  }
  function schedulePlan() { clearTimeout(planTimer); planTimer = setTimeout(savePlan, 3000); }

  // ---------- Подписка устройства ----------
  function loadMessaging() {
    if (window.firebase && firebase.messaging) return Promise.resolve();
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = SDK + 'firebase-messaging-compat.js';
      s.onload = ok;
      s.onerror = function () { fail(new Error('Не загрузилась библиотека уведомлений')); };
      document.head.appendChild(s);
    });
  }
  function tokensRef() { return Cloud._db().collection('users').doc(Cloud._uid()).collection('meta').doc('push'); }
  function updateTokens(fn) {
    var db = Cloud._db(), ref = tokensRef();
    return db.runTransaction(function (tx) {
      return tx.get(ref).then(function (d) {
        var data = {};
        try { data = d.exists ? JSON.parse(d.data().json || '{}') : {}; } catch (e) {}
        data.tokens = data.tokens || {};
        fn(data.tokens);
        tx.set(ref, { json: JSON.stringify(data) });
      });
    });
  }
  function deviceName() {
    var ua = navigator.userAgent;
    return /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iPhone' : /windows/i.test(ua) ? 'Компьютер (Windows)' : /mac/i.test(ua) ? 'Mac' : 'Устройство';
  }

  function enable() {
    if (!supported()) return Promise.reject(new Error('Этот браузер не поддерживает push-уведомления. На iPhone сначала добавь дашборд на экран «Домой».'));
    if (!window.Cloud || !Cloud._uid()) return Promise.reject(new Error('Сначала войди в облако через Google'));
    if (!CFG.vapidKey) return Promise.reject(new Error('Push ещё не настроены на сервере'));
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error('Уведомления не разрешены в браузере');
      return Promise.all([loadMessaging(), navigator.serviceWorker.ready]);
    }).then(function (r) {
      return firebase.messaging().getToken({ vapidKey: CFG.vapidKey, serviceWorkerRegistration: r[1] });
    }).then(function (t) {
      if (!t) throw new Error('Не получилось подписаться на уведомления');
      try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {}
      return updateTokens(function (tokens) { tokens[t] = { device: deviceName(), at: new Date().toISOString() }; });
    }).then(function () {
      lastPlan = '';
      savePlan();
    });
  }
  function disable() {
    var t = token();
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    if (!t || !window.Cloud || !Cloud._uid()) return Promise.resolve();
    return updateTokens(function (tokens) { delete tokens[t]; }).then(function () {
      return loadMessaging().then(function () { return firebase.messaging().deleteToken(); });
    }).catch(function () {});
  }
  function test() {
    if (!window.Cloud || !Cloud._uid()) return;
    var soon = new Date(Date.now() + 60e3).toISOString();
    Cloud._db().collection('users').doc(Cloud._uid()).collection('meta').doc('test')
      .set({ json: JSON.stringify({ id: 'test|' + Date.now(), at: soon, title: '🔔 Проверка уведомлений', body: 'Если ты это видишь — push работают!', url: '#summary' }) });
  }

  function statusText() {
    if (!supported()) return 'Этот браузер не умеет push. На iPhone добавь дашборд на экран «Домой» и открой оттуда.';
    if (!CFG.vapidKey) return 'Push-уведомления ещё не настроены.';
    if (Notification.permission === 'denied') return 'Уведомления запрещены в настройках браузера — разреши их для этого сайта.';
    if (enabled()) return 'Включены на этом устройстве: пары и смены, утро, сроки, платежи и зарплата, вечерний итог. Приходят, даже когда дашборд закрыт.';
    return 'Выключены на этом устройстве.';
  }

  // План обновляем при любом изменении данных и раз в 30 минут (чтобы горизонт сдвигался).
  Store.subscribe(schedulePlan);
  setInterval(schedulePlan, 30 * 60e3);
  if (window.Cloud) Cloud.onChange(function () { if (Cloud.state() === 'synced') schedulePlan(); });

  window.Push = { enable: enable, disable: disable, enabled: enabled, supported: supported, statusText: statusText, test: test, buildPlan: buildPlan };
})();
