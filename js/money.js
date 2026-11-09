/* ============================================================
   Вкладка «Деньги».

   Подразделы: Обзор · История · Планы · Настройки.

   Что где хранится (через Store):
   - 'transactions' — записи: расход / доход / перевод между счетами
                      (пополнение копилки — тоже перевод);
   - 'recurring'    — регулярные платежи;
   - настройки: 'money.cats.v2' (группы и подкатегории), 'money.accounts.v2'
     (счета и копилки), 'money.budget', 'money.learned' (что дашборд запомнил).
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var C = window.Charts;
  var MD = window.MoneyData;
  var esc = U.esc;
  window.Tabs = window.Tabs || {};

  // ---------- Иконки ----------
  function ico(path) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
  var I = {
    plus: ico('<path d="M12 5v14M5 12h14"/>'),
    left: ico('<path d="m15 6-6 6 6 6"/>'),
    right: ico('<path d="m9 6 6 6-6 6"/>'),
    alert: ico('<path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/>'),
    check: ico('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    edit: ico('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>'),
    trash: ico('<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>'),
    search: ico('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'),
    gear: ico('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>'),
    gift: ico('<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8s-1.5-4-4-4a2 2 0 0 0 0 4h4Zm0 0s1.5-4 4-4a2 2 0 0 1 0 4h-4Z"/>'),
    users: ico('<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14c2.4.2 4 1.7 4.5 4.5"/>'),
    link: ico('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    upload: ico('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v4h14v-4"/>'),
    chevron: ico('<path d="m9 6 6 6-6 6"/>'),
    piggy: ico('<path d="M5 11a7 6 0 0 1 12-3h2v3l-1.5 1.5V16H15v2h-2.5v-2h-3v2H7v-2.5A6 6 0 0 1 5 11Z"/><path d="M14.5 10.5v.01"/>')
  };

  // ---------- Значки и цвета категорий ----------
  var CAT_ICONS = {
    food: ['🍔', 28], home: ['🏠', 200], transport: ['🚌', 210], connect: ['📱', 260], study: ['📚', 230], health: ['💊', 150],
    beauty: ['💄', 330], clothes: ['👕', 280], household: ['🧺', 40], fun: ['🎮', 300], travel: ['✈️', 190], gifts: ['🎁', 350],
    worktax: ['💼', 25], finance: ['🏦', 220], family: ['👨‍👩‍👧', 15], people: ['🤝', 170], charity: ['❤️', 0], 'other-exp': ['📦', 45],
    'work-office': ['🏢', 160], 'work-remote': ['💻', 250], stipend: ['🎓', 215], 'family-help': ['💝', 340], sidejob: ['🛠️', 30],
    'gifts-inc': ['🎁', 350], cashback: ['💸', 140], refunds: ['↩️', 195], sales: ['🏷️', 60], 'other-inc': ['💰', 50]
  };
  function catIcon(id, kind) {
    var c = kind === 'transfer' ? ['🔁', 210] : kind === 'piggy' ? ['🐷', 330] : CAT_ICONS[id] || ['📦', 45];
    return '<span class="cat-ico" style="--h:' + c[1] + '" aria-hidden="true">' + c[0] + '</span>';
  }
  function catEmoji(id) { return (CAT_ICONS[id] || ['📦'])[0]; }

  // ============================================================
  //  Настройки и справочники
  // ============================================================
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function getCats() {
    var c = clone(Store.getSetting('money.cats.v2', MD.CATS));
    ['expense', 'income'].forEach(function (t) {
      c[t] = c[t] || [];
      c[t].forEach(function (g) { g.subs = g.subs || []; });
    });
    // Рабочие группы доходов должны быть всегда — в них приходят оплаты из «Работы».
    MD.CATS.income.forEach(function (d) {
      if (d.locked && !c.income.some(function (x) { return x.id === d.id; })) c.income.push(clone(d));
    });
    return c;
  }
  function getAccounts() { return clone(Store.getSetting('money.accounts.v2', MD.ACCOUNTS)); }
  function getBudget() {
    var b = clone(Store.getSetting('money.budget', {}));
    return { total: Number(b.total) || 0, limits: b.limits || {} };
  }
  function getLearned() { return clone(Store.getSetting('money.learned', {})); }
  function learn(phrase, entry) {
    var k = MD.norm(phrase);
    if (!k) return;
    var l = getLearned();
    l[k] = entry;
    Store.setSetting('money.learned', l);
  }

  // Кэш для быстрого чтения — сбрасывается при любом изменении данных.
  var cacheCats = null, cacheAccs = null;
  Store.subscribe(function () { cacheCats = null; cacheAccs = null; });
  function cats() { return cacheCats || (cacheCats = getCats()); }
  function accs() { return cacheAccs || (cacheAccs = getAccounts()); }

  function allGroups() { var c = cats(); return c.expense.concat(c.income); }
  function findGroup(id) { return allGroups().find(function (g) { return g.id === id; }) || null; }
  function findSub(id) {
    if (!id) return null;
    var gs = allGroups();
    for (var i = 0; i < gs.length; i++) {
      var s = gs[i].subs.find(function (x) { return x.id === id; });
      if (s) return s;
    }
    return null;
  }
  function groupName(id) { var g = findGroup(id); return g ? g.name : 'Без категории'; }
  function subName(id) { var s = findSub(id); return s ? s.name : ''; }
  function catFull(category, sub) { var s = subName(sub); return groupName(category) + (s ? ' › ' + s : ''); }

  function isPiggy(id) { return accs().some(function (a) { return a.id === id && a.kind === 'piggy'; }); }
  function isDebt(id) { return accs().some(function (a) { return a.id === id && a.kind === 'debt'; }); }
  function regularAccounts() { return accs().filter(function (a) { return a.kind !== 'piggy' && a.kind !== 'debt'; }); }
  function debtors() { return accs().filter(function (a) { return a.kind === 'debt'; }); }
  function piggies() { return accs().filter(function (a) { return a.kind === 'piggy'; }); }
  function accName(id) { var a = accs().find(function (x) { return x.id === id; }); return a ? a.name : 'Удалённый счёт'; }
  function defaultAccount() { var r = regularAccounts(); return r[0] ? r[0].id : ''; }

  // ============================================================
  //  Подсчёты
  // ============================================================
  function allTx() { return Store.list('transactions'); }
  function inMonth(list, key) { return list.filter(function (t) { return U.monthKey(t.date) === key; }); }
  function total(list, type) {
    return U.round2(list.reduce(function (s, t) { return s + (t.type === type ? t.amount : 0); }, 0));
  }
  // Расходы для бюджета: траты из копилок не считаем — на них копили отдельно.
  function budgetSpent(list) {
    return U.round2(list.reduce(function (s, t) { return s + (t.type === 'expense' && !isPiggy(t.account) ? t.amount : 0); }, 0));
  }
  function balances() {
    var map = {};
    accs().forEach(function (a) { map[a.id] = Number(a.start) || 0; });
    allTx().forEach(function (t) {
      if (t.type === 'income') map[t.account] = (map[t.account] || 0) + t.amount;
      else if (t.type === 'expense') map[t.account] = (map[t.account] || 0) - t.amount;
      else if (t.type === 'transfer') {
        map[t.account] = (map[t.account] || 0) - t.amount;
        map[t.to] = (map[t.to] || 0) + t.amount;
      }
    });
    Object.keys(map).forEach(function (k) { map[k] = U.round2(map[k]); });
    return map;
  }
  function currentMonth() { return U.monthKey(U.today()); }
  function defaultDate() {
    var cur = currentMonth();
    if (state.month === cur) return U.today();
    return state.month + '-' + (state.month < cur ? U.pad(U.daysIn(state.month)) : '01');
  }

  // ============================================================
  //  Состояние и отрисовка
  // ============================================================
  var state = { view: 'overview', month: currentMonth(), q: '', cat: '', type: '', all: false };
  var host = null, wrap = null, charts = {}, lastWidth = 0, refocusQuick = false;
  var VIEWS = [['overview', 'Обзор'], ['history', 'История'], ['report', 'Итоги'], ['plans', 'Планы'], ['debts', 'Долги']];

  function render(el) {
    host = el;
    charts = {};
    wrap = document.createElement('div');
    wrap.className = 'money';
    wrap.innerHTML = headHtml() + toolbarHtml() + '<div class="money-body">' + bodyHtml() + '</div>';
    el.innerHTML = '';
    el.appendChild(wrap);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('input', onInput);
    wrap.addEventListener('change', onChange);
    wrap.addEventListener('submit', onSubmit);
    wrap.addEventListener('fx:swipe', onSwipe);
    drawCharts();
    lastWidth = wrap.clientWidth;
    if (refocusQuick) {
      var q = wrap.querySelector('[data-role="quick"]');
      if (q) q.focus({ preventScroll: true });
      refocusQuick = false;
    }
  }
  function rerender() { if (host) render(host); }

  function headHtml() {
    return (
      '<header class="page-head page-head--row">' +
        '<div><h1>Деньги</h1><p class="lead">Доходы, расходы и бюджет</p></div>' +
        '<button type="button" class="btn btn-primary fab" data-action="add-tx" aria-label="Добавить запись">' + I.plus + '<span>Запись</span></button>' +
      '</header>'
    );
  }

  function toolbarHtml() {
    var tabs = VIEWS.map(function (v) {
      return '<button type="button" role="tab" aria-selected="' + (state.view === v[0]) + '" data-action="view" data-view="' + v[0] + '">' + v[1] + '</button>';
    }).join('');
    var showMonth = state.view !== 'settings' && state.view !== 'debts';
    var month =
      '<div class="month-switch">' +
        (showMonth
          ? '<button type="button" class="icon-btn" data-action="month" data-step="-1" aria-label="Предыдущий месяц">' + I.left + '</button>' +
            '<span class="month-label">' + U.monthTitle(state.month) + '</span>' +
            '<button type="button" class="icon-btn" data-action="month" data-step="1" aria-label="Следующий месяц">' + I.right + '</button>'
          : '<span class="month-label">' + (state.view === 'settings' ? 'Настройки денег' : 'Кто кому должен') + '</span>') +
        '<button type="button" class="icon-btn money-gear' + (state.view === 'settings' ? ' is-on' : '') + '" data-action="view" data-view="' +
          (state.view === 'settings' ? 'overview' : 'settings') + '" aria-label="Настройки денег" data-tip="Бюджет, категории, счета, импорт">' + I.gear + '</button>' +
      '</div>';
    return '<div class="toolbar"><div class="segmented segmented--scroll" role="tablist" aria-label="Подразделы">' + tabs + '</div>' + month + '</div>';
  }

  function bodyHtml() {
    if (state.view === 'history') return quickHtml() + historyHtml();
    if (state.view === 'report') return reportHtml();
    if (state.view === 'plans') return plansHtml();
    if (state.view === 'debts') return debtsHtml();
    if (state.view === 'settings') return settingsHtml();
    return quickHtml() + overviewHtml();
  }

  // ============================================================
  //  Быстрая строка
  // ============================================================
  var QUICK_HINT = 'Напиши, на что и сколько. Можно добавить «вчера», дату «5.11» или «нал».';

  function quickHtml() {
    return (
      '<form class="quick card" data-form="quick" autocomplete="off">' +
        '<div class="quick-row">' +
          '<input type="text" data-role="quick" enterkeyhint="done" aria-label="Быстрая запись" ' +
            'placeholder="Быстрая запись: такси 450 · стипендия +3200 · вчера кофе 250 нал">' +
          '<button type="submit" class="btn btn-primary">Добавить</button>' +
        '</div>' +
        '<div class="quick-preview" id="quick-preview">' + QUICK_HINT + '</div>' +
      '</form>'
    );
  }

  function parseQuick(text) {
    return MD.parseQuick(text, { accounts: accs(), learned: getLearned() });
  }

  function quickPreview(text) {
    var p = parseQuick(text);
    if (!p) return QUICK_HINT;
    var parts = [];
    parts.push('<b>' + (p.type === 'income' ? 'Доход' : 'Расход') + '</b>');
    parts.push(p.matched ? esc(catFull(p.category, p.sub)) : '<span class="warn">категорию выберешь в форме</span>');
    parts.push(p.amount > 0 ? U.money(p.amount) : '<span class="warn">нет суммы</span>');
    parts.push(esc(accName(p.account || defaultAccount())));
    parts.push(U.dayLabel(p.date || defaultDate()));
    return parts.join(' · ');
  }

  function cleanNote(p) {
    var n = MD.norm(p.note);
    if (!n) return '';
    if (n === MD.norm(groupName(p.category)) || (p.sub && n === MD.norm(subName(p.sub)))) return '';
    return p.note;
  }

  function submitQuick(input) {
    var p = parseQuick(input.value);
    if (!p) return;
    if (!(p.amount > 0)) { U.toast('Не вижу сумму — например, «такси 450»'); return; }
    var account = p.account || defaultAccount();
    var date = p.date || defaultDate();
    if (p.matched) {
      refocusQuick = true;
      var added = Store.add('transactions', {
        type: p.type, amount: p.amount, category: p.category, sub: p.sub, account: account, to: '', date: date, note: cleanNote(p)
      });
      U.toast('Добавлено: ' + catFull(p.category, p.sub) + ' · ' + U.money(p.amount));
      if (p.type === 'income') offerSave(added);
      if (p.type === 'expense') warnLater(p.category);
    } else {
      txDialog(null, { type: p.type, amount: p.amount, date: date, account: account, note: p.note, learnPhrase: p.note });
      input.value = '';
      var pv = wrap.querySelector('#quick-preview');
      if (pv) pv.innerHTML = QUICK_HINT;
    }
  }

  // ============================================================
  //  Обзор
  // ============================================================
  function overviewHtml() {
    var key = state.month;
    var list = inMonth(allTx(), key);
    var inc = total(list, 'income');
    var exp = total(list, 'expense');
    var b = getBudget();
    return (
      freshnessHtml() +
      (key === currentMonth() ? saveCardHtml() : '') +
      heroHtml(key, list, exp, b) +
      (key === currentMonth() ? weeklyCardHtml() + insightsHtml() : '') +
      '<div class="grid grid--3">' +
        tile('Доходы', U.money(inc)) +
        tile('Расходы', U.money(exp)) +
        tile('Итог месяца', U.signed(inc - exp)) +
      '</div>' +
      accountsHtml() +
      forecastHtml(key, list, b) +
      (key === currentMonth() ? cashbackHtml() : '') +
      '<div class="charts">' +
        structureCard(list) +
        (key === currentMonth() ? capitalHtml() : '') +
        catsCard(list, b) +
        paceCard(key, list, b) +
        dailyCard(key, list) +
        monthlyCard(key) +
      '</div>'
    );
  }

  function tile(label, value, hint) {
    return '<div class="card tile"><div class="tile-label">' + label + '</div><div class="tile-value">' + value + '</div>' +
      (hint ? '<div class="tile-hint">' + hint + '</div>' : '') + '</div>';
  }

  // ---------- Прогноз до конца месяца ----------
  // Средний расход в день (без регулярных платежей) × оставшиеся дни + ещё не внесённые регулярные платежи.
  function forecastHtml(key, list, b) {
    if (key !== currentMonth()) return '';
    var n = U.daysIn(key), day = new Date().getDate();
    var spent = budgetSpent(list);
    var recSpent = U.round2(list.reduce(function (s, t) { return s + (t.type === 'expense' && t.recurringId && !isPiggy(t.account) ? t.amount : 0); }, 0));
    var perDay = (spent - recSpent) / day;
    var todayStr = U.today();
    var recLeft = 0;
    Store.list('recurring').forEach(function (r) {
      var paid = allTx().some(function (t) { return t.recurringId === r.id && U.monthKey(t.date) === key; });
      if (!paid && recurringDate(r, key) >= todayStr) recLeft += r.amount;
    });
    var projected = U.round2(spent + perDay * (n - day) + recLeft);
    var pay = window.Tabs.work && Tabs.work.payStatus ? Tabs.work.payStatus(key) : { waiting: 0 };
    var projIncome = U.round2(total(list, 'income') + pay.waiting);
    var net = U.round2(projIncome - projected);

    var budgetLine = '';
    if (b.total) {
      var left = b.total - spent - recLeft;
      if (left <= 0) budgetLine = '<div class="status status--critical">' + I.alert + 'Бюджет уже исчерпан с учётом регулярных платежей</div>';
      else if (perDay > 0 && left / perDay < n - day) {
        var end = new Date(); end.setDate(end.getDate() + Math.floor(left / perDay));
        budgetLine = '<div class="status status--critical">' + I.alert + 'При таком темпе бюджет закончится ~' + end.getDate() + ' ' + U.monthGen(U.iso(end)) + '</div>';
      } else {
        budgetLine = '<div class="status status--good">' + I.check + 'Бюджета хватит, останется ≈ ' + U.money(Math.max(0, Math.round(b.total - projected))) + '</div>';
      }
    }
    return (
      '<section class="card forecast">' +
        '<div class="card-head"><h2>Прогноз до конца месяца</h2><span class="muted">ещё ' + (n - day) + ' ' + U.plural(n - day, 'день', 'дня', 'дней') + '</span></div>' +
        '<div class="forecast-grid">' +
          '<div><span class="tile-label">Расходы составят</span><span class="forecast-value">≈ ' + U.money(Math.round(projected)) + '</span></div>' +
          '<div><span class="tile-label">Доходы составят</span><span class="forecast-value">≈ ' + U.money(Math.round(projIncome)) + '</span></div>' +
          '<div><span class="tile-label">Итог месяца</span><span class="forecast-value ' + (net >= 0 ? 'is-good' : 'is-bad') + '">≈ ' + U.signed(Math.round(net)) + '</span></div>' +
        '</div>' +
        '<p class="field-hint">В среднем ' + U.money(Math.round(perDay)) + ' в день без регулярных платежей' +
          (recLeft ? ' · ещё регулярных ' + U.money(recLeft) : '') + (pay.waiting ? ' · ожидается зарплаты ' + U.money(pay.waiting) : '') +
          (day < 4 ? ' · прогноз уточнится через несколько дней' : '') + '</p>' +
        budgetLine +
      '</section>'
    );
  }

  // ---------- Итоги месяца ----------
  function reportHtml() {
    var key = state.month, prevKey = U.addMonths(key, -1);
    var txs = allTx();
    var list = inMonth(txs, key), prev = inMonth(txs, prevKey);
    var inc = total(list, 'income'), exp = total(list, 'expense');
    var pInc = total(prev, 'income'), pExp = total(prev, 'expense');
    if (!list.length) {
      return U.empty({ emoji: '📊', title: 'За ' + U.monthTitle(key).toLowerCase() + ' пока нет записей', text: 'Итоги появятся, когда в месяце будут траты и доходы. Можно загрузить выписку банка.', action: 'Загрузить выписку', attr: 'data-action="import"' });
    }
    var saved = U.round2(list.reduce(function (s, t) {
      if (t.type !== 'transfer') return s;
      if (isPiggy(t.to) && !isPiggy(t.account)) return s + t.amount;
      if (isPiggy(t.account) && !isPiggy(t.to)) return s - t.amount;
      return s;
    }, 0));
    var rate = inc > 0 ? Math.round((inc - exp) / inc * 100) : null;
    // Сравниваем с прошлым месяцем, только если он загружен целиком (есть записи с первых дней).
    var prevFull = prev.some(function (t) { return +t.date.slice(8, 10) <= 5; });
    function delta(cur, was, lowerIsGood) {
      if (!was || !prevFull) return '';
      var d = Math.round((cur - was) / was * 100);
      if (!d) return '<span class="delta">как в прошлом месяце</span>';
      var good = lowerIsGood ? d < 0 : d > 0;
      return '<span class="delta ' + (good ? 'delta--good' : 'delta--bad') + '">' + (d > 0 ? '+' : '−') + Math.abs(d) + '% к ' + U.monthDat(prevKey) + '</span>';
    }

    var tiles =
      '<div class="grid grid--2 report-tiles">' +
        tile('Доходы', U.money(inc), delta(inc, pInc, false)) +
        tile('Расходы', U.money(exp), delta(exp, pExp, true)) +
        tile('Итог месяца', U.signed(inc - exp), rate === null ? '' : rate >= 0 ? 'сохранено ' + rate + '% доходов' : 'расходы больше доходов на ' + Math.abs(rate) + '%') +
        (saved >= 0
          ? tile('Отложено в копилки', U.money(saved), saved > 0 ? 'молодец! 🐷' : 'в этом месяце не откладывал')
          : tile('Взято из копилок', U.money(-saved), 'больше, чем отложено')) +
      '</div>';

    // Категории с изменением к прошлому месяцу
    function byGroup(l) { var m = {}; l.forEach(function (t) { if (t.type === 'expense') m[t.category] = (m[t.category] || 0) + t.amount; }); return m; }
    var cur = byGroup(list), was = byGroup(prev);
    var cats = Object.keys(cur).sort(function (a, b) { return cur[b] - cur[a]; }).slice(0, 6).map(function (id) {
      return '<li class="rep-click' + (state.trendCat === id ? ' is-on' : '') + '" data-action="trend" data-id="' + esc(id) + '" data-tip="Показать тренд за полгода">' + catIcon(id) + '<span class="rep-name">' + esc(groupName(id)) + '</span><span class="rep-val">' + U.money(cur[id]) + '</span>' + delta(cur[id], was[id], true) + '</li>';
    }).join('');

    // Где тратил чаще всего (по комментарию / названию магазина)
    var places = {};
    list.forEach(function (t) {
      // Места — это магазины и сервисы: переводы людям и общие строки вроде «трат наличными» не считаем.
      if (t.type !== 'expense' || !t.note || t.category === 'people' || /перевод|без подробностей/i.test(t.note)) return;
      var k = MD.norm(t.note);
      var p = places[k] || (places[k] = { name: t.note, sum: 0, n: 0, cat: t.category });
      p.sum += t.amount; p.n++;
    });
    var top = Object.keys(places).map(function (k) { return places[k]; }).sort(function (a, b) { return b.sum - a.sum; }).slice(0, 5)
      .map(function (p) {
        return '<li>' + catIcon(p.cat) + '<span class="rep-name">' + esc(p.name) + '</span><span class="rep-val">' + U.money(p.sum) + '</span><span class="delta">' + p.n + ' ' + U.plural(p.n, 'раз', 'раза', 'раз') + '</span></li>';
      }).join('');

    var biggest = list.filter(function (t) { return t.type === 'expense'; }).sort(function (a, b) { return b.amount - a.amount; }).slice(0, 5)
      .map(function (t) {
        return '<li>' + catIcon(t.category) + '<span class="rep-name">' + esc(t.note || txTitle(t)) + '</span><span class="rep-val">' + U.money(t.amount) + '</span><span class="delta">' + U.dayShort(t.date).split(',')[0] + '</span></li>';
      }).join('');

    // Факты
    var n = key === currentMonth() ? new Date().getDate() : U.daysIn(key);
    var daily = dailySums(key, list, false).slice(0, n);
    var zero = daily.filter(function (v) { return v === 0; }).length;
    var maxDay = daily.indexOf(Math.max.apply(null, daily));
    var wd = [0, 0, 0, 0, 0, 0, 0];
    list.forEach(function (t) { if (t.type === 'expense') wd[U.toDate(t.date).getDay()] += t.amount; });
    var WDN = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
    var facts = [
      '📅 В среднем ' + U.money(Math.round(exp / n)) + ' в день',
      '🌱 Дней без трат: ' + zero + ' из ' + n,
      daily[maxDay] ? '🔥 Самый дорогой день — ' + (maxDay + 1) + ' ' + U.monthGen(key) + ' (' + U.money(daily[maxDay]) + ')' : '',
      exp ? '🛍️ Чаще всего тратишь в ' + WDN[wd.indexOf(Math.max.apply(null, wd))] : ''
    ].filter(Boolean).map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');

    return (
      tiles +
      '<div class="charts">' +
        trendCard() +
        '<section class="card"><div class="card-head"><h2>Категории</h2><span class="muted">' + (prevFull ? 'в сравнении с прошлым месяцем · ' : '') + 'нажми — тренд</span></div><ul class="rep-list">' + cats + '</ul></section>' +
        '<section class="card"><div class="card-head"><h2>Любимые места</h2></div>' + (top ? '<ul class="rep-list">' + top + '</ul>' : '<p class="chart-empty">Нет комментариев к тратам</p>') + '</section>' +
        '<section class="card"><div class="card-head"><h2>Самые крупные траты</h2></div><ul class="rep-list">' + biggest + '</ul></section>' +
        '<section class="card"><div class="card-head"><h2>Интересное</h2></div><ul class="facts">' + facts + '</ul></section>' +
      '</div>'
    );
  }

  // ---------- Поиск подписок ----------
  // Одинаковые траты (по комментарию) в разных месяцах с похожей суммой — вероятно, регулярный платёж.
  function subscriptionCandidates() {
    var since = U.addMonths(currentMonth(), -4) + '-01';
    var hidden = Store.getSetting('money.subsHidden', []);
    var recNames = Store.list('recurring').map(function (r) { return MD.norm(r.name); });
    var groups = {};
    allTx().forEach(function (t) {
      if (t.type !== 'expense' || t.recurringId || !t.note || t.date < since) return;
      var k = MD.norm(t.note);
      (groups[k] = groups[k] || []).push(t);
    });
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      var months = {};
      g.forEach(function (t) { months[U.monthKey(t.date)] = true; });
      if (Object.keys(months).length < 2 || g.length > Object.keys(months).length + 1) return null;
      var amounts = g.map(function (t) { return t.amount; }).sort(function (a, b) { return a - b; });
      if (amounts[amounts.length - 1] > amounts[0] * 1.25) return null;
      if (hidden.indexOf(k) !== -1 || recNames.indexOf(k) !== -1) return null;
      var days = g.map(function (t) { return +t.date.slice(8, 10); }).sort(function (a, b) { return a - b; });
      var last = g[g.length - 1];
      return { key: k, name: last.note, amount: amounts[Math.floor(amounts.length / 2)], day: days[Math.floor(days.length / 2)],
        category: last.category, sub: last.sub || '', account: last.account, count: g.length };
    }).filter(Boolean).sort(function (a, b) { return b.amount - a.amount; });
  }

  function heroHtml(key, list, exp, b) {
    if (!b.total) {
      return (
        '<section class="card hero">' +
          '<div class="hero-label">Потрачено за ' + U.monthTitle(key).toLowerCase() + '</div>' +
          '<div class="hero-value">' + U.money(exp) + '</div>' +
          '<button type="button" class="link-btn" data-action="goto-settings">Задать бюджет на месяц →</button>' +
        '</section>'
      );
    }
    var spent = budgetSpent(list);
    var fromPiggy = U.round2(exp - spent);
    var left = U.round2(b.total - spent);
    var pct = spent / b.total;
    var level = pct > 1 ? 'over' : pct > 0.9 ? 'warn' : 'ok';
    var n = U.daysIn(key);
    var cur = currentMonth();
    var daysLeft = key === cur ? n - new Date().getDate() + 1 : key > cur ? n : 0;
    var perDay = daysLeft && left > 0 ? left / daysLeft : 0;

    var meta = '<div class="hero-meta">Потрачено ' + U.money(spent) + ' из ' + U.money(b.total) + ' · ' + Math.round(pct * 100) + '%</div>';
    if (level === 'over') {
      meta += '<div class="status status--critical">' + I.alert + 'Бюджет превышен на ' + U.money(-left) + '</div>';
    } else if (daysLeft) {
      meta += '<div class="hero-meta">Можно тратить ≈ ' + U.money(Math.floor(perDay)) + ' в день · ещё ' +
        daysLeft + ' ' + U.plural(daysLeft, 'день', 'дня', 'дней') + '</div>';
    }
    if (fromPiggy > 0) meta += '<div class="hero-meta muted">Траты из копилок (' + U.money(fromPiggy) + ') в бюджет не входят</div>';
    return (
      '<section class="card hero"><div class="ring-row">' +
        U.ring(pct, { size: 92, stroke: 10, cls: level === 'over' ? 'is-bad' : level === 'warn' ? 'is-warn' : '' }) +
        '<div class="ring-info">' +
          '<div class="hero-label">' + (level === 'over' ? 'Перерасход' : 'Осталось в бюджете') + '</div>' +
          '<div class="hero-value">' + U.money(Math.abs(left)) + '</div>' +
          meta +
        '</div>' +
      '</div></section>'
    );
  }

  function accountsHtml() {
    var bal = balances();
    function item(a, piggy) {
      return '<div class="acc">' + (piggy ? I.piggy : '') + '<span class="acc-name">' + esc(a.name) + '</span><span class="acc-val">' + U.money(bal[a.id] || 0) + '</span></div>';
    }
    return (
      '<div class="card accounts"><span class="accounts-title">Сейчас на счетах</span>' +
        regularAccounts().map(function (a) { return item(a, false); }).join('') +
        piggies().map(function (a) { return item(a, true); }).join('') +
      '</div>'
    );
  }

  function chartCard(title, sub, inner, extra) {
    return (
      '<section class="card chart-card">' +
        '<div class="chart-head"><h2>' + title + '</h2>' + (sub ? '<span class="chart-sub">' + sub + '</span>' : '') + '</div>' +
        inner + (extra || '') +
      '</section>'
    );
  }

  function table(head, rows) {
    if (!rows.length) return '';
    return (
      '<details class="chart-table"><summary>Таблица</summary><div class="table-scroll"><table>' +
        '<thead><tr>' + head.map(function (h, i) { return '<th' + (i ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead>' +
        '<tbody>' + rows.map(function (r) {
          return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody>' +
      '</table></div></details>'
    );
  }

  // --- На что уходят деньги: группы, по нажатию — подкатегории ---
  function catsCard(list, b) {
    var groups = {};
    list.forEach(function (t) {
      if (t.type !== 'expense') return;
      var g = groups[t.category] || (groups[t.category] = { id: t.category, value: 0, subs: {} });
      g.value += t.amount;
      var sk = t.sub || '';
      g.subs[sk] = (g.subs[sk] || 0) + t.amount;
    });
    var exp = total(list, 'expense');
    var rows = Object.keys(groups).map(function (id) {
      var g = groups[id];
      return { id: id, name: groupName(id), value: U.round2(g.value), limit: Number(b.limits[id]) || 0, subs: g.subs };
    }).sort(function (a, c) { return c.value - a.value; });

    if (!rows.length) return chartCard('На что уходят деньги', 'Расходы по категориям', '<p class="chart-empty">Пока нет расходов за этот месяц</p>');

    var max = rows[0].value;
    var html = '<div class="cat-rows">' + rows.map(function (r) {
      var share = Math.round(r.value / exp * 100);
      var tipText = r.name + '\n' + U.money(r.value) + ' · ' + share + '% расходов' + (r.limit ? '\nЛимит ' + U.money(r.limit) : '');
      var over = r.limit && r.value > r.limit;
      var subKeys = Object.keys(r.subs).sort(function (a, c) { return r.subs[c] - r.subs[a]; });
      var expandable = subKeys.length > 1 || (subKeys.length === 1 && subKeys[0] !== '');
      var top =
        '<div class="cat-top"><span class="cat-name">' + (expandable ? I.chevron : '') + catIcon(r.id) + esc(r.name) + '</span>' +
          '<span class="cat-val">' + U.money(r.value) + (r.limit ? '<span class="muted"> из ' + U.money(r.limit) + '</span>' : '') + '</span></div>' +
        '<div class="cat-bar"><span style="width:' + Math.max(1, r.value / max * 100).toFixed(1) + '%"></span></div>' +
        (over ? '<div class="status status--critical">' + I.alert + 'Лимит превышен на ' + U.money(r.value - r.limit) + '</div>' : '');
      if (!expandable) return '<div class="cat-row" data-tip="' + esc(tipText) + '">' + top + '</div>';
      var subs = subKeys.map(function (k) {
        return '<li><span>' + esc(k ? subName(k) || 'Удалённая подкатегория' : 'Без уточнения') + '</span><span>' + U.money(r.subs[k]) + '</span></li>';
      }).join('');
      return '<details class="cat-row"><summary data-tip="' + esc(tipText) + '">' + top + '</summary><ul class="cat-subs">' + subs + '</ul></details>';
    }).join('') + '</div>';

    var t = table(['Категория', 'Сумма', 'Доля', 'Лимит'], rows.map(function (r) {
      return [esc(r.name), U.money(r.value), Math.round(r.value / exp * 100) + '%', r.limit ? U.money(r.limit) : '—'];
    }));
    return chartCard('На что уходят деньги', 'Нажми на строку, чтобы раскрыть', html, t);
  }

  function dailySums(key, list, budgetOnly) {
    var n = U.daysIn(key);
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(0);
    list.forEach(function (t) {
      if (t.type !== 'expense' || (budgetOnly && isPiggy(t.account))) return;
      var d = +t.date.slice(8, 10);
      arr[d - 1] = U.round2(arr[d - 1] + t.amount);
    });
    return arr;
  }

  // --- Расход бюджета: накопленные траты против ровного темпа ---
  function paceCard(key, list, b) {
    var title = 'Расход бюджета';
    if (!b.total) {
      return chartCard(title, '', '<p class="chart-empty">Задай бюджет в <button type="button" class="link-btn" data-action="goto-settings">Настройках</button>, чтобы видеть, укладываешься ли ты в него</p>');
    }
    var n = U.daysIn(key);
    var cur = currentMonth();
    var last = key === cur ? new Date().getDate() : key < cur ? n : 0;
    var daily = dailySums(key, list, true);
    var cum = [0];
    for (var d = 1; d <= last; d++) cum.push(U.round2(cum[d - 1] + daily[d - 1]));
    var ideal = function (d) { return U.round2(b.total * d / n); };

    charts.pace = {
      n: n, actual: cum, budget: b.total, label: 'Накопленные расходы и ровный темп бюджета',
      endLabel: U.money(cum[last] || 0),
      xTicks: [1, 10, 20, n],
      tip: function (d) {
        var date = U.dayShort(key + '-' + U.pad(d));
        return d <= last
          ? date + '\nПотрачено с начала месяца: ' + U.money(cum[d]) + '\nПо ровному темпу: ' + U.money(ideal(d))
          : date + '\nПо ровному темпу: ' + U.money(ideal(d));
      }
    };
    var legend =
      '<div class="legend">' +
        '<span><i class="key key--line"></i>Потрачено</span>' +
        '<span><i class="key key--ref"></i>Ровный темп до ' + U.money(b.total) + '</span>' +
      '</div>';
    var rows = [];
    for (d = 1; d <= last; d++) rows.push([U.dayShort(key + '-' + U.pad(d)), U.money(daily[d - 1]), U.money(cum[d]), U.money(ideal(d))]);
    var body = last ? legend + '<div class="chart" data-chart="pace"></div>' : '<p class="chart-empty">Этот месяц ещё не начался</p>';
    return chartCard(title, 'Накоплено с начала месяца', body, table(['День', 'За день', 'Накоплено', 'По плану'], rows));
  }

  // --- Траты по дням ---
  function dailyCard(key, list) {
    var daily = dailySums(key, list, false);
    var n = daily.length;
    if (!daily.some(function (v) { return v > 0; })) {
      return chartCard('Траты по дням', '', '<p class="chart-empty">Пока нет расходов за этот месяц</p>');
    }
    charts.daily = {
      values: daily, labels: daily.map(function (v, i) { return String(i + 1); }), label: 'Расходы по дням месяца',
      xTicks: [0, 4, 9, 14, 19, 24, n - 1],
      tips: daily.map(function (v, i) { return U.dayShort(key + '-' + U.pad(i + 1)) + '\n' + (v ? U.money(v) : 'Без расходов'); })
    };
    var rows = [];
    daily.forEach(function (v, i) { if (v) rows.push([U.dayShort(key + '-' + U.pad(i + 1)), U.money(v)]); });
    return chartCard('Траты по дням', U.monthTitle(key), '<div class="chart" data-chart="daily"></div>', table(['День', 'Расходы'], rows));
  }

  // --- Доходы и расходы за 6 месяцев ---
  function monthlyCard(key) {
    var txs = allTx();
    var keys = [];
    for (var i = 5; i >= 0; i--) keys.push(U.addMonths(key, -i));
    var inc = [], exp = [];
    keys.forEach(function (k) {
      var l = inMonth(txs, k);
      inc.push(total(l, 'income'));
      exp.push(total(l, 'expense'));
    });
    charts.monthly = {
      labels: keys.map(U.monthShort),
      label: 'Доходы и расходы по месяцам',
      series: [{ name: 'Доходы', cls: 'bar--s1', values: inc }, { name: 'Расходы', cls: 'bar--s2', values: exp }],
      tips: keys.map(function (k, j) {
        return U.monthTitle(k) + '\nДоходы: ' + U.money(inc[j]) + '\nРасходы: ' + U.money(exp[j]) + '\nИтог: ' + U.signed(inc[j] - exp[j]);
      })
    };
    var legend = '<div class="legend"><span><i class="key key--s1"></i>Доходы</span><span><i class="key key--s2"></i>Расходы</span></div>';
    var rows = keys.map(function (k, j) { return [U.monthTitle(k), U.money(inc[j]), U.money(exp[j]), U.signed(inc[j] - exp[j])]; });
    return chartCard('Доходы и расходы', 'Последние 6 месяцев', legend + '<div class="chart" data-chart="monthly"></div>',
      table(['Месяц', 'Доходы', 'Расходы', 'Итог'], rows));
  }

  function drawCharts() {
    if (!wrap) return;
    wrap.querySelectorAll('[data-chart]').forEach(function (el) {
      var spec = charts[el.dataset.chart];
      if (!spec) return;
      if (el.dataset.chart === 'pace') C.pace(el, spec);
      else if (el.dataset.chart === 'daily') C.columns(el, spec);
      else if (el.dataset.chart === 'monthly') C.grouped(el, spec);
      else if (el.dataset.chart === 'donut') C.donut(el, spec);
      else if (el.dataset.chart === 'trend' || el.dataset.chart === 'capital') C.columns(el, spec);
    });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (wrap && wrap.isConnected && wrap.clientWidth !== lastWidth) {
        lastWidth = wrap.clientWidth;
        drawCharts();
      }
    }, 150);
  });

  // ============================================================
  //  История
  // ============================================================
  function historyHtml() {
    var c = cats();
    function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }
    var catOpts = opt('', 'Все категории', !state.cat) +
      '<optgroup label="Расходы">' + c.expense.map(function (x) { return opt(x.id, x.name, state.cat === x.id); }).join('') + '</optgroup>' +
      '<optgroup label="Доходы">' + c.income.map(function (x) { return opt(x.id, x.name, state.cat === x.id); }).join('') + '</optgroup>';
    var typeOpts = opt('', 'Все записи', !state.type) + opt('expense', 'Расходы', state.type === 'expense') +
      opt('income', 'Доходы', state.type === 'income') + opt('transfer', 'Переводы', state.type === 'transfer');

    return (
      '<div class="filters">' +
        '<label class="search">' + I.search + '<input type="search" data-role="q" placeholder="Поиск по комментарию, категории, счёту" value="' + esc(state.q) + '" aria-label="Поиск"></label>' +
        '<select data-role="cat" aria-label="Категория">' + catOpts + '</select>' +
        '<select data-role="type" aria-label="Тип записи">' + typeOpts + '</select>' +
        '<label class="check"><input type="checkbox" data-role="all"' + (state.all ? ' checked' : '') + '> Все месяцы</label>' +
      '</div>' +
      '<div class="history-actions"><button type="button" class="btn btn-ghost" data-action="import">' + I.upload + 'Импорт выписки Т-Банка</button></div>' +
      '<div id="money-list">' + listHtml() + '</div>'
    );
  }

  function txTitle(t) {
    if (t.type === 'transfer') {
      if (isPiggy(t.to)) return 'В копилку';
      if (isPiggy(t.account)) return 'Из копилки';
      return 'Перевод';
    }
    return subName(t.sub) || groupName(t.category);
  }

  function filtered() {
    var q = MD.norm(state.q);
    return allTx().filter(function (t) {
      if (!state.all && U.monthKey(t.date) !== state.month) return false;
      if (state.type && t.type !== state.type) return false;
      if (state.cat && t.category !== state.cat) return false;
      if (q) {
        var hay = MD.norm([t.note, txTitle(t), t.type === 'transfer' ? '' : groupName(t.category), accName(t.account), t.to ? accName(t.to) : ''].join(' '));
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      return a.date === b.date ? (b.createdAt || '').localeCompare(a.createdAt || '') : b.date.localeCompare(a.date);
    });
  }

  function listHtml() {
    var list = filtered();
    if (!list.length) {
      var anyFilter = state.q || state.cat || state.type;
      return anyFilter
        ? U.empty({ emoji: '🔍', title: 'Ничего не найдено', text: 'Попробуй изменить поиск или включить «Все месяцы».' })
        : U.empty({ emoji: '🧾', title: 'За ' + U.monthTitle(state.month).toLowerCase() + ' пока нет записей',
            text: 'Добавь трату быстрой строкой («такси 450») или загрузи выписку банка.', action: 'Загрузить выписку', attr: 'data-action="import"' });
    }
    var groups = [];
    list.forEach(function (t) {
      var g = groups[groups.length - 1];
      if (!g || g.date !== t.date) groups.push(g = { date: t.date, items: [] });
      g.items.push(t);
    });
    var summary = '<p class="list-summary">' + list.length + ' ' + U.plural(list.length, 'запись', 'записи', 'записей') +
      ' · расходы ' + U.money(total(list, 'expense')) + ' · доходы ' + U.money(total(list, 'income')) + '</p>';

    return summary + groups.map(function (g) {
      var dayExp = total(g.items, 'expense');
      return (
        '<section class="day">' +
          '<div class="day-head"><span>' + U.dayLabel(g.date) + '</span>' + (dayExp ? '<span>−' + U.money(dayExp) + '</span>' : '') + '</div>' +
          '<ul class="tx-list card">' + g.items.map(txItem).join('') + '</ul>' +
        '</section>'
      );
    }).join('');
  }

  function txItem(t) {
    var parts = [];
    if (t.type === 'transfer') parts.push(accName(t.account) + ' → ' + accName(t.to));
    else {
      if (t.sub) parts.push(groupName(t.category));
      parts.push(accName(t.account));
    }
    if (t.note) parts.unshift(t.note);
    var amt = t.type === 'expense' ? '−' + U.money(t.amount) : t.type === 'income' ? '+' + U.money(t.amount) : U.money(t.amount);
    var ico = t.type === 'transfer' ? catIcon('', isPiggy(t.to) || isPiggy(t.account) ? 'piggy' : 'transfer') : catIcon(t.category);
    return (
      '<li class="swipe-item" data-swipe="' + t.id + '"><div class="swipe-body"><button type="button" class="tx" data-action="edit-tx" data-id="' + t.id + '">' +
        ico +
        '<span class="tx-main"><span class="tx-title">' + esc(txTitle(t)) + '</span><span class="tx-sub">' + esc(parts.join(' · ')) + '</span></span>' +
        '<span class="tx-amt tx-amt--' + t.type + '">' + amt + '</span>' +
      '</button></div></li>'
    );
  }

  // ============================================================
  //  Планы: регулярные платежи и копилки
  // ============================================================
  function recurringDate(r, key) {
    return key + '-' + U.pad(Math.min(Number(r.day) || 1, U.daysIn(key)));
  }

  function plansHtml() {
    var key = state.month;
    var txs = allTx();
    var rec = Store.list('recurring').sort(function (a, b) { return a.day - b.day; });
    var todayStr = U.today();

    var recRows = rec.map(function (r) {
      var paid = txs.some(function (t) { return t.recurringId === r.id && U.monthKey(t.date) === key; });
      var due = recurringDate(r, key);
      var when = '';
      if (!paid && key === currentMonth()) {
        var diff = Math.round((U.toDate(due) - U.toDate(todayStr)) / 864e5);
        when = diff === 0 ? ' · сегодня' : diff > 0 ? ' · через ' + diff + ' ' + U.plural(diff, 'день', 'дня', 'дней') : ' · срок прошёл';
      }
      return (
        '<li class="plan-row">' +
          '<button type="button" class="plan-main" data-action="edit-rec" data-id="' + r.id + '">' +
            '<span class="tx-title">' + esc(r.name) + '</span>' +
            '<span class="tx-sub">' + r.day + '-го числа · ' + esc(catFull(r.category, r.sub)) + ' · ' + esc(accName(r.account)) + when + '</span>' +
          '</button>' +
          '<span class="plan-amt">' + U.money(r.amount) + '</span>' +
          (paid ? '<span class="status status--good">' + I.check + 'Внесено</span>'
                : '<button type="button" class="btn btn-small" data-action="pay-rec" data-id="' + r.id + '">Внести</button>') +
        '</li>'
      );
    }).join('');
    var recTotal = rec.reduce(function (s, r) { return s + r.amount; }, 0);

    var subs = subscriptionCandidates();
    var subsCard = subs.length
      ? '<section class="card subs-card"><div class="card-head"><h2>🔎 Похоже на регулярные платежи</h2></div>' +
          '<ul class="plan-list">' + subs.map(function (s) {
            return '<li class="plan-row">' + catIcon(s.category) +
              '<span class="plan-main"><span class="tx-title">' + esc(s.name) + '</span><span class="tx-sub">≈ ' + U.money(s.amount) + ' · около ' + s.day + '-го · ' +
                esc(catFull(s.category, s.sub)) + ' · ' + s.count + ' ' + U.plural(s.count, 'раз', 'раза', 'раз') + '</span></span>' +
              '<button type="button" class="btn btn-small btn-primary" data-action="sub-add" data-key="' + esc(s.key) + '">Сделать регулярным</button>' +
              '<button type="button" class="icon-btn" data-action="sub-hide" data-key="' + esc(s.key) + '" aria-label="Скрыть" data-tip="Это не подписка">×</button>' +
            '</li>';
          }).join('') + '</ul></section>'
      : '';

    var recCard =
      subsCard +
      '<section class="card plan-card">' +
        '<div class="card-head"><h2>Регулярные платежи</h2><button type="button" class="btn btn-ghost" data-action="add-rec">' + I.plus + 'Добавить</button></div>' +
        (rec.length
          ? '<ul class="plan-list">' + recRows + '</ul><p class="card-foot">Всего в месяц: ' + U.money(recTotal) + '</p>'
          : '<p class="chart-empty">Добавь подписки, аренду, связь — и вноси их в расходы одной кнопкой.</p>') +
      '</section>';

    var bal = balances();
    var piggyCards = piggies().map(function (p) {
      var saved = bal[p.id] || 0;
      var target = Number(p.target) || 0;
      var pct = target ? Math.max(0, Math.min(1, saved / target)) : 0;
      var monthIn = U.round2(inMonth(txs, key).reduce(function (s, t) {
        return s + (t.type === 'transfer' && t.to === p.id ? t.amount : 0);
      }, 0));
      return (
        '<div class="card goal">' +
          '<button type="button" class="goal-name" data-action="edit-piggy" data-id="' + p.id + '">' + I.piggy + esc(p.name) + '</button>' +
          '<div class="ring-row">' + (target ? U.ring(pct, { size: 64, stroke: 7, cls: saved >= target ? 'is-good' : '' }) : '') +
            '<div class="goal-nums"><span class="goal-saved">' + U.money(saved) + '</span>' + (target ? '<span class="muted"> из ' + U.money(target) + '</span>' : '') + '</div></div>' +
          '<div class="goal-meta muted">' +
            (target ? (saved >= target ? 'Цель достигнута 🎉' : Math.round(pct * 100) + '% · осталось ' + U.money(target - saved)) : 'Без суммы цели') +
            ' · за ' + U.monthTitle(key).split(' ')[0].toLowerCase() + ' отложено ' + U.money(monthIn) +
          '</div>' +
          piggyPlan(p, saved) +
          interestLine(p, saved) +
          '<div class="goal-foot">' +
            '<button type="button" class="btn btn-small btn-primary" data-action="piggy-in" data-id="' + p.id + '">Пополнить</button>' +
            '<button type="button" class="btn btn-small" data-action="piggy-out" data-id="' + p.id + '"' + (saved > 0 ? '' : ' disabled') + '>Снять</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var piggyBlock =
      '<div class="section-row"><h2 class="section-title">Копилки</h2><button type="button" class="btn btn-ghost" data-action="add-piggy">' + I.plus + 'Новая копилка</button></div>' +
      '<p class="section-hint">Пополнение — это перевод с карты или из наличных: такие деньги не считаются расходом. ' +
        'Тратить в поездке можно прямо из копилки — выбери её в поле «Со счёта». Такие траты не входят в месячный бюджет.</p>' +
      (piggyCards ? '<div class="goals">' + piggyCards + '</div>' : '<div class="card empty-note">Копилок пока нет.</div>');

    return recCard + piggyBlock + tripsHtml() + wishlistHtml();
  }

  // План копилки: сколько откладывать, чтобы успеть к дате.
  function piggyPlan(p, saved) {
    var target = Number(p.target) || 0;
    if (!target) return '';
    if (saved >= target) return '';
    if (!p.targetDate) return '<p class="piggy-plan muted">Укажи дату цели — посчитаю, сколько откладывать в месяц.</p>';
    var days = Math.round((U.toDate(p.targetDate) - U.toDate(U.today())) / 864e5);
    var d = U.toDate(p.targetDate);
    var when = d.getDate() + ' ' + U.monthGen(p.targetDate) + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
    if (days <= 0) return '<p class="piggy-plan is-late">Дата цели (' + when + ') уже прошла — можно перенести её.</p>';
    var need = target - saved;
    var months = Math.max(1, days / 30.44), weeks = Math.max(1, days / 7);
    return '<p class="piggy-plan">🎯 Чтобы накопить к ' + when + ', откладывай ≈ <b>' + U.money(Math.ceil(need / months / 10) * 10) + '</b> в месяц' +
      (days > 14 ? ' (≈ ' + U.money(Math.ceil(need / weeks / 10) * 10) + ' в неделю)' : '') + '</p>';
  }

  // ---------- Вишлист ----------
  var PRIORITY = { '1': '🔥 очень хочу', '2': '👍 хочу', '3': '💭 когда-нибудь' };

  function wishlistHtml() {
    var items = Store.list('wishlist');
    var open = items.filter(function (w) { return !w.bought; })
      .sort(function (a, b) { return (a.priority || '2').localeCompare(b.priority || '2') || a.price - b.price; });
    var bought = items.length - open.length;
    var main = regularAccounts()[0];
    var mainBal = main ? balances()[main.id] || 0 : 0;
    var totalW = open.reduce(function (s, w) { return s + (Number(w.price) || 0); }, 0);
    var cards = open.map(function (w) {
      var price = Number(w.price) || 0;
      var afford = price && price <= mainBal;
      return (
        '<div class="card wish">' +
          '<div class="wish-head"><button type="button" class="goal-name" data-action="edit-wish" data-id="' + w.id + '">' + esc(w.title) + '</button>' +
            (w.url ? '<a class="icon-btn" href="' + esc(w.url) + '" target="_blank" rel="noopener" aria-label="Открыть ссылку" data-tip="Открыть ссылку">' + I.link + '</a>' : '') + '</div>' +
          '<div class="goal-nums"><span class="goal-saved">' + (price ? U.money(price) : '—') + '</span></div>' +
          '<div class="wish-meta"><span class="wish-prio">' + esc(PRIORITY[w.priority || '2']) + '</span>' +
            (price ? (afford ? '<span class="status status--good">' + I.check + 'хватает на «' + esc(main.name) + '»</span>' : '<span class="muted">пока не хватает ' + U.money(price - Math.max(0, mainBal)) + '</span>') : '') + '</div>' +
          '<div class="goal-foot">' +
            '<button type="button" class="btn btn-small" data-action="wish-save" data-id="' + w.id + '">🐷 Копить</button>' +
            '<button type="button" class="btn btn-small btn-primary" data-action="wish-buy" data-id="' + w.id + '">Куплено</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    return (
      '<div class="section-row"><h2 class="section-title">Вишлист' + (open.length ? ' · ' + U.money(totalW) : '') + '</h2>' +
        '<button type="button" class="btn btn-ghost" data-action="add-wish">' + I.plus + 'Желание</button></div>' +
      (open.length ? '<div class="goals">' + cards + '</div>'
        : U.empty({ emoji: '🎁', title: 'Вишлист пуст', text: 'Записывай, что хочется купить, с ценой и ссылкой — дашборд подскажет, хватает ли денег, и поможет накопить.', action: 'Добавить желание', attr: 'data-action="add-wish"' })) +
      (bought ? '<p class="section-hint">Уже куплено: ' + bought + ' 🎉</p>' : '')
    );
  }

  function wishDialog(w) {
    var editing = !!w;
    U.formDialog({
      title: editing ? 'Желание' : 'Новое желание',
      values: editing ? { title: w.title, price: U.moneyInput(w.price || ''), url: w.url || '', priority: w.priority || '2', note: w.note || '' }
        : { title: '', price: '', url: '', priority: '2', note: '' },
      fields: [
        { name: 'title', type: 'text', label: 'Что хочу', placeholder: 'Например, наушники', maxlength: 80, autofocus: !editing },
        { name: 'price', type: 'money', label: 'Цена', half: true },
        { name: 'priority', type: 'select', label: 'Насколько хочу', half: true, options: Object.keys(PRIORITY).map(function (k) { return { value: k, label: PRIORITY[k] }; }) },
        { name: 'url', type: 'text', label: 'Ссылка (необязательно)', placeholder: 'https://…', maxlength: 500 },
        { name: 'note', type: 'text', label: 'Заметка', maxlength: 200 }
      ],
      onSubmit: function (v) {
        var title = (v.title || '').trim();
        if (!title) return 'Напиши, что хочется';
        var price = v.price ? U.parseMoney(v.price) : 0;
        if (isNaN(price)) return 'Проверь цену';
        var url = (v.url || '').trim();
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        var rec = { title: title, price: price, priority: v.priority, url: url, note: (v.note || '').trim() };
        if (editing) Store.update('wishlist', w.id, rec); else Store.add('wishlist', Object.assign(rec, { bought: false }));
      },
      onDelete: editing ? function () { Store.remove('wishlist', w.id); } : null
    });
  }

  // ---------- Долги ----------
  // Каждый человек — отдельный «счёт-долг». Плюс — он должен тебе, минус — ты ему.
  // Деньги проходят переводами, поэтому долги не попадают в расходы и доходы.
  function debtsHtml() {
    var bal = balances();
    var people = debtors();
    var owed = 0, iOwe = 0;
    people.forEach(function (p) { var b = bal[p.id] || 0; if (b > 0) owed += b; else iOwe -= b; });
    var txs = allTx();
    var cards = people.slice().sort(function (a, b) { return Math.abs(bal[b.id] || 0) - Math.abs(bal[a.id] || 0); }).map(function (p) {
      var b = U.round2(bal[p.id] || 0);
      var ops = txs.filter(function (t) { return t.type === 'transfer' && (t.account === p.id || t.to === p.id); })
        .sort(function (x, y) { return y.date.localeCompare(x.date); });
      var last = ops[0];
      var age = last ? Math.round((U.toDate(U.today()) - U.toDate(last.date)) / 864e5) : 0;
      var state = b > 0 ? '<span class="debt-amt is-plus">должен тебе ' + U.money(b) + '</span>'
        : b < 0 ? '<span class="debt-amt is-minus">ты должен ' + U.money(-b) + '</span>'
        : '<span class="debt-amt">в расчёте ✓</span>';
      var actions = b > 0
        ? '<button type="button" class="btn btn-small btn-primary" data-action="debt-get" data-id="' + p.id + '">Вернули мне</button><button type="button" class="btn btn-small" data-action="debt-give" data-id="' + p.id + '">Дал ещё</button>'
        : b < 0
          ? '<button type="button" class="btn btn-small btn-primary" data-action="debt-give" data-id="' + p.id + '">Я вернул</button><button type="button" class="btn btn-small" data-action="debt-get" data-id="' + p.id + '">Взял ещё</button>'
          : '<button type="button" class="btn btn-small" data-action="debt-give" data-id="' + p.id + '">Дал в долг</button><button type="button" class="btn btn-small" data-action="debt-get" data-id="' + p.id + '">Взял в долг</button>';
      var hist = ops.slice(0, 4).map(function (t) {
        var gave = t.to === p.id;
        return '<li><span>' + U.dayShort(t.date).split(',')[0] + ' · ' + (gave ? 'ты передал' : 'ты получил') + (t.note ? ' · ' + esc(t.note) : '') + '</span><span>' + (gave ? '−' : '+') + U.money(t.amount) + '</span></li>';
      }).join('');
      return (
        '<div class="card debt' + (b !== 0 && age > 30 ? ' is-old' : '') + '">' +
          '<div class="debt-head"><span class="debt-ava" style="--h:' + ((p.name.charCodeAt(0) * 37) % 360) + '">' + esc(p.name.charAt(0).toUpperCase()) + '</span>' +
            '<button type="button" class="goal-name" data-action="edit-acc" data-id="' + p.id + '">' + esc(p.name) + '</button></div>' +
          state +
          (b !== 0 && age > 30 ? '<div class="status status--critical">' + I.alert + 'висит ' + age + ' ' + U.plural(age, 'день', 'дня', 'дней') + '</div>' : '') +
          (hist ? '<ul class="debt-hist">' + hist + '</ul>' : '') +
          '<div class="goal-foot">' + actions + '</div>' +
        '</div>'
      );
    }).join('');
    return (
      '<div class="grid grid--2 report-tiles">' +
        tile('Тебе должны', U.money(owed), owed ? people.filter(function (p) { return (bal[p.id] || 0) > 0; }).length + ' чел.' : 'никто') +
        tile('Ты должен', U.money(iOwe), iOwe ? people.filter(function (p) { return (bal[p.id] || 0) < 0; }).length + ' чел.' : 'никому') +
      '</div>' +
      '<div class="section-row"><h2 class="section-title">Люди</h2><button type="button" class="btn btn-ghost" data-action="add-debtor">' + I.plus + 'Человек</button></div>' +
      (cards ? '<div class="goals">' + cards + '</div>'
        : U.empty({ emoji: '🤝', title: 'Долгов нет', text: 'Если даёшь деньги в долг, покупаешь что-то за друга или сам занимаешь — заведи человека, и дашборд будет помнить, кто кому сколько должен.', action: 'Добавить человека', attr: 'data-action="add-debtor"' })) +
      '<p class="section-hint">Деньги в долг проходят как переводы — они не считаются ни расходом, ни доходом. В импорте выписки перевод человеку можно отметить как «Перевод → имя».</p>'
    );
  }

  function debtorDialog() {
    var regular = regularAccounts();
    U.formDialog({
      title: 'Новый человек',
      values: { name: '', dir: 'give', amount: '', account: regular[0] ? regular[0].id : '', date: U.today(), note: '' },
      fields: function (v) {
        var f = [
          { name: 'name', type: 'text', label: 'Имя', placeholder: 'Например, Саша', maxlength: 40, autofocus: true },
          { name: 'dir', type: 'seg', label: 'Что было', rerender: true, options: [{ value: 'give', label: 'Я дал в долг' }, { value: 'get', label: 'Я взял в долг' }, { value: 'none', label: 'Пока ничего' }] }
        ];
        if (v.dir !== 'none') {
          f.push({ name: 'amount', type: 'money', label: 'Сумма', half: true });
          f.push({ name: 'account', type: 'select', label: v.dir === 'give' ? 'С какого счёта' : 'На какой счёт', half: true, options: regular.map(function (a) { return { value: a.id, label: a.name }; }) });
          f.push({ name: 'date', type: 'date', label: 'Дата', half: true });
          f.push({ name: 'note', type: 'text', label: 'За что', placeholder: 'Например, билеты', half: true, maxlength: 80 });
        }
        return f;
      },
      onSubmit: function (v) {
        var name = (v.name || '').trim();
        if (!name) return 'Напиши имя';
        var amount = v.dir === 'none' ? 0 : U.parseMoney(v.amount);
        if (v.dir !== 'none' && !(amount > 0)) return 'Введи сумму больше нуля';
        var A = getAccounts();
        var id = 'd' + U.uid();
        A.push({ id: id, name: name, kind: 'debt', start: 0 });
        Store.setSetting('money.accounts.v2', A);
        if (amount) {
          Store.add('transactions', v.dir === 'give'
            ? { type: 'transfer', amount: amount, account: v.account, to: id, date: v.date, note: (v.note || '').trim(), category: '', sub: '' }
            : { type: 'transfer', amount: amount, account: id, to: v.account, date: v.date, note: (v.note || '').trim(), category: '', sub: '' });
        }
      }
    });
  }

  // Найти человека в «Долгах» по имени или завести нового.
  function ensureDebtor(name) {
    var A = getAccounts();
    var hit = A.find(function (a) { return a.kind === 'debt' && MD.norm(a.name) === MD.norm(name); });
    if (hit) return hit.id;
    var id = 'd' + U.uid() + Math.random().toString(36).slice(2, 4);
    A.push({ id: id, name: name.charAt(0).toUpperCase() + name.slice(1), kind: 'debt', start: 0 });
    Store.setSetting('money.accounts.v2', A);
    return id;
  }

  // give — деньги от тебя человеку (дал в долг / вернул свой долг); get — от человека тебе.
  function debtMove(id, dir) {
    var p = accs().find(function (a) { return a.id === id; });
    if (!p) return;
    var before = balances()[id] || 0;
    var regular = regularAccounts();
    var label = dir === 'give' ? (before < 0 ? 'Я вернул долг' : 'Дал в долг') : (before > 0 ? 'Мне вернули' : 'Взял в долг');
    U.formDialog({
      title: label + ' · ' + p.name,
      submitLabel: 'Записать',
      values: { amount: dir === 'give' && before < 0 ? U.moneyInput(-before) : dir === 'get' && before > 0 ? U.moneyInput(before) : '', account: regular[0] ? regular[0].id : '', date: U.today(), note: '' },
      fields: [
        { name: 'amount', type: 'money', label: 'Сумма', autofocus: true },
        { name: 'account', type: 'select', label: dir === 'give' ? 'С какого счёта' : 'На какой счёт', half: true, options: regular.map(function (a) { return { value: a.id, label: a.name }; }) },
        { name: 'date', type: 'date', label: 'Дата', half: true },
        { name: 'note', type: 'text', label: 'Комментарий', maxlength: 80 }
      ],
      onSubmit: function (v) {
        var amount = U.parseMoney(v.amount);
        if (!(amount > 0)) return 'Введи сумму больше нуля';
        Store.add('transactions', dir === 'give'
          ? { type: 'transfer', amount: amount, account: v.account, to: id, date: v.date, note: (v.note || '').trim(), category: '', sub: '' }
          : { type: 'transfer', amount: amount, account: id, to: v.account, date: v.date, note: (v.note || '').trim(), category: '', sub: '' });
        var after = U.round2(before + (dir === 'give' ? amount : -amount));
        if (before !== 0 && after === 0) { if (window.FX) FX.confetti(); U.toast('С ' + p.name + ' в расчёте! 🤝'); }
        else U.toast('Записано');
      }
    });
  }

  // ---------- Распределение доходов: X% в копилку ----------
  var SAVE_CATS = ['work-office', 'work-remote', 'stipend', 'family-help', 'sidejob', 'gifts-inc', 'sales'];
  function saveRule() {
    var r = Object.assign({ enabled: true, percent: 10, piggy: '', since: currentMonth() + '-01' }, clone(Store.getSetting('money.saveRule', {}) || {}));
    if (!r.piggy || !isPiggy(r.piggy)) { var p = piggies()[0]; r.piggy = p ? p.id : ''; }
    return r;
  }
  function suggestSave(amount) { var r = saveRule(); return Math.max(10, Math.round(amount * r.percent / 100 / 10) * 10); }
  function qualifies(t) { var r = saveRule(); return r.enabled && r.piggy && t.type === 'income' && SAVE_CATS.indexOf(t.category) !== -1 && t.date >= r.since && !t.saveDone; }
  function pendingSaves() { return allTx().filter(qualifies).sort(function (a, b) { return b.date.localeCompare(a.date); }); }

  function doSave(t, amount) {
    var r = saveRule();
    var sum = amount || suggestSave(t.amount);
    Store.add('transactions', { type: 'transfer', amount: sum, account: t.account, to: r.piggy, date: U.today(), note: 'Отложено с дохода: ' + (t.note || groupName(t.category)), category: '', sub: '' });
    Store.update('transactions', t.id, { saveDone: 'saved' });
    if (window.FX) FX.sparkle(document.querySelector('.save-card') || document.body);
    U.toast('В «' + accName(r.piggy) + '» отложено ' + U.money(sum) + ' 🐷');
  }

  // Предложить отложить сразу после записи дохода (кнопка в уведомлении).
  function offerSave(rec) {
    if (!rec || !qualifies(rec)) return;
    var r = saveRule(), sum = suggestSave(rec.amount);
    setTimeout(function () {
      U.toast('Доход записан', { action: 'Отложить ' + U.money(sum) + ' в «' + accName(r.piggy) + '»', onAction: function () {
        var fresh = find('transactions', rec.id);
        if (fresh) doSave(fresh, sum);
      } });
    }, 300);
  }

  function saveCardHtml() {
    var list = pendingSaves();
    if (!list.length) return '';
    var r = saveRule();
    var bal = balances();
    var free = regularAccounts().reduce(function (s, a) { return s + (bal[a.id] || 0); }, 0);
    var key = currentMonth(), todayStr = U.today();
    var recLeft = Store.list('recurring').filter(function (x) {
      return !allTx().some(function (t) { return t.recurringId === x.id && U.monthKey(t.date) === key; }) && recurringDate(x, key) >= todayStr;
    }).reduce(function (s, x) { return s + x.amount; }, 0);
    var toSave = list.reduce(function (s, t) { return s + suggestSave(t.amount); }, 0);
    return (
      '<section class="card save-card">' +
        '<div class="card-head"><h2>🐷 Распределить доходы</h2><span class="muted">правило: ' + r.percent + '% в «' + esc(accName(r.piggy)) + '»</span></div>' +
        '<ul class="plan-list">' + list.slice(0, 5).map(function (t) {
          var s = suggestSave(t.amount);
          return '<li class="plan-row">' + catIcon(t.category) +
            '<span class="plan-main"><span class="tx-title">' + esc(t.note || groupName(t.category)) + ' · +' + U.money(t.amount) + '</span>' +
              '<span class="tx-sub">' + U.dayShort(t.date) + ' · ' + esc(accName(t.account)) + '</span></span>' +
            '<button type="button" class="btn btn-small btn-primary" data-action="save-do" data-id="' + t.id + '">Отложить ' + U.money(s) + '</button>' +
            '<button type="button" class="icon-btn" data-action="save-skip" data-id="' + t.id + '" aria-label="Пропустить" data-tip="Пропустить">×</button></li>';
        }).join('') + '</ul>' +
        '<p class="field-hint">Обязательных платежей до конца месяца: ' + U.money(recLeft) + ' · после того как отложишь ' + U.money(toSave) +
          ', свободно ≈ ' + U.money(Math.max(0, Math.round(free - recLeft - toSave))) + '</p>' +
      '</section>'
    );
  }

  // ============================================================
  //  Поездки: бюджет, траты за даты поездки, ввод в валюте
  // ============================================================
  var CURRENCIES = [['RUB', '₽ рубли'], ['EUR', '€ евро'], ['USD', '$ доллары'], ['TRY', '₺ лиры'], ['CNY', '¥ юани'], ['KZT', '₸ тенге'],
    ['GEL', '₾ лари'], ['AED', 'дирхамы'], ['THB', 'баты'], ['AMD', 'драмы'], ['UZS', 'сумы'], ['BYN', 'бел. рубли']];

  function tripSpentList(t) {
    return allTx().filter(function (x) { return x.type === 'expense' && (x.tripId === t.id || (t.from && t.to && x.date >= t.from && x.date <= t.to)); });
  }

  function tripsHtml() {
    var trips = Store.list('trips').sort(function (a, b) { return (b.from || '').localeCompare(a.from || ''); });
    var today = U.today();
    var cards = trips.map(function (t) {
      var list = tripSpentList(t);
      var spent = U.round2(list.reduce(function (s, x) { return s + x.amount; }, 0));
      var budget = Number(t.budget) || 0;
      var pct = budget ? spent / budget : 0;
      var days = t.from && t.to ? Math.round((U.toDate(t.to) - U.toDate(t.from)) / 864e5) + 1 : 0;
      var status, active = false, past = false;
      if (t.from && today < t.from) { var n = Math.round((U.toDate(t.from) - U.toDate(today)) / 864e5); status = '✈️ через ' + n + ' ' + U.plural(n, 'день', 'дня', 'дней'); }
      else if (t.to && today > t.to) { status = '🏁 поездка прошла'; past = true; }
      else { active = true; var k = Math.round((U.toDate(today) - U.toDate(t.from)) / 864e5) + 1; status = '🌍 идёт · день ' + k + ' из ' + days; }
      var left = U.round2(budget - spent);
      var daysLeft = active ? Math.round((U.toDate(t.to) - U.toDate(today)) / 864e5) + 1 : past ? 0 : days;
      var perDay = budget && daysLeft ? Math.max(0, Math.floor(left / daysLeft)) : 0;
      var byCat = {};
      list.forEach(function (x) { byCat[x.category] = (byCat[x.category] || 0) + x.amount; });
      var top = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; }).slice(0, 4).map(function (id) {
        return '<span class="trip-cat">' + catEmoji(id) + ' ' + esc(groupName(id)) + ' ' + U.money(byCat[id]) + '</span>';
      }).join('');
      var cur = t.currency || 'RUB';
      return (
        '<div class="card trip' + (active ? ' is-active' : '') + '">' +
          '<div class="wish-head"><button type="button" class="goal-name" data-action="edit-trip" data-id="' + t.id + '">' + esc(t.name) + '</button><span class="muted">' + status + '</span></div>' +
          '<div class="tx-sub">' + (t.from ? U.toDate(t.from).getDate() + ' ' + U.monthGen(t.from) : '') + (t.to ? ' – ' + U.toDate(t.to).getDate() + ' ' + U.monthGen(t.to) : '') +
            (cur !== 'RUB' && t.rate ? ' · 1 ' + cur + ' = ' + U.num(t.rate) + ' ₽' : '') + '</div>' +
          '<div class="ring-row">' + (budget ? U.ring(pct, { size: 64, stroke: 7, cls: pct > 1 ? 'is-bad' : pct > 0.85 ? 'is-warn' : '' }) : '') +
            '<div class="ring-info"><div class="goal-nums"><span class="goal-saved">' + U.money(spent) + '</span>' + (budget ? '<span class="muted"> из ' + U.money(budget) + '</span>' : '') + '</div>' +
              (budget && !past ? '<div class="tx-sub">' + (left >= 0 ? 'осталось ' + U.money(left) + (perDay ? ' · ≈ ' + U.money(perDay) + ' в день' : '') : 'бюджет превышен на ' + U.money(-left)) + '</div>' : '') +
            '</div></div>' +
          (top ? '<div class="trip-cats">' + top + '</div>' : '') +
          (!past ? '<form class="trip-add" data-form="trip-add" data-id="' + t.id + '" autocomplete="off">' +
            '<input type="text" name="text" placeholder="Трата в ' + (cur === 'RUB' ? 'рублях' : cur) + ': кофе 4,5" aria-label="Трата в поездке">' +
            '<button type="submit" class="btn btn-small btn-primary">＋</button></form>' : '') +
        '</div>'
      );
    }).join('');
    return (
      '<div class="section-row"><h2 class="section-title">✈️ Поездки</h2><button type="button" class="btn btn-ghost" data-action="add-trip">' + I.plus + 'Поездка</button></div>' +
      (cards ? '<div class="goals">' + cards + '</div>'
        : U.empty({ emoji: '🧳', title: 'Поездок пока нет', text: 'Заведи поездку с датами и бюджетом — траты за эти дни соберутся сами, а суммы в валюте пересчитаются в рубли.', action: 'Добавить поездку', attr: 'data-action="add-trip"' }))
    );
  }

  function tripDialog(t) {
    var editing = !!t;
    var A = getAccounts();
    var p0 = A.find(function (a) { return a.kind === 'piggy'; });
    U.formDialog({
      title: editing ? 'Поездка' : 'Новая поездка',
      values: editing
        ? { name: t.name, from: t.from || '', to: t.to || '', budget: U.moneyInput(t.budget || ''), currency: t.currency || 'RUB', rate: t.rate ? String(t.rate).replace('.', ',') : '', account: t.account || '' }
        : { name: '', from: '', to: '', budget: '', currency: 'RUB', rate: '', account: p0 ? p0.id : defaultAccount() },
      fields: function (v) {
        var f = [
          { name: 'name', type: 'text', label: 'Куда', placeholder: 'Например, Казань', maxlength: 60, autofocus: !editing },
          { name: 'from', type: 'date', label: 'С', half: true },
          { name: 'to', type: 'date', label: 'По', half: true },
          { name: 'budget', type: 'money', label: 'Бюджет в рублях', half: true },
          { name: 'currency', type: 'select', label: 'Валюта трат', half: true, rerender: true, options: CURRENCIES.map(function (c) { return { value: c[0], label: c[1] }; }) }
        ];
        if (v.currency !== 'RUB') f.push({ name: 'rate', type: 'text', label: 'Курс: сколько рублей за 1 ' + v.currency, placeholder: 'например, 98,5', maxlength: 12 });
        f.push({ name: 'account', type: 'select', label: 'Платить по умолчанию с', options: A.filter(function (a) { return a.kind !== 'debt'; }).map(function (a) { return { value: a.id, label: (a.kind === 'piggy' ? '🐷 ' : '') + a.name }; }) });
        f.push({ type: 'hint', text: 'Траты из копилки не съедают месячный бюджет. Все расходы за даты поездки попадут в её итог автоматически.' });
        return f;
      },
      onSubmit: function (v) {
        var name = (v.name || '').trim();
        if (!name) return 'Напиши, куда поездка';
        if (!v.from || !v.to) return 'Укажи даты';
        if (v.to < v.from) return 'Дата окончания раньше начала';
        var budget = v.budget ? U.parseMoney(v.budget) : 0;
        if (isNaN(budget)) return 'Проверь бюджет';
        var rate = v.currency === 'RUB' ? 1 : parseFloat(String(v.rate || '').replace(',', '.'));
        if (v.currency !== 'RUB' && !(rate > 0)) return 'Укажи курс валюты';
        var rec = { name: name, from: v.from, to: v.to, budget: budget, currency: v.currency, rate: rate, account: v.account };
        if (editing) Store.update('trips', t.id, rec); else Store.add('trips', rec);
      },
      onDelete: editing ? function () { if (!confirm('Удалить поездку? Траты останутся в истории.')) return false; Store.remove('trips', t.id); } : null
    });
  }

  function tripAdd(id, text) {
    var t = find('trips', id);
    if (!t) return;
    var p = MD.parseQuick(text, { accounts: accs(), learned: getLearned() });
    if (!p || !(p.amount > 0)) { U.toast('Напиши, на что и сколько: «кофе 4,5»'); return; }
    var cur = t.currency || 'RUB';
    var rub = cur === 'RUB' ? p.amount : U.round2(p.amount * (Number(t.rate) || 1));
    var matched = p.matched && p.type === 'expense';
    var today = U.today();
    Store.add('transactions', {
      type: 'expense', amount: rub, date: p.date || today, account: p.account || t.account || defaultAccount(), to: '',
      category: matched ? p.category : 'travel', sub: matched ? p.sub : '',
      note: (p.note || 'Поездка') + (cur !== 'RUB' ? ' · ' + U.num(p.amount) + ' ' + cur : ''), tripId: t.id
    });
    U.toast('Записано: ' + U.money(rub) + (cur !== 'RUB' ? ' (' + U.num(p.amount) + ' ' + cur + ')' : ''));
  }

  // ============================================================
  //  Тренды и необычные траты
  // ============================================================
  function fullMonth(key) { return allTx().some(function (t) { return U.monthKey(t.date) === key && +t.date.slice(8, 10) <= 5; }); }
  function byGroupMonth(key) {
    var m = {};
    inMonth(allTx(), key).forEach(function (t) { if (t.type === 'expense') m[t.category] = (m[t.category] || 0) + t.amount; });
    return m;
  }

  function insights() {
    var out = [];
    var key = currentMonth(), day = new Date().getDate(), n = U.daysIn(key);
    var prevKeys = [1, 2, 3].map(function (i) { return U.addMonths(key, -i); }).filter(fullMonth);
    if (prevKeys.length && day >= 7) {
      var cur = byGroupMonth(key), avg = {};
      prevKeys.forEach(function (k) { var g = byGroupMonth(k); Object.keys(g).forEach(function (id) { avg[id] = (avg[id] || 0) + g[id] / prevKeys.length; }); });
      Object.keys(avg).forEach(function (id) {
        var a = avg[id], proj = (cur[id] || 0) / day * n;
        if (a >= 1000 && proj > a * 1.4) out.push({ emoji: '📈', level: 'warn', text: groupName(id) + ': в этом месяце идёт к ≈ ' + U.money(Math.round(proj / 10) * 10) + ' — на ' + Math.round((proj / a - 1) * 100) + '% больше обычного (≈ ' + U.money(Math.round(a / 10) * 10) + ')' });
        else if (a >= 1500 && day >= 15 && proj < a * 0.6) out.push({ emoji: '📉', level: 'good', text: groupName(id) + ': тратишь заметно меньше обычного — так держать!' });
      });
    }
    // Необычно крупная трата за 14 дней: втрое больше обычной траты в этой категории.
    var since90 = U.iso(new Date(Date.now() - 90 * 864e5)), since14 = U.iso(new Date(Date.now() - 14 * 864e5));
    var groups = {};
    allTx().forEach(function (t) { if (t.type === 'expense' && t.date >= since90) (groups[t.category] = groups[t.category] || []).push(t.amount); });
    allTx().forEach(function (t) {
      if (t.type !== 'expense' || t.date < since14 || t.amount < 3000) return;
      // Переводы людям и снятие наличных — не «покупки», их не подсвечиваем.
      if (t.category === 'people' || /перевод|без подробностей|наличн/i.test(t.note || '')) return;
      var arr = (groups[t.category] || []).slice().sort(function (a, b) { return a - b; });
      if (arr.length < 4) return;
      var med = arr[Math.floor(arr.length / 2)];
      if (t.amount > med * 3) out.push({ emoji: '🧐', level: 'info', text: 'Необычно крупная трата: ' + (t.note || groupName(t.category)) + ' — ' + U.money(t.amount) + ' (' + U.dayShort(t.date).split(',')[0] + ')' });
    });
    return out;
  }

  function insightsHtml() {
    var list = insights();
    if (!list.length) return '';
    return '<section class="card insights"><div class="card-head"><h2>🔍 Дашборд заметил</h2></div><ul class="facts">' +
      list.map(function (i) { return '<li class="ins ins--' + i.level + '">' + i.emoji + ' ' + esc(i.text) + '</li>'; }).join('') + '</ul></section>';
  }

  // Тренд одной категории за полгода (для «Итогов»)
  function trendCard() {
    if (!state.trendCat) return '';
    var id = state.trendCat;
    var keys = [];
    for (var i = 5; i >= 0; i--) keys.push(U.addMonths(state.month, -i));
    var vals = keys.map(function (k) { return U.round2(byGroupMonth(k)[id] || 0); });
    charts.trend = { values: vals, labels: keys.map(U.monthShort), xTicks: [0, 1, 2, 3, 4, 5], label: 'Тренд категории', height: 170,
      tips: keys.map(function (k, j) { return U.monthTitle(k) + '\n' + U.money(vals[j]); }) };
    return chartCard(catIcon(id) + ' ' + esc(groupName(id)) + ' за полгода', '<button type="button" class="link-btn" data-action="trend-close">закрыть</button>', '<div class="chart" data-chart="trend"></div>');
  }

  // ============================================================
  //  Капитал и проценты
  // ============================================================
  function balanceAt(dateIso) {
    var total = accs().reduce(function (s, a) { return s + (Number(a.start) || 0); }, 0);
    allTx().forEach(function (t) {
      if (t.date > dateIso) return;
      if (t.type === 'income') total += t.amount;
      else if (t.type === 'expense') total -= t.amount;
    });
    return U.round2(total);
  }

  function capitalHtml() {
    var keys = [];
    for (var i = 5; i >= 0; i--) keys.push(U.addMonths(currentMonth(), -i));
    var first = allTx().reduce(function (m, t) { return !m || t.date < m ? t.date : m; }, '');
    var vals = keys.map(function (k) {
      if (first && k < U.monthKey(first)) return 0;
      var end = k === currentMonth() ? U.today() : k + '-' + U.pad(U.daysIn(k));
      return Math.max(0, balanceAt(end));
    });
    var bal = balances();
    var onCards = regularAccounts().reduce(function (s, a) { return s + (bal[a.id] || 0); }, 0);
    var inPig = piggies().reduce(function (s, a) { return s + (bal[a.id] || 0); }, 0);
    var debtNet = debtors().reduce(function (s, a) { return s + (bal[a.id] || 0); }, 0);
    var totalNow = U.round2(onCards + inPig + debtNet);
    var prevVal = vals[vals.length - 2];
    charts.capital = { values: vals, labels: keys.map(U.monthShort), xTicks: [0, 1, 2, 3, 4, 5], label: 'Капитал по месяцам', height: 160,
      tips: keys.map(function (k, j) { return U.monthTitle(k) + '\nВсего: ' + U.money(vals[j]); }) };
    return chartCard('💎 Капитал', 'всё, что у тебя есть',
      '<div class="capital-top"><span class="forecast-value">' + U.money(totalNow) + '</span>' +
        (prevVal ? '<span class="delta ' + (totalNow >= prevVal ? 'delta--good' : 'delta--bad') + '">' + U.signed(totalNow - prevVal) + ' за месяц</span>' : '') + '</div>' +
      '<div class="capital-parts"><span>💳 на счетах ' + U.money(onCards) + '</span><span>🐷 в копилках ' + U.money(inPig) + '</span>' +
        (Math.abs(debtNet) > 0.009 ? '<span>🤝 долги ' + U.signed(debtNet) + '</span>' : '') + '</div>' +
      '<div class="chart" data-chart="capital"></div>');
  }

  function interestLine(p, saved) {
    var rate = Number(p.rate) || 0;
    if (!rate || saved <= 0) return rate ? '' : '<p class="piggy-plan muted">Укажи ставку накопительного счёта — посчитаю проценты.</p>';
    var month = U.round2(saved * rate / 100 / 12);
    var year = U.round2(saved * (Math.pow(1 + rate / 100 / 12, 12) - 1));
    return '<p class="piggy-plan">📈 ' + U.num(rate) + '% годовых: ≈ <b>' + U.money(Math.round(month)) + '</b> в месяц, ≈ ' + U.money(Math.round(year)) + ' за год' +
      ' · <button type="button" class="link-btn" data-action="piggy-interest" data-id="' + p.id + '">начислить за месяц</button></p>';
  }

  function interestDialog(id) {
    var p = accs().find(function (a) { return a.id === id; });
    if (!p) return;
    var saved = balances()[id] || 0;
    U.formDialog({
      title: 'Проценты: ' + p.name,
      submitLabel: 'Записать доход',
      values: { amount: U.moneyInput(U.round2(saved * (Number(p.rate) || 0) / 100 / 12)), date: U.today() },
      fields: [
        { name: 'amount', type: 'money', label: 'Сколько начислил банк', autofocus: true },
        { name: 'date', type: 'date', label: 'Дата' },
        { type: 'hint', text: 'Посмотри точную сумму в приложении Т-Банка — в истории накопительного счёта.' }
      ],
      onSubmit: function (v) {
        var amount = U.parseMoney(v.amount);
        if (!(amount > 0)) return 'Введи сумму больше нуля';
        Store.add('transactions', { type: 'income', amount: amount, date: v.date, account: id, to: '', category: 'cashback', sub: 'cashback.interest', note: 'Проценты на остаток' });
        U.toast('Проценты записаны: +' + U.money(amount));
      }
    });
  }

  // ============================================================
  //  Кэшбэк Т-Банка
  // ============================================================
  var TB_SUB = {
    'food.groceries': 'Супермаркеты', 'food.restaurants': 'Рестораны', 'food.delivery': 'Доставка еды', 'food.coffee': 'Кафе',
    'transport.taxi': 'Такси', 'transport.public': 'Местный транспорт', 'transport.sharing': 'Каршеринг',
    'health.pharmacy': 'Аптеки', 'health.doctors': 'Медицина', 'health.sport': 'Спорт', 'beauty.cosmetics': 'Красота', 'beauty.salon': 'Красота',
    'connect.subs': 'Цифровые товары', 'connect.mobile': 'Связь', 'home.internet': 'Связь', 'fun.events': 'Кино', 'fun.games': 'Цифровые товары',
    'study.books': 'Книги', 'travel.tickets': 'Путешествия', 'travel.lodging': 'Отели', 'family.pets': 'Животные'
  };
  var TB_GROUP = { food: 'Супермаркеты', clothes: 'Одежда и обувь', household: 'Дом и ремонт', fun: 'Развлечения',
    beauty: 'Красота', health: 'Медицина', travel: 'Путешествия', study: 'Образование' };

  function cashbackStats() {
    var since = U.iso(new Date(Date.now() - 90 * 864e5));
    var months = Math.max(1, Math.min(3, (Date.now() - U.toDate(allTx().reduce(function (m, t) { return !m || t.date < m ? t.date : m; }, U.today())).getTime()) / (30.4 * 864e5)));
    var sums = {};
    allTx().forEach(function (t) {
      if (t.type !== 'expense' || t.date < since || isPiggy(t.account)) return;
      var name = TB_SUB[t.sub] || TB_GROUP[t.category];
      if (name) sums[name] = (sums[name] || 0) + t.amount;
    });
    return Object.keys(sums).map(function (n) { return { name: n, perMonth: U.round2(sums[n] / months) }; })
      .sort(function (a, b) { return b.perMonth - a.perMonth; });
  }

  function cashbackHtml() {
    var cfg = Store.getSetting('money.cashback', {}) || {};
    var key = currentMonth();
    var stats = cashbackStats().slice(0, 8);
    var year = String(new Date().getFullYear());
    var gotYear = U.round2(allTx().filter(function (t) { return t.type === 'income' && t.category === 'cashback' && t.sub !== 'cashback.interest' && t.date.slice(0, 4) === year; })
      .reduce(function (s, t) { return s + t.amount; }, 0));
    var chosen = cfg.month === key ? (cfg.cats || []) : null;
    if (!state.cbSel) state.cbSel = chosen ? chosen.slice() : stats.slice(0, 3).map(function (s) { return s.name; });
    var monthName = U.monthTitle(key).split(' ')[0].toLowerCase();
    var expected = U.round2(stats.filter(function (s) { return (chosen || state.cbSel).indexOf(s.name) !== -1; }).reduce(function (s, x) { return s + x.perMonth * 0.05; }, 0));
    var body = chosen
      ? '<p class="hero-meta">Выбрано на ' + monthName + ': <b>' + chosen.map(esc).join(', ') + '</b> · ожидаемый кэшбэк ≈ ' + U.money(Math.round(expected)) + ' (при 5%)</p>' +
        '<button type="button" class="link-btn" data-action="cb-change">изменить выбор</button>'
      : '<p class="hero-meta">В начале месяца в приложении Т-Банка можно выбрать категории повышенного кэшбэка. По твоим тратам выгоднее всего:</p>' +
        '<div class="chips cb-chips">' + stats.map(function (s) {
          var on = state.cbSel.indexOf(s.name) !== -1;
          return '<button type="button" class="chip-btn' + (on ? ' is-on' : '') + '" data-action="cb-toggle" data-name="' + esc(s.name) + '">' + esc(s.name) + ' · ≈ ' + U.money(Math.round(s.perMonth * 0.05)) + '/мес</button>';
        }).join('') + '</div>' +
        '<div class="btn-row"><button type="button" class="btn btn-small btn-primary" data-action="cb-save">Я выбрал эти категории</button></div>';
    return (
      '<section class="card cashback">' +
        '<div class="card-head"><h2>💳 Кэшбэк Т-Банка</h2><span class="muted">за ' + year + ' получено ' + U.money(gotYear) + '</span></div>' +
        (stats.length ? body : '<p class="chart-empty">Появится, когда в истории будут траты по категориям.</p>') +
      '</section>'
    );
  }

  // ============================================================
  //  Бюджет по неделям
  // ============================================================
  var WEEK_GROUPS = ['food', 'transport', 'fun', 'household', 'beauty'];
  function mondayOfIso(date) { var d = U.toDate(date); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return U.iso(d); }
  function addDaysIso(date, n) { var d = U.toDate(date); d.setDate(d.getDate() + n); return U.iso(d); }
  function weeklyCfg() {
    var w = Store.getSetting('money.weekly', null);
    return w && Number(w.amount) > 0 ? { amount: Number(w.amount), groups: w.groups && w.groups.length ? w.groups : WEEK_GROUPS } : null;
  }
  function weekSpent(from, to, groups) {
    return U.round2(allTx().reduce(function (s, t) {
      return s + (t.type === 'expense' && !isPiggy(t.account) && t.date >= from && t.date <= to && groups.indexOf(t.category) !== -1 ? t.amount : 0);
    }, 0));
  }
  // Средние траты за прошлые полные недели (с данными), минус 10%, округлено до 500.
  function weeklySuggest(groups) {
    groups = groups || WEEK_GROUPS;
    var first = allTx().reduce(function (m, t) { return !m || t.date < m ? t.date : m; }, '');
    if (!first) return 0;
    var mon = mondayOfIso(U.today()), sums = [];
    for (var i = 1; i <= 8; i++) {
      var from = addDaysIso(mon, -7 * i), to = addDaysIso(from, 6);
      if (from < first) break;
      var s = weekSpent(from, to, groups);
      if (s > 0) sums.push(s);
    }
    if (!sums.length) return 0;
    var avg = sums.reduce(function (a, b) { return a + b; }, 0) / sums.length;
    return Math.max(500, Math.round(avg * 0.9 / 500) * 500);
  }
  function weekly() {
    var c = weeklyCfg();
    if (!c) return null;
    var mon = mondayOfIso(U.today()), sun = addDaysIso(mon, 6);
    var spent = weekSpent(mon, U.today(), c.groups);
    var left = U.round2(c.amount - spent);
    var daysLeft = Math.round((U.toDate(sun) - U.toDate(U.today())) / 864e5) + 1;
    return { amount: c.amount, spent: spent, left: left, daysLeft: daysLeft, perDay: Math.max(0, Math.floor(left / daysLeft)), groups: c.groups };
  }
  function weeklyCardHtml() {
    var w = weekly();
    if (!w) {
      var sug = weeklySuggest();
      return '<section class="card weekly"><div class="card-head"><h2>🗓️ Бюджет на неделю</h2></div>' +
        '<p class="hero-meta">Лимит на повседневное (еда, транспорт, развлечения, быт, красота) — каждый понедельник заново. Держаться неделю легче, чем месяц.</p>' +
        (sug ? '<button type="button" class="btn btn-small btn-primary" data-action="weekly-set" data-amount="' + sug + '">Поставить ' + U.money(sug) + ' в неделю (по твоим тратам)</button>'
             : '<button type="button" class="btn btn-small" data-action="goto-settings">Задать в настройках</button>') + '</section>';
    }
    var pct = w.spent / w.amount;
    return (
      '<section class="card weekly"><div class="ring-row">' +
        U.ring(pct, { size: 76, stroke: 8, cls: pct > 1 ? 'is-bad' : pct > 0.85 ? 'is-warn' : '' }) +
        '<div class="ring-info"><div class="hero-label">Неделя: ' + (w.left >= 0 ? 'осталось' : 'перерасход') + '</div>' +
          '<div class="tile-value">' + U.money(Math.abs(w.left)) + '</div>' +
          '<div class="hero-meta">потрачено ' + U.money(w.spent) + ' из ' + U.money(w.amount) + (w.left > 0 ? ' · ≈ ' + U.money(w.perDay) + ' в день до воскресенья' : '') + '</div>' +
        '</div></div></section>'
    );
  }

  // ---------- Предупреждение о лимитах ----------
  function limitWarning(category) {
    var key = currentMonth();
    var list = inMonth(allTx(), key);
    var b = getBudget();
    var lim = Number(b.limits[category]) || 0;
    if (lim) {
      var spent = U.round2(list.reduce(function (s, t) { return s + (t.type === 'expense' && t.category === category ? t.amount : 0); }, 0));
      var pct = Math.round(spent / lim * 100);
      if (pct >= 100) return '⛔ ' + groupName(category) + ': лимит превышен — ' + U.money(spent) + ' из ' + U.money(lim);
      if (pct >= 80) return '⚠️ ' + groupName(category) + ': уже ' + pct + '% лимита (' + U.money(spent) + ' из ' + U.money(lim) + ')';
    }
    if (b.total) {
      var p2 = Math.round(budgetSpent(list) / b.total * 100);
      if (p2 >= 80) return '⚠️ Потрачено ' + p2 + '% месячного бюджета';
    }
    return '';
  }
  function warnLater(category) {
    var w = limitWarning(category);
    if (w) setTimeout(function () { U.toast(w); }, 1600);
  }

  // ---------- Структура расходов (кольцо) ----------
  function structureCard(list) {
    var sums = {};
    list.forEach(function (t) { if (t.type === 'expense') sums[t.category] = (sums[t.category] || 0) + t.amount; });
    var ids = Object.keys(sums).sort(function (a, b) { return sums[b] - sums[a]; });
    if (!ids.length) return '';
    var exp = ids.reduce(function (s, id) { return s + sums[id]; }, 0);
    var top = ids.slice(0, 5), rest = ids.slice(5);
    var segs = top.map(function (id, i) { return { label: groupName(id), value: sums[id], cls: 'seg--' + (i + 1), emoji: catEmoji(id) }; });
    if (rest.length) segs.push({ label: 'Остальное', value: rest.reduce(function (s, id) { return s + sums[id]; }, 0), cls: 'seg--other', emoji: '•' });
    segs.forEach(function (s) { s.tip = s.label + '\n' + U.money(s.value) + ' · ' + Math.round(s.value / exp * 100) + '%'; });
    charts.donut = { segments: segs, center: U.money(Math.round(exp)), sub: 'расходы', label: 'Структура расходов' };
    var legend = segs.map(function (s) {
      return '<li><i class="key ' + s.cls.replace('seg', 'key') + '"></i><span class="rep-name">' + esc(s.label) + '</span><span class="rep-val">' + Math.round(s.value / exp * 100) + '%</span></li>';
    }).join('');
    return chartCard('Структура расходов', 'Наведи на кольцо',
      '<div class="donut-wrap"><div class="chart chart--donut" data-chart="donut"></div><ul class="donut-legend">' + legend + '</ul></div>');
  }

  // ---------- Напоминание о свежей выписке ----------
  function freshnessHtml() {
    var imported = allTx().filter(function (t) { return t.importKey; });
    if (!imported.length) return '';
    var last = imported.reduce(function (m, t) { return t.date > m ? t.date : m; }, '');
    var days = Math.round((U.toDate(U.today()) - U.toDate(last)) / 864e5);
    if (days <= 7 || Store.getSetting('money.freshHidden', '') === last) return '';
    return (
      '<div class="card banner">' +
        '<span class="banner-emoji">📄</span>' +
        '<div class="banner-main"><b>Последняя выписка — по ' + U.toDate(last).getDate() + ' ' + U.monthGen(last) + '</b>' +
          '<span>Прошло ' + days + ' ' + U.plural(days, 'день', 'дня', 'дней') + '. Загрузи свежую — или просто перетащи PDF в окно дашборда.</span></div>' +
        '<button type="button" class="btn btn-small btn-primary" data-action="import">Загрузить</button>' +
        '<button type="button" class="icon-btn" data-action="fresh-hide" data-date="' + last + '" aria-label="Скрыть">×</button>' +
      '</div>'
    );
  }

  // ============================================================
  //  Настройки
  // ============================================================
  function settingsHtml() {
    var b = getBudget();
    var c = cats();
    var bal = balances();

    var limits = c.expense.map(function (x) {
      return (
        '<label class="limit-row"><span>' + esc(x.name) + '</span>' +
          '<span class="money-input money-input--sm"><input name="limit:' + esc(x.id) + '" inputmode="decimal" autocomplete="off" placeholder="нет" value="' +
            esc(U.moneyInput(b.limits[x.id])) + '"><span class="suffix">₽</span></span></label>'
      );
    }).join('');

    var budgetCard =
      '<section class="card settings-card">' +
        '<h2>Бюджет на месяц</h2>' +
        '<form data-form="budget" novalidate>' +
          '<label class="field"><span class="field-label">Общий бюджет</span>' +
            '<span class="money-input"><input name="total" inputmode="decimal" autocomplete="off" placeholder="например, 25 000" value="' + esc(U.moneyInput(b.total || '')) + '"><span class="suffix">₽</span></span></label>' +
          '<p class="field-hint">Лимиты по группам — необязательно. Пустое поле — без лимита.</p>' +
          '<div class="limits">' + limits + '</div>' +
          '<button type="submit" class="btn btn-primary">Сохранить бюджет</button>' +
        '</form>' +
      '</section>';

    function catList(type, title) {
      return (
        '<div class="cat-edit">' +
          '<div class="card-head"><h3>' + title + '</h3><button type="button" class="btn btn-ghost" data-action="add-cat" data-type="' + type + '">' + I.plus + 'Группа</button></div>' +
          '<ul class="group-list">' + c[type].map(function (g) {
            return (
              '<li class="group-item">' +
                '<div class="group-row"><span class="group-name">' + catIcon(g.id) + esc(g.name) + (g.locked ? ' <span class="muted">· связана с «Работой»</span>' : '') + '</span>' +
                  '<span class="row-actions">' +
                    '<button type="button" class="icon-btn" data-action="add-sub" data-type="' + type + '" data-id="' + esc(g.id) + '" aria-label="Добавить подкатегорию в ' + esc(g.name) + '" data-tip="Добавить подкатегорию">' + I.plus + '</button>' +
                    '<button type="button" class="icon-btn" data-action="edit-cat" data-type="' + type + '" data-id="' + esc(g.id) + '" aria-label="Переименовать ' + esc(g.name) + '">' + I.edit + '</button>' +
                    (g.locked ? '' : '<button type="button" class="icon-btn" data-action="del-cat" data-type="' + type + '" data-id="' + esc(g.id) + '" aria-label="Удалить ' + esc(g.name) + '">' + I.trash + '</button>') +
                  '</span></div>' +
                (g.subs.length ? '<div class="sub-chips">' + g.subs.map(function (s) {
                  return '<button type="button" class="sub-chip" data-action="edit-sub" data-type="' + type + '" data-group="' + esc(g.id) + '" data-id="' + esc(s.id) + '">' + esc(s.name) + '</button>';
                }).join('') + '</div>' : '') +
              '</li>'
            );
          }).join('') + '</ul>' +
        '</div>'
      );
    }

    var catsCard =
      '<section class="card settings-card settings-card--wide"><h2>Категории</h2>' +
        '<p class="field-hint">Нажми на подкатегорию, чтобы переименовать или удалить её.</p>' +
        '<div class="cat-cols">' + catList('expense', 'Расходы') + catList('income', 'Доходы') + '</div>' +
      '</section>';

    var accRows = accs().map(function (a) {
      var piggy = a.kind === 'piggy';
      return (
        '<li><span>' + esc(a.name) + ' <span class="muted">· ' + (piggy ? 'копилка · ' : '') + U.money(bal[a.id] || 0) + '</span></span>' +
          '<span class="row-actions">' +
            '<button type="button" class="icon-btn" data-action="' + (piggy ? 'edit-piggy' : 'edit-acc') + '" data-id="' + esc(a.id) + '" aria-label="Изменить ' + esc(a.name) + '">' + I.edit + '</button>' +
            '<button type="button" class="icon-btn" data-action="del-acc" data-id="' + esc(a.id) + '" aria-label="Удалить ' + esc(a.name) + '">' + I.trash + '</button>' +
          '</span></li>'
      );
    }).join('');

    var accCard =
      '<section class="card settings-card">' +
        '<div class="card-head"><h2>Счета и копилки</h2><button type="button" class="btn btn-ghost" data-action="add-acc">' + I.plus + 'Счёт</button></div>' +
        '<ul class="edit-list">' + accRows + '</ul>' +
        '<p class="field-hint">Начальный остаток — сколько денег было на счёте до первой записи. Новую копилку можно завести в «Планах».</p>' +
      '</section>';

    var importCard =
      '<section class="card settings-card">' +
        '<h2>Импорт выписки Т-Банка</h2>' +
        '<p class="field-hint">Подойдёт PDF-выписка из приложения Т-Банка («Выписка» → период → PDF) или CSV из веб-версии. ' +
          'Перед сохранением покажу список, где можно поправить категории; выбор применится ко всем таким же операциям. ' +
          'Операции, которые уже есть, отсеются сами. Файл читается прямо в браузере и никуда не отправляется.</p>' +
        '<div class="btn-row"><button type="button" class="btn" data-action="import">' + I.upload + 'Загрузить выписку</button></div>' +
      '</section>';

    var learnedCount = Object.keys(getLearned()).length;
    var memoryCard =
      '<section class="card settings-card">' +
        '<h2>Память и резервная копия</h2>' +
        (learnedCount ? '<p class="field-hint">Дашборд запомнил ' + learnedCount + ' ' + U.plural(learnedCount, 'слово', 'слова', 'слов') +
          ' для категорий (магазины, переводы, договоры). <button type="button" class="link-btn" data-action="forget">Забыть всё</button></p>'
          : '<p class="field-hint">Когда ты исправляешь категорию, дашборд запоминает выбор для таких же операций.</p>') +
        '<p class="field-hint">Резервная копия всех данных — в общих настройках (значок шестерёнки вверху).</p>' +
      '</section>';

    var rule = saveRule();
    var ruleCard =
      '<section class="card settings-card">' +
        '<h2>Правило накоплений</h2>' +
        '<form data-form="saverule" novalidate>' +
          '<p class="field-hint">Когда приходит зарплата, стипендия или другой доход, дашборд предложит отложить часть в копилку одной кнопкой.</p>' +
          '<div class="seg" role="radiogroup" aria-label="Правило">' +
            '<label class="seg-item"><input type="radio" name="enabled" value="1"' + (rule.enabled ? ' checked' : '') + '><span>Включено</span></label>' +
            '<label class="seg-item"><input type="radio" name="enabled" value="0"' + (!rule.enabled ? ' checked' : '') + '><span>Выключено</span></label></div>' +
          '<div class="limits">' +
            '<label class="limit-row"><span>Сколько откладывать</span><span class="money-input money-input--sm"><input name="percent" inputmode="decimal" value="' + rule.percent + '"><span class="suffix">%</span></span></label>' +
            '<label class="limit-row"><span>В какую копилку</span><select name="piggy">' + piggies().map(function (p) {
              return '<option value="' + esc(p.id) + '"' + (p.id === rule.piggy ? ' selected' : '') + '>' + esc(p.name) + '</option>';
            }).join('') + '</select></label>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary">Сохранить правило</button>' +
        '</form>' +
      '</section>';

    var wc = weeklyCfg();
    var wSug = weeklySuggest(wc ? wc.groups : null);
    var wGroups = wc ? wc.groups : WEEK_GROUPS;
    var weeklyCard =
      '<section class="card settings-card">' +
        '<h2>Бюджет на неделю</h2>' +
        '<form data-form="weekly" novalidate>' +
          '<p class="field-hint">Лимит на повседневные траты с понедельника по воскресенье. Пусто — выключено.' +
            (wSug ? ' По твоим тратам за прошлые недели минус 10% выходит ≈ ' + U.money(wSug) + '.' : '') + '</p>' +
          '<label class="limit-row"><span>Сумма в неделю</span><span class="money-input money-input--sm"><input name="amount" inputmode="decimal" value="' + (wc ? U.moneyInput(wc.amount) : '') + '" placeholder="' + (wSug || '') + '"><span class="suffix">₽</span></span></label>' +
          '<div class="chips week-groups">' + cats().expense.map(function (g) {
            return '<label class="chip-check"><input type="checkbox" name="wgroup" value="' + esc(g.id) + '"' + (wGroups.indexOf(g.id) !== -1 ? ' checked' : '') + '><span>' + catEmoji(g.id) + ' ' + esc(g.name) + '</span></label>';
          }).join('') + '</div>' +
          '<button type="submit" class="btn btn-primary">Сохранить</button>' +
        '</form>' +
      '</section>';

    return '<div class="settings">' + budgetCard + weeklyCard + ruleCard + accCard + catsCard + importCard + memoryCard + '</div>';
  }

  // ============================================================
  //  Действия
  // ============================================================
  function find(col, id) { return Store.list(col).find(function (x) { return x.id === id; }); }

  function onClick(e) {
    var b = e.target.closest('[data-action]');
    if (!b) return;
    var id = b.dataset.id;
    switch (b.dataset.action) {
      case 'view': state.view = b.dataset.view; rerender(); break;
      case 'month': state.month = U.addMonths(state.month, +b.dataset.step); rerender(); break;
      case 'goto-settings': state.view = 'settings'; rerender(); break;
      case 'add-tx': txDialog(); break;
      case 'edit-tx': txDialog(find('transactions', id)); break;
      case 'add-rec': recDialog(); break;
      case 'edit-rec': recDialog(find('recurring', id)); break;
      case 'pay-rec': payRecurring(find('recurring', id)); break;
      case 'add-piggy': piggyDialog(); break;
      case 'edit-piggy': piggyDialog(id); break;
      case 'piggy-in': piggyMove(id, 'in'); break;
      case 'piggy-out': piggyMove(id, 'out'); break;
      case 'add-cat': groupDialog(b.dataset.type); break;
      case 'edit-cat': groupDialog(b.dataset.type, id); break;
      case 'del-cat': deleteGroup(b.dataset.type, id); break;
      case 'add-sub': subDialog(b.dataset.type, id); break;
      case 'edit-sub': subDialog(b.dataset.type, b.dataset.group, id); break;
      case 'add-acc': accDialog(); break;
      case 'edit-acc': accDialog(id); break;
      case 'del-acc': deleteAcc(id); break;
      case 'import': importTBank(); break;
      case 'save-do': { var st = find('transactions', id); if (st) doSave(st); break; }
      case 'save-skip': Store.update('transactions', id, { saveDone: 'skipped' }); break;
      case 'add-wish': wishDialog(); break;
      case 'edit-wish': wishDialog(find('wishlist', id)); break;
      case 'wish-save': {
        var w = find('wishlist', id);
        if (!w) break;
        var A = getAccounts();
        A.push({ id: 'p' + U.uid(), name: w.title, kind: 'piggy', target: Number(w.price) || 0, targetDate: '', start: 0 });
        Store.setSetting('money.accounts.v2', A);
        state.view = 'plans';
        U.toast('Копилка «' + w.title + '» создана — пополняй её в «Планах» 🐷');
        break;
      }
      case 'wish-buy': {
        var wi = find('wishlist', id);
        if (!wi) break;
        Store.update('wishlist', id, { bought: true });
        if (window.FX) FX.confetti();
        txDialog(null, { type: 'expense', amount: Number(wi.price) || 0, note: wi.title });
        break;
      }
      case 'add-trip': tripDialog(); break;
      case 'edit-trip': tripDialog(find('trips', id)); break;
      case 'trend': state.trendCat = state.trendCat === id ? '' : id; rerender(); break;
      case 'trend-close': state.trendCat = ''; rerender(); break;
      case 'piggy-interest': interestDialog(id); break;
      case 'cb-toggle': {
        var nm = b.dataset.name, sel = state.cbSel || [];
        var at = sel.indexOf(nm);
        if (at !== -1) sel.splice(at, 1); else if (sel.length < 4) sel.push(nm); else U.toast('В Т-Банке обычно можно выбрать до 4 категорий');
        state.cbSel = sel; rerender(); break;
      }
      case 'cb-save':
        if (!state.cbSel || !state.cbSel.length) { U.toast('Отметь хотя бы одну категорию'); break; }
        Store.setSetting('money.cashback', { month: currentMonth(), cats: state.cbSel.slice() });
        U.toast('Запомнил выбор кэшбэка на месяц 💳'); break;
      case 'cb-change': {
        var cb = Store.getSetting('money.cashback', {}) || {};
        state.cbSel = (cb.cats || []).slice();
        Store.setSetting('money.cashback', { month: '', cats: cb.cats || [] }); break;
      }
      case 'weekly-set':
        Store.setSetting('money.weekly', { amount: +b.dataset.amount, groups: WEEK_GROUPS.slice(), since: U.today() });
        U.toast('Недельный бюджет: ' + U.money(+b.dataset.amount) + '. Изменить можно в настройках денег'); break;
      case 'add-debtor': debtorDialog(); break;
      case 'debt-give': debtMove(id, 'give'); break;
      case 'debt-get': debtMove(id, 'get'); break;
      case 'fresh-hide': Store.setSetting('money.freshHidden', b.dataset.date); break;
      case 'sub-add': {
        var s = subscriptionCandidates().find(function (x) { return x.key === b.dataset.key; });
        if (s) {
          Store.add('recurring', { name: s.name, amount: s.amount, day: s.day, category: s.category, sub: s.sub, account: s.account });
          U.toast('«' + s.name + '» теперь регулярный платёж');
        }
        break;
      }
      case 'sub-hide': {
        var hidden = Store.getSetting('money.subsHidden', []).slice();
        hidden.push(b.dataset.key);
        Store.setSetting('money.subsHidden', hidden);
        break;
      }
      case 'export': U.download('dashboard-backup-' + U.today() + '.json', Store.exportJSON()); break;
      case 'restore': restoreBackup(); break;
      case 'forget':
        if (confirm('Забыть все слова, которые дашборд запомнил для категорий?')) Store.setSetting('money.learned', {});
        break;
    }
  }

  function onInput(e) {
    var role = e.target.dataset.role;
    if (role === 'q') {
      state.q = e.target.value;
      updateList();
    } else if (role === 'quick') {
      var pv = wrap.querySelector('#quick-preview');
      if (pv) pv.innerHTML = quickPreview(e.target.value);
    }
  }

  function onChange(e) {
    var role = e.target.dataset.role;
    if (role === 'cat') state.cat = e.target.value;
    else if (role === 'type') state.type = e.target.value;
    else if (role === 'all') state.all = e.target.checked;
    else return;
    updateList();
  }

  function updateList() {
    var el = wrap && wrap.querySelector('#money-list');
    if (el) el.innerHTML = listHtml();
  }

  // Свайп записи влево — удалить (с кнопкой «Отменить»). Вправо — ничего, возвращаем на место.
  function onSwipe(e) {
    var id = e.detail.id;
    if (e.detail.dir !== 'left') { rerender(); return; }
    var rec = find('transactions', id);
    if (!rec) return;
    Store.remove('transactions', id);
    U.toast('Запись удалена', { action: 'Отменить', onAction: function () { Store.restore('transactions', rec); } });
  }

  function onSubmit(e) {
    var kind = e.target.dataset.form;
    if (kind === 'quick') {
      e.preventDefault();
      submitQuick(e.target.querySelector('[data-role="quick"]'));
    } else if (kind === 'budget') {
      e.preventDefault();
      saveBudget(e.target);
    } else if (kind === 'saverule') {
      e.preventDefault();
      var f = e.target;
      var pct = parseFloat(String(f.elements.percent.value).replace(',', '.'));
      if (!(pct > 0 && pct <= 100)) { U.toast('Процент — от 1 до 100'); return; }
      var enabled = (f.querySelector('input[name="enabled"]:checked') || {}).value !== '0';
      Store.setSetting('money.saveRule', Object.assign(saveRule(), { enabled: enabled, percent: pct, piggy: f.elements.piggy ? f.elements.piggy.value : '' }));
      U.toast('Правило сохранено');
    } else if (kind === 'weekly') {
      e.preventDefault();
      var wf = e.target;
      var s = wf.elements.amount.value.trim();
      var amt = s ? U.parseMoney(s) : 0;
      if (isNaN(amt) || amt < 0) { U.toast('Проверь сумму'); return; }
      var groups = Array.prototype.map.call(wf.querySelectorAll('input[name="wgroup"]:checked'), function (i) { return i.value; });
      if (amt && !groups.length) { U.toast('Отметь хотя бы одну группу трат'); return; }
      var prevW = Store.getSetting('money.weekly', null);
      Store.setSetting('money.weekly', amt ? { amount: amt, groups: groups, since: (prevW && prevW.since) || U.today() } : null);
      U.toast(amt ? 'Недельный бюджет сохранён' : 'Недельный бюджет выключен');
    } else if (kind === 'trip-add') {
      e.preventDefault();
      var inp = e.target.elements.text;
      if (inp.value.trim()) tripAdd(e.target.dataset.id, inp.value.trim());
    }
  }

  function saveBudget(form) {
    var totalStr = form.elements.total.value.trim();
    var totalVal = totalStr ? U.parseMoney(totalStr) : 0;
    if (isNaN(totalVal)) { U.toast('Проверь сумму общего бюджета'); return; }
    var limits = {};
    var bad = false;
    Array.prototype.forEach.call(form.querySelectorAll('input[name^="limit:"]'), function (inp) {
      var s = inp.value.trim();
      if (!s) return;
      var v = U.parseMoney(s);
      if (isNaN(v)) bad = true;
      else if (v > 0) limits[inp.name.slice(6)] = v;
    });
    if (bad) { U.toast('Проверь суммы лимитов'); return; }
    Store.setSetting('money.budget', { total: totalVal, limits: limits });
    U.toast('Бюджет сохранён');
  }

  // ---------- Запись: расход / доход / перевод ----------
  // prefill — данные из быстрой строки; learnPhrase — слово, которое запомнить за выбранной категорией.
  function txDialog(tx, prefill) {
    var editing = !!tx;
    var c = getCats();
    var A = getAccounts();
    var p = prefill || {};
    var accOpts = A.map(function (a) { return { value: a.id, label: a.kind === 'piggy' ? '🐷 ' + a.name : a.name }; });
    var regular = A.filter(function (a) { return a.kind !== 'piggy' && a.kind !== 'debt'; });
    var values = editing
      ? { type: tx.type, amount: U.moneyInput(tx.amount), category: tx.category || '', sub: tx.sub || '', account: tx.account, to: tx.to || '', date: tx.date, note: tx.note || '' }
      : {
          type: p.type || 'expense', amount: p.amount ? U.moneyInput(p.amount) : '', category: p.category || '', sub: p.sub || '',
          account: p.account || (regular[0] ? regular[0].id : ''), to: regular[1] ? regular[1].id : '', date: p.date || defaultDate(), note: p.note || ''
        };

    U.formDialog({
      title: editing ? 'Изменить запись' : 'Новая запись',
      values: values,
      fields: function (v) {
        var f = [
          { name: 'type', type: 'seg', label: 'Тип записи', rerender: true, options: [
            { value: 'expense', label: 'Расход' }, { value: 'income', label: 'Доход' }, { value: 'transfer', label: 'Перевод' }] },
          { name: 'amount', type: 'money', label: 'Сумма', autofocus: !editing && !p.amount }
        ];
        if (v.type !== 'transfer') {
          var g = c[v.type].find(function (x) { return x.id === v.category; });
          if (!g) v.category = '';
          f.push({ name: 'category', type: 'chips', label: 'Категория', rerender: true, options: c[v.type].map(function (x) { return { value: x.id, label: catEmoji(x.id) + ' ' + x.name }; }) });
          if (g && g.subs.length) {
            if (v.sub && v.sub.indexOf(g.id + '.') !== 0) v.sub = '';
            f.push({ name: 'sub', type: 'chips', label: 'Уточнить (необязательно)', options: [{ value: '', label: 'Не уточнять' }].concat(g.subs.map(function (s) { return { value: s.id, label: s.name }; })) });
          } else {
            v.sub = '';
          }
          f.push({ name: 'account', type: 'select', label: v.type === 'income' ? 'На счёт' : 'Со счёта', options: accOpts, half: true });
        } else {
          f.push({ name: 'account', type: 'select', label: 'Откуда', options: accOpts, half: true });
          f.push({ name: 'to', type: 'select', label: 'Куда', options: accOpts, half: true });
        }
        f.push({ name: 'date', type: 'date', label: 'Дата', half: true });
        f.push({ name: 'note', type: 'text', label: 'Комментарий', placeholder: 'Необязательно', maxlength: 140 });
        if (!editing && v.type === 'expense') {
          f.push({ name: 'split', type: 'text', label: '👥 Разделить с друзьями (необязательно)', placeholder: 'Имена через запятую: Саша, Лена', maxlength: 120 });
          f.push({ type: 'hint', text: 'Сумма делится поровну: в расходы пойдёт только твоя доля, а на друзей запишутся долги в разделе «Долги».' });
        }
        return f;
      },
      onSubmit: function (v) {
        var amount = U.parseMoney(v.amount);
        // Разделить счёт: моя доля — расход, доли друзей — долги (переводы на их «счета-долги»).
        var names = String(v.split || '').split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (!editing && v.type === 'expense' && names.length && amount > 0 && v.category && v.account && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
          var share = U.round2(amount / (names.length + 1));
          var mine = U.round2(amount - share * names.length);
          var note = (v.note || '').trim();
          Store.add('transactions', { type: 'expense', amount: mine, date: v.date, account: v.account, category: v.category, sub: v.sub || '', to: '',
            note: (note ? note + ' · ' : '') + 'моя доля из ' + U.money(amount) });
          names.forEach(function (n) {
            Store.add('transactions', { type: 'transfer', amount: share, date: v.date, account: v.account, to: ensureDebtor(n), category: '', sub: '',
              note: (note || groupName(v.category)) + ' — доля' });
          });
          U.toast('Разделено на ' + (names.length + 1) + ': твоя доля ' + U.money(mine) + ', ' + names.join(', ') + ' — по ' + U.money(share));
          warnLater(v.category);
          return;
        }
        if (!(amount > 0)) return 'Введи сумму больше нуля';
        if (v.type !== 'transfer' && !v.category) return 'Выбери категорию';
        if (!v.account) return 'Выбери счёт';
        if (v.type === 'transfer' && v.account === v.to) return 'Счета «Откуда» и «Куда» должны быть разными';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return 'Укажи дату';
        var transfer = v.type === 'transfer';
        var rec = {
          type: v.type, amount: amount, date: v.date, note: (v.note || '').trim(), account: v.account,
          category: transfer ? '' : v.category,
          sub: transfer ? '' : (v.sub || ''),
          to: transfer ? v.to : ''
        };
        if (editing) Store.update('transactions', tx.id, rec);
        else {
          var added = Store.add('transactions', rec);
          if (rec.type === 'income') offerSave(added);
        }
        if (!editing && rec.type === 'expense') warnLater(rec.category);

        // Запоминаем выбор: слово из быстрой строки или исправленная категория у записи с комментарием.
        if (!transfer) {
          var entry = { type: rec.type, category: rec.category, sub: rec.sub };
          if (p.learnPhrase) learn(p.learnPhrase, entry);
          else if (editing && rec.note && (tx.category !== rec.category || (tx.sub || '') !== rec.sub)) learn(rec.note, entry);
        }
        U.toast(editing ? 'Запись изменена' : 'Запись добавлена');
      },
      onDelete: editing ? function () {
        if (!confirm('Удалить эту запись?')) return false;
        Store.remove('transactions', tx.id);
        U.toast('Запись удалена');
      } : null
    });
  }

  // ---------- Регулярный платёж ----------
  function expenseCatOptions() {
    var out = [];
    getCats().expense.forEach(function (g) {
      out.push({ value: g.id + '|', label: g.name });
      g.subs.forEach(function (s) { out.push({ value: g.id + '|' + s.id, label: g.name + ' › ' + s.name }); });
    });
    return out;
  }

  function recDialog(r) {
    var editing = !!r;
    var A = getAccounts();
    U.formDialog({
      title: editing ? 'Регулярный платёж' : 'Новый регулярный платёж',
      values: editing
        ? { name: r.name, amount: U.moneyInput(r.amount), day: r.day, cat: r.category + '|' + (r.sub || ''), account: r.account }
        : { name: '', amount: '', day: 1, cat: 'connect|connect.mobile', account: defaultAccount() },
      fields: [
        { name: 'name', type: 'text', label: 'Название', placeholder: 'Например, мобильная связь', autofocus: !editing },
        { name: 'amount', type: 'money', label: 'Сумма', half: true },
        { name: 'day', type: 'number', label: 'Число месяца', min: 1, max: 31, half: true },
        { name: 'cat', type: 'select', label: 'Категория', options: expenseCatOptions() },
        { name: 'account', type: 'select', label: 'Со счёта', options: A.map(function (a) { return { value: a.id, label: a.name }; }) }
      ],
      onSubmit: function (v) {
        var name = (v.name || '').trim();
        var amount = U.parseMoney(v.amount);
        var day = parseInt(v.day, 10);
        if (!name) return 'Введи название';
        if (!(amount > 0)) return 'Введи сумму больше нуля';
        if (!(day >= 1 && day <= 31)) return 'Число месяца — от 1 до 31';
        var parts = String(v.cat).split('|');
        var rec = { name: name, amount: amount, day: day, category: parts[0], sub: parts[1] || '', account: v.account };
        if (editing) Store.update('recurring', r.id, rec);
        else Store.add('recurring', rec);
      },
      onDelete: editing ? function () {
        if (!confirm('Удалить регулярный платёж «' + r.name + '»? Уже внесённые расходы останутся.')) return false;
        Store.remove('recurring', r.id);
      } : null
    });
  }

  function payRecurring(r) {
    if (!r) return;
    var date = recurringDate(r, state.month);
    if (state.month === currentMonth() && date > U.today()) date = U.today();
    Store.add('transactions', {
      type: 'expense', amount: r.amount, category: r.category, sub: r.sub || '', account: r.account,
      date: date, note: r.name, to: '', recurringId: r.id
    });
    U.toast('«' + r.name + '» внесено в расходы');
  }

  // ---------- Копилки ----------
  function piggyDialog(id) {
    var A = getAccounts();
    var p = id ? A.find(function (a) { return a.id === id; }) : null;
    U.formDialog({
      title: p ? 'Копилка' : 'Новая копилка',
      values: {
        name: p ? p.name : '',
        target: p && p.target ? U.moneyInput(p.target) : '',
        targetDate: p && p.targetDate ? p.targetDate : '',
        start: p && p.start ? U.moneyInput(p.start) : '',
        rate: p && p.rate ? String(p.rate).replace('.', ',') : ''
      },
      fields: [
        { name: 'name', type: 'text', label: 'Название', placeholder: 'Например, копилка на ноутбук', maxlength: 40, autofocus: !p },
        { name: 'target', type: 'money', label: 'Сколько накопить', half: true },
        { name: 'targetDate', type: 'date', label: 'К какой дате', half: true },
        { name: 'start', type: 'money', label: 'Сколько уже лежало до начала учёта', half: true },
        { name: 'rate', type: 'text', label: 'Ставка, % годовых', placeholder: 'например, 6', maxlength: 6, half: true },
        { type: 'hint', text: 'Если копилка — это счёт в банке, впиши остаток на дату начала первой загруженной выписки. Тогда баланс в дашборде совпадёт с банковским.' }
      ],
      onSubmit: function (v) {
        var name = (v.name || '').trim();
        var target = v.target ? U.parseMoney(v.target) : 0;
        var start = v.start ? U.parseMoney(v.start) : 0;
        if (!name) return 'Введи название';
        if (isNaN(target)) return 'Проверь сумму цели';
        if (isNaN(start)) return 'Проверь сумму «уже лежало»';
        var rate = v.rate ? parseFloat(String(v.rate).replace(',', '.')) : 0;
        if (isNaN(rate) || rate < 0 || rate > 50) return 'Ставка — число от 0 до 50';
        if (p) { p.name = name; p.target = target; p.start = start; p.targetDate = v.targetDate || ''; p.rate = rate; }
        else A.push({ id: 'p' + U.uid(), name: name, kind: 'piggy', target: target, targetDate: v.targetDate || '', start: start, rate: rate });
        Store.setSetting('money.accounts.v2', A);
      },
      onDelete: p ? function () { return deleteAcc(p.id) ? undefined : false; } : null
    });
  }

  function piggyMove(id, dir) {
    var p = accs().find(function (a) { return a.id === id; });
    if (!p) return;
    var saved = balances()[id] || 0;
    var regular = regularAccounts();
    U.formDialog({
      title: (dir === 'in' ? 'Пополнить: ' : 'Снять: ') + p.name,
      submitLabel: dir === 'in' ? 'Пополнить' : 'Снять',
      values: { amount: '', account: regular[0] ? regular[0].id : '', date: U.today() },
      fields: [
        { name: 'amount', type: 'money', label: 'Сумма', autofocus: true },
        { name: 'account', type: 'select', label: dir === 'in' ? 'С какого счёта' : 'На какой счёт', half: true, options: regular.map(function (a) { return { value: a.id, label: a.name }; }) },
        { name: 'date', type: 'date', label: 'Дата', half: true },
        { type: 'hint', text: 'Сейчас в копилке ' + U.money(saved) + '.' }
      ],
      onSubmit: function (v) {
        var amount = U.parseMoney(v.amount);
        if (!(amount > 0)) return 'Введи сумму больше нуля';
        if (dir === 'out' && amount > saved) return 'В копилке только ' + U.money(saved);
        if (!v.account) return 'Выбери счёт';
        Store.add('transactions', dir === 'in'
          ? { type: 'transfer', amount: amount, account: v.account, to: id, date: v.date, note: '', category: '', sub: '' }
          : { type: 'transfer', amount: amount, account: id, to: v.account, date: v.date, note: '', category: '', sub: '' });
        var target = Number(p.target) || 0;
        if (dir === 'in' && target && saved < target && saved + amount >= target) {
          if (window.FX) FX.confetti();
          U.toast('Цель «' + p.name + '» достигнута! 🎉');
        } else {
          U.toast(dir === 'in' ? 'В копилку отложено ' + U.money(amount) : 'Из копилки снято ' + U.money(amount));
        }
      }
    });
  }

  // ---------- Категории ----------
  function groupDialog(type, id) {
    var c = getCats();
    var g = id ? c[type].find(function (x) { return x.id === id; }) : null;
    U.formDialog({
      title: g ? 'Переименовать группу' : (type === 'income' ? 'Новая группа доходов' : 'Новая группа расходов'),
      values: { name: g ? g.name : '' },
      fields: [{ name: 'name', type: 'text', label: 'Название', maxlength: 40, autofocus: true }],
      onSubmit: function (v) {
        var name = (v.name || '').trim();
        if (!name) return 'Введи название';
        var dup = c[type].some(function (x) { return x.id !== id && MD.norm(x.name) === MD.norm(name); });
        if (dup) return 'Такая группа уже есть';
        if (g) g.name = name;
        else {
          // «Другое» держим в конце списка.
          var gi = { id: 'g' + U.uid(), name: name, subs: [] };
          var otherIdx = c[type].findIndex(function (x) { return x.id === 'other-exp' || x.id === 'other-inc'; });
          if (otherIdx === -1) c[type].push(gi); else c[type].splice(otherIdx, 0, gi);
        }
        Store.setSetting('money.cats.v2', c);
      }
    });
  }

  function usageCount(field, id) {
    return allTx().filter(function (t) { return t[field] === id; }).length +
      Store.list('recurring').filter(function (r) { return r[field] === id; }).length;
  }

  function deleteGroup(type, id) {
    var c = getCats();
    var g = c[type].find(function (x) { return x.id === id; });
    if (!g || g.locked) return;
    var used = usageCount('category', id);
    if (used) {
      alert('В группе «' + g.name + '» есть записи (' + used + '). Её можно переименовать, но не удалить — иначе записи потеряют категорию.');
      return;
    }
    if (!confirm('Удалить группу «' + g.name + '» вместе с подкатегориями?')) return;
    c[type] = c[type].filter(function (x) { return x.id !== id; });
    var b = getBudget();
    delete b.limits[id];
    Store.setSetting('money.budget', b);
    Store.setSetting('money.cats.v2', c);
  }

  function subDialog(type, groupId, subId) {
    var c = getCats();
    var g = c[type].find(function (x) { return x.id === groupId; });
    if (!g) return;
    var s = subId ? g.subs.find(function (x) { return x.id === subId; }) : null;
    U.formDialog({
      title: s ? 'Подкатегория' : 'Новая подкатегория в «' + g.name + '»',
      values: { name: s ? s.name : '' },
      fields: [{ name: 'name', type: 'text', label: 'Название', maxlength: 40, autofocus: true }],
      onSubmit: function (v) {
        var name = (v.name || '').trim();
        if (!name) return 'Введи название';
        var dup = g.subs.some(function (x) { return x.id !== subId && MD.norm(x.name) === MD.norm(name); });
        if (dup) return 'Такая подкатегория уже есть';
        if (s) s.name = name;
        else g.subs.push({ id: g.id + '.s' + U.uid(), name: name });
        Store.setSetting('money.cats.v2', c);
      },
      onDelete: s ? function () {
        var used = usageCount('sub', s.id);
        if (used) {
          alert('В подкатегории «' + s.name + '» есть записи (' + used + '). Её можно переименовать, но не удалить.');
          return false;
        }
        if (!confirm('Удалить подкатегорию «' + s.name + '»?')) return false;
        g.subs = g.subs.filter(function (x) { return x.id !== s.id; });
        Store.setSetting('money.cats.v2', c);
      } : null
    });
  }

  // ---------- Счета ----------
  function accDialog(id) {
    var A = getAccounts();
    var acc = id ? A.find(function (a) { return a.id === id; }) : null;
    U.formDialog({
      title: acc ? 'Счёт' : 'Новый счёт',
      values: { name: acc ? acc.name : '', start: acc ? U.moneyInput(acc.start) : '' },
      fields: [
        { name: 'name', type: 'text', label: 'Название', placeholder: 'Например, Сбер или накопительный', maxlength: 40, autofocus: !acc },
        { name: 'start', type: 'money', label: 'Начальный остаток' },
        { type: 'hint', text: 'Если на счёте долг (например, кредитка), можно ввести минус.' }
      ],
      onSubmit: function (v) {
        var name = (v.name || '').trim();
        var start = v.start ? U.parseMoney(v.start, true) : 0;
        if (!name) return 'Введи название';
        if (isNaN(start)) return 'Проверь начальный остаток';
        if (acc) { acc.name = name; acc.start = start; }
        else A.push({ id: 'a' + U.uid(), name: name, start: start });
        Store.setSetting('money.accounts.v2', A);
      }
    });
  }

  function deleteAcc(id) {
    var A = getAccounts();
    var acc = A.find(function (a) { return a.id === id; });
    if (!acc) return;
    if (acc.kind !== 'piggy' && A.filter(function (a) { return a.kind !== 'piggy'; }).length <= 1) {
      alert('Должен остаться хотя бы один обычный счёт.');
      return;
    }
    var used = allTx().some(function (t) { return t.account === id || t.to === id; }) ||
      Store.list('recurring').some(function (r) { return r.account === id; });
    if (used) { alert('По «' + acc.name + '» есть записи. Можно переименовать, но не удалить.'); return false; }
    if (!confirm('Удалить «' + acc.name + '»?')) return false;
    Store.setSetting('money.accounts.v2', A.filter(function (a) { return a.id !== id; }));
    return true;
  }

  function restoreBackup() {
    U.pickFile('.json,application/json', function (text) {
      if (!confirm('Заменить все текущие данные данными из файла? Текущие записи будут потеряны.')) return;
      try {
        Store.importJSON(text);
        U.toast('Данные загружены из копии');
      } catch (err) {
        alert('Не получилось загрузить файл: ' + err.message);
      }
    });
  }

  // ============================================================
  //  Импорт выписки Т-Банка
  // ============================================================
  // Модуль чтения PDF (pdf.js) подгружается из интернета только при первом импорте PDF.
  // Сам файл никуда не отправляется — он читается прямо в браузере.
  var PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var pdfjsPromise = null;

  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsPromise) {
      pdfjsPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = PDFJS_URL;
        s.onload = function () {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
          resolve(window.pdfjsLib);
        };
        s.onerror = function () {
          pdfjsPromise = null;
          reject(new Error('не загрузился модуль чтения PDF. Проверь интернет и попробуй ещё раз.'));
        };
        document.head.appendChild(s);
      });
    }
    return pdfjsPromise;
  }

  // Текст всех страниц PDF с координатами — для MoneyData.parseTBankPdf.
  function readPdfPages(buffer) {
    return loadPdfJs().then(function (lib) {
      return lib.getDocument({ data: new Uint8Array(buffer) }).promise;
    }).then(function (doc) {
      var jobs = [];
      for (var i = 1; i <= doc.numPages; i++) {
        jobs.push(doc.getPage(i).then(function (page) {
          return page.getTextContent().then(function (tc) {
            return {
              width: page.view[2],
              items: tc.items.filter(function (it) { return it.str && it.str.trim(); })
                .map(function (it) { return { x: it.transform[4], y: it.transform[5], s: it.str }; })
            };
          });
        }));
      }
      return Promise.all(jobs);
    });
  }

  function isPdf(buffer) {
    var b = new Uint8Array(buffer.slice(0, 5));
    return String.fromCharCode.apply(null, b) === '%PDF-';
  }

  // Разобрать файл выписки (PDF или CSV) → список операций.
  function parseStatement(buffer) {
    if (isPdf(buffer)) return readPdfPages(buffer).then(MD.parseTBankPdf);
    return Promise.resolve().then(function () { return MD.parseTBank(U.decodeText(buffer)); });
  }

  function importTBank() {
    U.pickFile('.pdf,.csv,application/pdf,text/csv', function (buf) {
      U.toast('Читаю выписку…');
      parseStatement(buf).then(function (ops) {
        if (!ops.length) { alert('В файле не нашлось операций. Это точно выписка Т-Банка?'); return; }
        importDialog(ops);
      }).catch(function (err) {
        alert('Не получилось прочитать выписку: ' + err.message);
      });
    }, true);
  }

  function choiceKey(s) {
    return s.kind === 't' ? 't:' + s.to : 'c:' + s.type + ':' + s.category + ':' + (s.sub || '');
  }

  function choiceOptions(sign, target) {
    var c = getCats();
    var type = sign < 0 ? 'expense' : 'income';
    var html = '';
    c[type].forEach(function (g) {
      html += '<optgroup label="' + esc(g.name) + '">';
      html += '<option value="c:' + type + ':' + esc(g.id) + ':">' + esc(g.name) + '</option>';
      g.subs.forEach(function (s) {
        html += '<option value="c:' + type + ':' + esc(g.id) + ':' + esc(s.id) + '">' + esc(g.name) + ' › ' + esc(s.name) + '</option>';
      });
      html += '</optgroup>';
    });
    var others = getAccounts().filter(function (a) { return a.id !== target; });
    if (others.length) {
      html += '<optgroup label="Перевод между своими счетами">';
      others.forEach(function (a) {
        html += '<option value="t:' + esc(a.id) + '">' + (sign < 0 ? 'Перевод → ' : 'Перевод ← ') + esc(a.name) + '</option>';
      });
      html += '</optgroup>';
    }
    return html;
  }

  function importDialog(ops) {
    var A = getAccounts();
    var regular = A.filter(function (a) { return a.kind !== 'piggy' && a.kind !== 'debt'; });
    var target = (regular.find(function (a) { return /т-банк|тбанк|тинькофф|tbank/i.test(a.name); }) || regular[0]).id;
    var existing = {};
    allTx().forEach(function (t) { if (t.importKey) existing[t.importKey] = true; });
    var learned = getLearned();

    ops.sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
    // Операции «одного вида» (тот же договор или то же описание) — чтобы применять выбор ко всем сразу.
    function groupKeyOf(op) {
      var contract = MD.contractOf(op.description);
      return contract ? 'договор:' + contract : MD.norm(op.description) + (op.amount < 0 ? '|-' : '|+');
    }
    var rows = ops.map(function (op) {
      var s = MD.suggestForBankOp(op, { learned: learned, accounts: A, account: target });
      var key = choiceKey(s);
      var dup = !!existing[op.importKey];
      return { op: op, choice: key, initial: key, review: s.review, checked: !dup, dup: dup, touched: false, group: groupKeyOf(op) };
    });

    var dlg = document.createElement('dialog');
    dlg.className = 'sheet sheet--wide';

    function rowsHtml() {
      var optNeg = choiceOptions(-1, target), optPos = choiceOptions(1, target);
      return rows.map(function (r, i) {
        var opts = (r.op.amount < 0 ? optNeg : optPos).replace('value="' + esc(r.choice) + '"', 'value="' + esc(r.choice) + '" selected');
        var flag = r.dup ? '<span class="imp-flag">уже есть</span>' : r.review ? '<span class="imp-flag imp-flag--review">проверь категорию</span>' : '';
        return (
          '<div class="imp-row' + (r.dup ? ' is-dup' : '') + '" data-i="' + i + '">' +
            '<input type="checkbox" data-role="imp-check" aria-label="Импортировать"' + (r.checked ? ' checked' : '') + '>' +
            '<div class="imp-main"><div class="imp-desc" title="' + esc(r.op.description) + '">' + esc(r.op.note || r.op.description || r.op.bankCategory || 'Операция') + '</div>' +
              '<div class="imp-meta">' + U.dayShort(r.op.date) + (r.op.bankCategory ? ' · ' + esc(r.op.bankCategory) : '') + ' ' + flag + '</div></div>' +
            '<div class="imp-amt' + (r.op.amount > 0 ? ' tx-amt--income' : '') + '">' + (r.op.amount > 0 ? '+' : '−') + U.money(Math.abs(r.op.amount)) + '</div>' +
            '<select data-role="imp-cat" aria-label="Категория">' + opts + '</select>' +
          '</div>'
        );
      }).join('');
    }

    function stats() {
      var dups = rows.filter(function (r) { return r.dup; }).length;
      var review = rows.filter(function (r) { return r.review && r.checked; }).length;
      var n = rows.filter(function (r) { return r.checked; }).length;
      dlg.querySelector('.imp-stats').textContent = 'Найдено ' + rows.length + ' · уже было ' + dups + ' · выбрано ' + n +
        (review ? ' · проверь категорию у ' + review : '');
      var btn = dlg.querySelector('[data-imp-go]');
      btn.textContent = 'Импортировать ' + n;
      btn.disabled = !n;
    }

    dlg.innerHTML =
      '<form class="sheet-form" novalidate>' +
        '<div class="sheet-head"><h2>Импорт выписки Т-Банка</h2>' +
          '<button type="button" class="icon-x" data-close aria-label="Закрыть"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
        '<div class="imp-top">' +
          '<label class="field imp-acc"><span class="field-label">Куда записать операции</span><select data-role="imp-acc">' +
            regular.map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === target ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('') +
          '</select></label>' +
          '<p class="imp-stats"></p>' +
        '</div>' +
        '<div class="imp-list">' + rowsHtml() + '</div>' +
        '<div class="sheet-foot"><span class="field-hint">Исправленные категории дашборд запомнит.</span><span class="spacer"></span>' +
          '<button type="button" class="btn" data-close>Отмена</button>' +
          '<button type="submit" class="btn btn-primary" data-imp-go>Импортировать</button></div>' +
      '</form>';

    var list = dlg.querySelector('.imp-list');
    stats();

    dlg.addEventListener('change', function (e) {
      var role = e.target.dataset.role;
      if (role === 'imp-acc') {
        target = e.target.value;
        list.innerHTML = rowsHtml();
        return;
      }
      var rowEl = e.target.closest('.imp-row');
      if (!rowEl) return;
      var r = rows[+rowEl.dataset.i];
      if (role === 'imp-check') r.checked = e.target.checked;
      if (role === 'imp-cat') {
        r.choice = e.target.value;
        r.review = false;
        r.touched = true;
        // Применяем тот же выбор к таким же операциям, которые ещё не меняли вручную.
        var isTransfer = r.choice.charAt(0) === 't';
        var applied = 0;
        rows.forEach(function (o) {
          if (o === r || o.touched || o.dup || o.group !== r.group) return;
          if (!isTransfer && (o.op.amount < 0) !== (r.op.amount < 0)) return;
          o.choice = r.choice;
          o.review = false;
          applied++;
        });
        if (applied) {
          var scroll = list.scrollTop;
          list.innerHTML = rowsHtml();
          list.scrollTop = scroll;
          U.toast('Так же отмечено ещё ' + applied + ' ' + U.plural(applied, 'операция', 'операции', 'операций'));
        } else {
          var fl = rowEl.querySelector('.imp-flag--review');
          if (fl) fl.remove();
        }
      }
      stats();
    });

    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
    });
    dlg.addEventListener('close', function () { dlg.remove(); });

    dlg.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var recs = [];
      var newLearned = getLearned();
      var learnedChanged = false;
      rows.forEach(function (r) {
        if (!r.checked) return;
        var op = r.op;
        var amount = Math.abs(op.amount);
        var base = { amount: amount, date: op.date, note: op.note || op.description, importKey: op.importKey, bankCategory: op.bankCategory };
        var parts = r.choice.split(':');
        if (parts[0] === 't') {
          recs.push(Object.assign(base, op.amount < 0
            ? { type: 'transfer', account: target, to: parts[1], category: '', sub: '' }
            : { type: 'transfer', account: parts[1], to: target, category: '', sub: '' }));
        } else {
          recs.push(Object.assign(base, { type: parts[1], category: parts[2], sub: parts[3] || '', account: target, to: '' }));
        }
        if (r.choice !== r.initial && op.description) {
          // Переводы на договор запоминаем по номеру договора, остальное — по описанию.
          var keys = MD.learnKeys(op);
          newLearned[parts[0] === 't' ? keys[0] : keys[keys.length - 1]] = parts[0] === 't'
            ? { kind: 't', to: parts[1] }
            : { type: parts[1], category: parts[2], sub: parts[3] || '' };
          learnedChanged = true;
        }
      });
      if (learnedChanged) Store.setSetting('money.learned', newLearned);
      Store.addMany('transactions', recs);
      dlg.close();
      U.toast('Импортировано: ' + recs.length + ' ' + U.plural(recs.length, 'операция', 'операции', 'операций'));
    });

    document.body.appendChild(dlg);
    dlg.showModal();
  }

  // ---------- Для сводки ----------
  function summary() {
    var list = inMonth(allTx(), currentMonth());
    var b = getBudget();
    return {
      value: U.money(total(list, 'expense')),
      hint: b.total ? 'В бюджете осталось ' + U.money(Math.max(0, b.total - budgetSpent(list))) : 'Расходы за месяц'
    };
  }

  // Короткая картина для Сводки.
  function overview() {
    var key = currentMonth();
    var list = inMonth(allTx(), key);
    var b = getBudget();
    var spent = budgetSpent(list);
    var bal = balances();
    var mon = U.toDate(U.today());
    mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
    var monIso = U.iso(mon);
    return {
      month: key,
      budget: b.total,
      spent: spent,
      left: b.total ? U.round2(b.total - spent) : null,
      expenses: total(list, 'expense'),
      income: total(list, 'income'),
      weekExpenses: total(allTx().filter(function (t) { return t.date >= monIso && t.date <= U.today(); }), 'expense'),
      accounts: accs().filter(function (a) { return a.kind !== 'debt'; }).map(function (a) { return { id: a.id, name: a.name, piggy: a.kind === 'piggy', balance: bal[a.id] || 0 }; }),
      debts: debtors().map(function (a) { return { id: a.id, name: a.name, balance: bal[a.id] || 0 }; }),
      recurring: Store.list('recurring').map(function (r) {
        var date = recurringDate(r, key);
        var paid = allTx().some(function (t) { return t.recurringId === r.id && U.monthKey(t.date) === key; });
        return { id: r.id, name: r.name, amount: r.amount, date: date, paid: paid };
      })
    };
  }

  // Предупреждения для Сводки: лимиты, бюджет, старые долги, давняя выписка.
  function alerts() {
    var out = [];
    var key = currentMonth();
    var list = inMonth(allTx(), key);
    var b = getBudget();
    Object.keys(b.limits).forEach(function (id) {
      var lim = Number(b.limits[id]) || 0;
      if (!lim) return;
      var spent = list.reduce(function (s, t) { return s + (t.type === 'expense' && t.category === id ? t.amount : 0); }, 0);
      var pct = Math.round(spent / lim * 100);
      if (pct >= 80) out.push({ emoji: pct >= 100 ? '⛔' : '⚠️', text: groupName(id) + ': ' + (pct >= 100 ? 'лимит превышен' : pct + '% лимита') + ' — ' + U.money(spent) + ' из ' + U.money(lim), tab: 'money', level: pct >= 100 ? 'bad' : 'warn' });
    });
    if (b.total) {
      var p2 = Math.round(budgetSpent(list) / b.total * 100);
      if (p2 >= 80) out.push({ emoji: p2 >= 100 ? '⛔' : '⚠️', text: 'Бюджет месяца: потрачено ' + p2 + '%', tab: 'money', level: p2 >= 100 ? 'bad' : 'warn' });
    }
    var bal = balances(), txs = allTx();
    debtors().forEach(function (p) {
      var bb = U.round2(bal[p.id] || 0);
      if (!bb) return;
      var last = txs.filter(function (t) { return t.account === p.id || t.to === p.id; }).reduce(function (m, t) { return t.date > m ? t.date : m; }, '');
      var age = last ? Math.round((U.toDate(U.today()) - U.toDate(last)) / 864e5) : 0;
      if (age > 30) out.push({ emoji: '🤝', text: (bb > 0 ? p.name + ' должен тебе ' + U.money(bb) : 'Ты должен ' + p.name + ' ' + U.money(-bb)) + ' уже ' + age + ' ' + U.plural(age, 'день', 'дня', 'дней'), tab: 'money', level: 'warn' });
    });
    var imported = txs.filter(function (t) { return t.importKey; });
    if (imported.length) {
      var lastImp = imported.reduce(function (m, t) { return t.date > m ? t.date : m; }, '');
      var days = Math.round((U.toDate(U.today()) - U.toDate(lastImp)) / 864e5);
      if (days > 7) out.push({ emoji: '📄', text: 'Выписка загружена по ' + U.toDate(lastImp).getDate() + ' ' + U.monthGen(lastImp) + ' — пора обновить', tab: 'money', level: 'info' });
    }
    var w = weekly();
    if (w && w.spent / w.amount >= 0.85) out.push({ emoji: w.left < 0 ? '⛔' : '🗓️', text: 'Бюджет недели: ' + (w.left < 0 ? 'перерасход ' + U.money(-w.left) : 'осталось ' + U.money(w.left) + ' до воскресенья'), tab: 'money', level: w.left < 0 ? 'bad' : 'warn' });
    var cb = Store.getSetting('money.cashback', {}) || {};
    if (new Date().getDate() <= 5 && cb.month !== key && txs.length) out.push({ emoji: '💳', text: 'Новый месяц — выбери категории кэшбэка в Т-Банке (подсказка в «Деньгах»)', tab: 'money', level: 'info' });
    insights().forEach(function (i) { if (i.level === 'warn') out.push({ emoji: i.emoji, text: i.text, tab: 'money', level: 'warn' }); });
    return out;
  }

  // Для единой строки: разобрать и добавить запись (или открыть форму, если категория неизвестна).
  function quickParse(text) { return parseQuick(text); }
  function quickAdd(text) {
    var p = parseQuick(text);
    if (!p || !(p.amount > 0)) return false;
    var account = p.account || defaultAccount();
    var date = p.date || U.today();
    if (p.matched) {
      var rec = Store.add('transactions', { type: p.type, amount: p.amount, category: p.category, sub: p.sub, account: account, to: '', date: date, note: cleanNote(p) });
      U.toast('Добавлено: ' + catFull(p.category, p.sub) + ' · ' + U.money(p.amount));
      if (p.type === 'expense') warnLater(p.category);
      if (p.type === 'income') offerSave(rec);
    } else {
      txDialog(null, { type: p.type, amount: p.amount, date: date, account: account, note: p.note, learnPhrase: p.note });
    }
    return true;
  }

  // ---------- Перетащи выписку в окно ----------
  var dragDepth = 0, dropOverlay = null;
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; }
  function overlay(show) {
    if (show && !dropOverlay) {
      dropOverlay = document.createElement('div');
      dropOverlay.className = 'drop-overlay';
      dropOverlay.innerHTML = '<div class="drop-box"><span class="drop-emoji">📄</span><b>Отпусти, чтобы загрузить выписку</b><span>PDF из приложения Т-Банка или CSV</span></div>';
      document.body.appendChild(dropOverlay);
    }
    if (dropOverlay) dropOverlay.classList.toggle('is-on', !!show);
  }
  document.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; overlay(true); });
  document.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('dragleave', function (e) { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) overlay(false); });
  document.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    overlay(false);
    var file = e.dataTransfer.files[0];
    if (!file || !/\.(pdf|csv)$/i.test(file.name)) { U.toast('Нужен файл выписки: PDF или CSV'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      if (location.hash !== '#money') location.hash = '#money';
      U.toast('Читаю выписку…');
      parseStatement(reader.result).then(function (ops) {
        if (!ops.length) { alert('В файле не нашлось операций. Это точно выписка Т-Банка?'); return; }
        importDialog(ops);
      }).catch(function (err) { alert('Не получилось прочитать выписку: ' + err.message); });
    };
    reader.readAsArrayBuffer(file);
  });
  function openTx(id) { var t = find('transactions', id); if (t) txDialog(t); }

  // showImport — открыть окно импорта для уже разобранных операций (используется при проверке).
  window.Tabs.money = {
    render: render, summary: summary, overview: overview, showImport: importDialog, parseStatement: parseStatement,
    quickParse: quickParse, quickAdd: quickAdd, openTx: openTx, catFull: catFull, catEmoji: catEmoji, txTitle: txTitle, alerts: alerts,
    newTx: function (prefill) { txDialog(null, prefill); },
    weekly: weekly,
    offerSave: offerSave,
    importStatement: function () { importTBank(); }
  };
})();
