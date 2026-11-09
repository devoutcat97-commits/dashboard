/* Стрики и достижения.
   Стрик — сколько дней подряд ты что-то делаешь (записываешь траты, закрываешь дела, отмечаешь время).
   Достижения открываются сами по данным дашборда; дата открытия хранится в настройке «achievements». */
(function () {
  'use strict';

  var U = window.UI;
  var esc = U.esc;

  function localDay(iso) {
    if (!iso) return '';
    if (iso.length === 10) return iso;
    var d = new Date(iso);
    return isNaN(d) ? iso.slice(0, 10) : U.iso(d);
  }
  function addDays(date, n) { var d = U.toDate(date); d.setDate(d.getDate() + n); return U.iso(d); }

  // Дни подряд до сегодня. Если сегодня ещё ничего нет — стрик не сгорел, считаем со вчера.
  function streak(days) {
    var set = {};
    days.forEach(function (d) { if (d) set[d] = true; });
    var d = U.today();
    if (!set[d]) d = addDays(d, -1);
    var n = 0;
    while (set[d]) { n++; d = addDays(d, -1); }
    return { n: n, today: !!set[U.today()] };
  }
  function longest(days) {
    var list = Object.keys(days.reduce(function (m, d) { if (d) m[d] = 1; return m; }, {})).sort();
    var best = 0, cur = 0, prev = '';
    list.forEach(function (d) { cur = prev && addDays(prev, 1) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; });
    return best;
  }

  function doneDays() {
    return Store.list('work.tasks').concat(Store.list('study.homework'))
      .filter(function (t) { return t.done && t.doneAt; }).map(function (t) { return localDay(t.doneAt); });
  }

  function streaks() {
    var txDays = Store.list('transactions').map(function (t) { return t.date; });
    var timeDays = Store.list('time.entries').map(function (e) { return e.date; });
    return [
      { id: 'money', emoji: '💸', name: 'Учёт денег', s: streak(txDays), best: longest(txDays) },
      { id: 'tasks', emoji: '✅', name: 'Закрытые дела', s: streak(doneDays()), best: longest(doneDays()) },
      { id: 'time', emoji: '⏱️', name: 'Учёт времени', s: streak(timeDays), best: longest(timeDays) }
    ];
  }

  // ---------- Достижения ----------
  function piggyTotal() {
    var A = Store.getSetting('money.accounts.v2', []) || [];
    var ids = {};
    var sum = 0;
    A.forEach(function (a) { if (a.kind === 'piggy') { ids[a.id] = 1; sum += Number(a.start) || 0; } });
    Store.list('transactions').forEach(function (t) {
      if (t.type === 'transfer') { if (ids[t.to]) sum += t.amount; if (ids[t.account]) sum -= t.amount; }
      else if (ids[t.account]) sum += t.type === 'income' ? t.amount : -t.amount;
    });
    return sum;
  }
  function noSpendDays() {
    var tx = Store.list('transactions');
    if (!tx.length) return 0;
    var spent = {};
    var first = tx.reduce(function (m, t) { return !m || t.date < m ? t.date : m; }, '');
    tx.forEach(function (t) { if (t.type === 'expense') spent[t.date] = 1; });
    var n = 0, d = addDays(U.today(), -1), stop = addDays(U.today(), -60);
    while (d >= first && d >= stop) { if (!spent[d]) n++; d = addDays(d, -1); }
    return n;
  }
  function weekWithinBudget() {
    var w = Store.getSetting('money.weekly', null);
    if (!w || !(w.amount > 0)) return false;
    var mon = U.toDate(U.today()); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
    var from = addDays(U.iso(mon), -7), to = addDays(from, 6);
    // Считаем только недели, начавшиеся после того, как бюджет был задан.
    if (!w.since || from < w.since) return false;
    var piggies = (Store.getSetting('money.accounts.v2', []) || []).filter(function (a) { return a.kind === 'piggy'; }).map(function (a) { return a.id; });
    var tx = Store.list('transactions').filter(function (t) { return t.date >= from && t.date <= to; });
    if (!tx.length) return false;
    var s = tx.reduce(function (sum, t) {
      return sum + (t.type === 'expense' && piggies.indexOf(t.account) === -1 && (w.groups || []).indexOf(t.category) !== -1 ? t.amount : 0);
    }, 0);
    return s <= w.amount;
  }

  // Каждое: id, значок, название, как получить, и функция прогресса → [сейчас, нужно].
  var LIST = [
    { id: 'import', emoji: '📄', name: 'Первая выписка', how: 'Загрузи выписку банка', p: function () { return [Store.list('transactions').some(function (t) { return t.importKey; }) ? 1 : 0, 1]; } },
    { id: 'budget', emoji: '🎯', name: 'Под контролем', how: 'Задай бюджет на месяц или неделю', p: function () { var b = Store.getSetting('money.budget', {}) || {}; var w = Store.getSetting('money.weekly', null); return [(b.total > 0 || (w && w.amount > 0)) ? 1 : 0, 1]; } },
    { id: 'week-ok', emoji: '🗓️', name: 'Неделя в рамках', how: 'Уложись в недельный бюджет', p: function () { return [weekWithinBudget() ? 1 : 0, 1]; } },
    { id: 'nospend', emoji: '🌱', name: 'День без трат', how: 'Проживи день без расходов', p: function () { return [Math.min(1, noSpendDays()), 1]; } },
    { id: 'nospend10', emoji: '🌳', name: 'Экономист', how: '10 дней без трат за 2 месяца', p: function () { return [Math.min(10, noSpendDays()), 10]; } },
    { id: 'piggy10', emoji: '🐷', name: 'Копилка 10 000', how: 'Накопи 10 000 ₽ в копилках', p: function () { return [Math.max(0, Math.min(10000, Math.round(piggyTotal()))), 10000]; } },
    { id: 'piggy50', emoji: '💰', name: 'Копилка 50 000', how: 'Накопи 50 000 ₽', p: function () { return [Math.max(0, Math.min(50000, Math.round(piggyTotal()))), 50000]; } },
    { id: 'piggy100', emoji: '💎', name: 'Сотня', how: 'Накопи 100 000 ₽', p: function () { return [Math.max(0, Math.min(100000, Math.round(piggyTotal()))), 100000]; } },
    { id: 'trip', emoji: '✈️', name: 'Путешественник', how: 'Заведи поездку с бюджетом', p: function () { return [Store.list('trips').length ? 1 : 0, 1]; } },
    { id: 'wish', emoji: '🎁', name: 'Мечта сбылась', how: 'Купи что-то из вишлиста', p: function () { return [Store.list('wishlist').some(function (w) { return w.bought; }) ? 1 : 0, 1]; } },
    { id: 'tasks10', emoji: '✅', name: 'Деловой', how: 'Закрой 10 дел', p: function () { return [Math.min(10, doneDays().length), 10]; } },
    { id: 'tasks50', emoji: '🏅', name: 'Машина продуктивности', how: 'Закрой 50 дел', p: function () { return [Math.min(50, doneDays().length), 50]; } },
    { id: 'streak7', emoji: '🔥', name: 'Неделя подряд', how: 'Стрик 7 дней в любом деле', p: function () { return [Math.min(7, Math.max.apply(null, streaks().map(function (s) { return s.best; }))), 7]; } },
    { id: 'streak30', emoji: '☄️', name: 'Месяц подряд', how: 'Стрик 30 дней', p: function () { return [Math.min(30, Math.max.apply(null, streaks().map(function (s) { return s.best; }))), 30]; } },
    { id: 'shop', emoji: '🛒', name: 'Хозяин', how: 'Добавь 10 покупок в список', p: function () { var f = Store.getSetting('shopping.freq', {}) || {}; var n = Object.keys(f).reduce(function (s, k) { return s + f[k]; }, 0); return [Math.min(10, n), 10]; } },
    { id: 'time10', emoji: '⏳', name: '10 часов', how: 'Запиши 10 часов за неделю', p: function () {
      var T = window.Tabs && Tabs.time;
      if (!T || !T.rangeMinutes) return [0, 10];
      var mon = U.toDate(U.today()); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
      var a = Math.round(T.rangeMinutes(U.iso(mon), U.today()) / 60), b = Math.round(T.rangeMinutes(addDays(U.iso(mon), -7), addDays(U.iso(mon), -1)) / 60);
      return [Math.min(10, Math.max(a, b)), 10];
    } }
  ];

  function state() { return Object.assign({ unlocked: {}, init: false }, Store.getSetting('achievements', {}) || {}); }

  // Проверить и открыть новые. При самом первом запуске открываем молча (без салюта за старые заслуги).
  var checking = false;
  function check() {
    if (checking) return;
    var st = state();
    var fresh = [];
    LIST.forEach(function (a) {
      if (st.unlocked[a.id]) return;
      var p = a.p();
      if (p[0] >= p[1]) { st.unlocked[a.id] = U.today(); fresh.push(a); }
    });
    if (!fresh.length && st.init) return;
    var first = !st.init;
    st.init = true;
    checking = true;
    setTimeout(function () {
      Store.setSetting('achievements', st);
      checking = false;
      if (first) { if (fresh.length) U.toast('🏆 Открыто достижений: ' + fresh.length + ' — загляни в «Сводку»'); return; }
      fresh.forEach(function (a, i) {
        setTimeout(function () {
          U.toast(a.emoji + ' Новое достижение: «' + a.name + '»!');
          if (window.FX) { if (FX.confetti) FX.confetti(); if (FX.fanfare) FX.fanfare(); }
        }, i * 1800);
      });
    }, 400);
  }

  var showAll = false;
  function html() {
    var st = state();
    var S = streaks();
    var chips = S.map(function (s) {
      var n = s.s.n;
      return '<div class="streak' + (n ? ' is-on' : '') + (n && !s.s.today ? ' is-risk' : '') + '" data-tip="' + esc(s.name + '\nРекорд: ' + s.best + ' ' + U.plural(s.best, 'день', 'дня', 'дней') +
        (n && !s.s.today ? '\nСегодня ещё не было — не дай стрику сгореть!' : '')) + '">' +
        '<span class="streak-ico">' + (n >= 3 ? '🔥' : s.emoji) + '</span><b>' + n + '</b><small>' + esc(s.name) + '</small></div>';
    }).join('');
    var got = LIST.filter(function (a) { return st.unlocked[a.id]; });
    var next = LIST.filter(function (a) { return !st.unlocked[a.id]; })
      .map(function (a) { var p = a.p(); return { a: a, p: p, r: p[0] / p[1] }; })
      .sort(function (x, y) { return y.r - x.r; });
    var shown = showAll ? next : next.slice(0, 3);
    var badges = got.map(function (a) {
      var d = st.unlocked[a.id];
      return '<span class="badge is-got" data-tip="' + esc(a.name + '\n' + a.how + '\nОткрыто ' + U.toDate(d).getDate() + ' ' + U.monthGen(d)) + '">' + a.emoji + '</span>';
    }).join('');
    var progress = shown.map(function (x) {
      return '<li class="ach-next"><span class="badge">' + x.a.emoji + '</span><span class="ach-main"><b>' + esc(x.a.name) + '</b><small>' + esc(x.a.how) +
        (x.p[1] > 1 ? ' · ' + U.num(x.p[0]) + ' / ' + U.num(x.p[1]) : '') + '</small>' +
        '<span class="ach-bar"><i style="width:' + Math.round(x.r * 100) + '%"></i></span></span></li>';
    }).join('');
    return (
      '<section class="card ach-card">' +
        '<div class="card-head"><h2>🏆 Стрики и достижения</h2><span class="muted">' + got.length + ' из ' + LIST.length + '</span></div>' +
        '<div class="streaks">' + chips + '</div>' +
        (badges ? '<div class="badges">' + badges + '</div>' : '') +
        (progress ? '<h3 class="block-sub">Ближе всего</h3><ul class="ach-list">' + progress + '</ul>' : '<p class="muted">Ты открыл все достижения! 🎉</p>') +
        (next.length > 3 ? '<button type="button" class="link-btn" data-ach-all="1">' + (showAll ? 'свернуть' : 'все цели (' + next.length + ')') + '</button>' : '') +
      '</section>'
    );
  }
  function toggleAll() { showAll = !showAll; }

  window.Achievements = { html: html, check: check, toggleAll: toggleAll, streaks: streaks };
})();
