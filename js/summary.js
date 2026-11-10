/* ============================================================
   Вкладка «Сводка»: главное из всех разделов на одном экране.

   Порядок блоков: Сегодня → Сроки на 7 дней → Деньги → Неделя в цифрах.
   Дела со сроками собираются из всех вкладок; галочки можно ставить прямо здесь.
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var esc = U.esc;
  window.Tabs = window.Tabs || {};

  var WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  function ico(path) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
  var I = {
    book: ico('<path d="M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5Zm0 0A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
    work: ico('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M3 12.5h18"/>'),
    arrow: ico('<path d="m9 6 6 6-6 6"/>'),
    alert: ico('<path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/>'),
    piggy: ico('<path d="M5 11a7 6 0 0 1 12-3h2v3l-1.5 1.5V16H15v2h-2.5v-2h-3v2H7v-2.5A6 6 0 0 1 5 11Z"/><path d="M14.5 10.5v.01"/>')
  };

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function nowHM() { var d = new Date(); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); }
  function addDays(date, n) { var d = U.toDate(date); d.setDate(d.getDate() + n); return U.iso(d); }
  function daysUntil(date) { return Math.round((U.toDate(date) - U.toDate(U.today())) / 864e5); }
  function dayName(date) {
    var n = daysUntil(date), d = U.toDate(date);
    var label = WD_FULL[d.getDay()] + ', ' + d.getDate() + ' ' + U.monthGen(date);
    return n === 1 ? 'Завтра · ' + label : cap(label);
  }

  // ============================================================
  //  Все дела со сроками из всех вкладок
  // ============================================================
  function agenda() {
    var items = [];
    Store.list('work.tasks').forEach(function (t) {
      if (t.done || !t.due) return;
      items.push({ kind: 'task', id: t.id, title: t.title, date: t.due, source: 'Работа · ' + (t.job === 'remote' ? 'дистанционная' : 'очная'), tab: 'work', check: true, important: t.important });
    });
    Store.list('study.homework').forEach(function (h) {
      if (h.done || !h.due) return;
      items.push({ kind: 'hw', id: h.id, title: h.title, date: h.due, source: 'Задание' + (h.subject ? ' · ' + h.subject : ''), tab: 'study', check: true });
    });
    Store.list('study.events').forEach(function (e) {
      if (e.date) items.push({ kind: 'event', id: e.id, title: e.title, date: e.date, time: e.time, source: 'Мероприятие' + (e.role ? ' · ' + e.role.toLowerCase() : ''), tab: 'study', check: false });
      (e.todo || []).forEach(function (t) {
        if (t.done || !t.due) return;
        items.push({ kind: 'todo', id: t.id, parent: e.id, title: t.text, date: t.due, source: 'Подготовка · ' + e.title, tab: 'study', check: true });
      });
    });
    if (Tabs.study && Tabs.study.thesisProgress) {
      Tabs.study.thesisProgress().stages.forEach(function (s) {
        if (s.done || !s.due) return;
        items.push({ kind: 'stage', id: s.id, title: s.name, date: s.due, source: 'ВКР', tab: 'study', check: true });
      });
    }
    var kinds = (Tabs.study && Tabs.study.examKinds) || {};
    Store.list('study.exams').forEach(function (e) {
      if (e.result || !e.date) return;
      items.push({ kind: 'exam', id: e.id, title: e.subject, date: e.date, source: kinds[e.kind] || 'Сессия', tab: 'study', check: false });
    });
    if (Tabs.money && Tabs.money.overview) {
      Tabs.money.overview().recurring.forEach(function (r) {
        if (r.paid) return;
        items.push({ kind: 'pay', id: r.id, title: r.name + ' · ' + U.money(r.amount), date: r.date, source: 'Регулярный платёж', tab: 'money', check: false });
      });
    }
    return items.sort(function (a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); });
  }

  function itemHtml(it, showDate) {
    var late = it.date < U.today();
    var meta = esc(it.source);
    if (showDate && late) meta = '<span class="is-late">просрочено · ' + WD[U.toDate(it.date).getDay()] + ' ' + U.toDate(it.date).getDate() + ' ' + U.monthGen(it.date) + '</span> · ' + meta;
    if (it.time) meta = esc(it.time) + ' · ' + meta;
    var body =
      '<span class="ag-main"><span class="ag-title">' + (it.important ? '★ ' : '') + esc(it.title) + '</span><span class="ag-meta">' + meta + '</span></span>';
    if (it.check) {
      return '<li class="ag-item"><label class="ag-check"><input type="checkbox" data-role="ag-done" data-kind="' + it.kind + '" data-id="' + esc(it.id) + '"' +
        (it.parent ? ' data-parent="' + esc(it.parent) + '"' : '') + ' aria-label="Готово: ' + esc(it.title) + '"></label>' +
        '<a class="ag-link" href="#' + it.tab + '">' + body + '</a></li>';
    }
    return '<li class="ag-item"><span class="ag-dot ag-dot--' + it.kind + '"></span><a class="ag-link" href="#' + it.tab + '">' + body + I.arrow + '</a></li>';
  }

  function todayLeft() {
    var today = U.today();
    return agenda().filter(function (it) { return it.check && it.date <= today; }).length;
  }

  function markDone(kind, id, parent) {
    var before = todayLeft();
    var now = new Date().toISOString();
    if (kind === 'task' && Tabs.work && Tabs.work.completeTask) {
      Tabs.work.completeTask(id);
      if (before > 0 && todayLeft() === 0) { if (window.FX) FX.confetti(); U.toast('Все дела на сегодня сделаны! 🎉'); }
      return;
    }
    if (kind === 'task') Store.update('work.tasks', id, { done: true, doneAt: now });
    else if (kind === 'hw') Store.update('study.homework', id, { done: true, doneAt: now });
    else if (kind === 'todo') {
      var e = Store.list('study.events').find(function (x) { return x.id === parent; });
      if (e) Store.update('study.events', parent, { todo: (e.todo || []).map(function (t) { return t.id === id ? Object.assign({}, t, { done: true }) : t; }) });
    } else if (kind === 'stage' && Tabs.study) {
      var th = JSON.parse(JSON.stringify(Store.getSetting('study.thesis', null) || {}));
      if (!th.stages) th.stages = Tabs.study.thesisProgress().stages;
      th.stages.forEach(function (s) { if (s.id === id) s.done = true; });
      Tabs.study.saveThesis(th);
      if (window.FX) FX.confetti();
    }
    if (before > 0 && todayLeft() === 0) {
      if (window.FX) FX.confetti();
      U.toast('Все дела на сегодня сделаны! 🎉');
    } else {
      U.toast('Готово!');
    }
  }

  // ============================================================
  //  Шапка: приветствие, погода, цифры дня
  // ============================================================
  // Время суток для шапки: утро / день / вечер / ночь.
  function timeOfDay() {
    var h = new Date().getHours();
    return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'night';
  }
  // Анимация погоды в шапке.
  function weatherFx(w) {
    var t = w.text || '';
    if (/снег/.test(t)) return 'wx-snow';
    if (/дожд|ливен|морос|гроз/.test(t)) return 'wx-rain';
    return '';
  }

  // Быстрые кнопки под шапкой.
  var QA = [['tx', '💸', 'Трата'], ['task', '✅', 'Задача'], ['hw', '📚', 'Задание'], ['time', '⏱️', 'Время'], ['import', '📄', 'Выписка']];
  function quickActionsHtml() {
    return '<div class="qa">' + QA.map(function (a) {
      return '<button type="button" class="qa-btn" data-qa="' + a[0] + '"><span class="qa-ico">' + a[1] + '</span><span class="qa-label">' + a[2] + '</span></button>';
    }).join('') + '</div>';
  }
  function runQuickAction(k) {
    var T = window.Tabs;
    if (k === 'tx' && T.money) T.money.newTx();
    else if (k === 'task' && T.work) T.work.newTask();
    else if (k === 'hw' && T.study) T.study.newHomework();
    else if (k === 'time' && T.time) T.time.newEntry();
    else if (k === 'import' && T.money) T.money.importStatement();
  }

  // ============================================================
  //  Отчёт недели (воскресенье и понедельник, или по кнопке)
  // ============================================================
  var showWeekReport = false;
  function mondayOf(date) { var d = U.toDate(date); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return U.iso(d); }

  function weekReportVisible() {
    if (showWeekReport) return true;
    var wd = new Date().getDay();
    if (wd !== 0 && wd !== 1) return false;
    var hidden = '';
    try { hidden = localStorage.getItem('dash:weekreport-hidden') || ''; } catch (e) {}
    return hidden !== mondayOf(U.today());
  }

  function weekReportHtml(items) {
    if (!weekReportVisible()) return '';
    var today = U.today();
    var isMonday = new Date().getDay() === 1;
    var thisMon = mondayOf(today);
    var from = isMonday ? addDays(thisMon, -7) : thisMon;
    var to = isMonday ? addDays(thisMon, -1) : today;
    var planFrom = isMonday ? thisMon : addDays(thisMon, 7);
    var planTo = addDays(planFrom, 6);
    var T = window.Tabs;

    var tx = Store.list('transactions').filter(function (t) { return t.date >= from && t.date <= to; });
    var spent = U.round2(tx.filter(function (t) { return t.type === 'expense'; }).reduce(function (s, t) { return s + t.amount; }, 0));
    var income = U.round2(tx.filter(function (t) { return t.type === 'income'; }).reduce(function (s, t) { return s + t.amount; }, 0));
    var byCat = {};
    tx.forEach(function (t) { if (t.type === 'expense') byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
    var topCat = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; })[0];
    function inRange(iso) { var d = (iso || '').slice(0, 10); return d >= from && d <= to; }
    var closed = Store.list('work.tasks').filter(function (t) { return t.done && inRange(t.doneAt); }).length +
      Store.list('study.homework').filter(function (h) { return h.done && inRange(h.doneAt); }).length;
    var minutes = T.time && T.time.rangeMinutes ? T.time.rangeMinutes(from, to) : 0;
    var tcat = T.time && T.time.rangeByCat ? T.time.rangeByCat(from, to) : {};
    var topTime = Object.keys(tcat).sort(function (a, b) { return tcat[b] - tcat[a]; })[0];
    var att = Store.getSetting('study.attendance', {}) || {};
    var absences = Object.keys(att).filter(function (k) { return att[k].date >= from && att[k].date <= to; }).length;

    // План
    var lessons = 0;
    for (var d = planFrom; d <= planTo; d = addDays(d, 1)) lessons += T.study && T.study.lessonsOn ? T.study.lessonsOn(d).length : 0;
    var plan = items.filter(function (it) { return it.date >= planFrom && it.date <= planTo; });
    var planList = plan.slice(0, 8).map(function (it) {
      return '<li><span class="wr-day">' + WD[U.toDate(it.date).getDay()] + ' ' + U.toDate(it.date).getDate() + '</span><span class="ag-main"><span class="ag-title">' + esc(it.title) + '</span><span class="ag-meta">' + esc(it.source) + '</span></span></li>';
    }).join('');

    function stat(label, value, hint) { return '<div><span class="tile-label">' + label + '</span><b>' + value + '</b>' + (hint ? '<small>' + hint + '</small>' : '') + '</div>'; }
    return (
      '<section class="card weekreport">' +
        '<div class="card-head"><h2>📊 ' + (isMonday ? 'Итоги прошлой недели' : 'Итоги недели') + '</h2>' +
          '<button type="button" class="icon-btn" data-wr-close="1" aria-label="Скрыть" data-tip="Скрыть до следующей недели">×</button></div>' +
        '<p class="field-hint">' + U.toDate(from).getDate() + ' ' + U.monthGen(from) + ' – ' + U.toDate(to).getDate() + ' ' + U.monthGen(to) + '</p>' +
        '<div class="dayend-stats wr-stats">' +
          stat('Потрачено', U.money(spent), topCat && T.money ? 'больше всего — ' + esc(T.money.catFull(topCat, '')) : 'трат не было') +
          stat('Доходы', U.money(income), '') +
          stat('Закрыто дел', String(closed), 'задачи и задания') +
          stat('Записано времени', T.time ? T.time.fmtDur(minutes) : '—', topTime && T.time ? 'больше всего — ' + esc(T.time.catName(topTime)) : '') +
          stat('Пропуски пар', String(absences), absences ? 'загляни в «Учёбу»' : 'без пропусков 👏') +
        '</div>' +
        '<h3 class="block-sub">План на ' + (isMonday ? 'эту' : 'следующую') + ' неделю · ' + lessons + ' ' + U.plural(lessons, 'пара', 'пары', 'пар') + '</h3>' +
        (planList ? '<ul class="wr-plan">' + planList + '</ul>' + (plan.length > 8 ? '<p class="field-hint">и ещё ' + (plan.length - 8) + '…</p>' : '') : '<p class="muted today-note">Сроков на неделю нет.</p>') +
      '</section>'
    );
  }

  function heroHtml(items) {
    var d = new Date(), today = U.today();
    var w = window.Weather ? Weather.current() : null;
    var lessons = Tabs.study && Tabs.study.lessonsOn ? Tabs.study.lessonsOn(today) : [];
    var now = nowHM();
    var nextL = lessons.find(function (l) { return l.end > now; });
    var todo = items.filter(function (it) { return it.check && it.date === today; }).length;
    var late = items.filter(function (it) { return it.check && it.date < today; }).length;
    var o = Tabs.money && Tabs.money.overview ? Tabs.money.overview() : null;
    var wk = Tabs.money && Tabs.money.weekly ? Tabs.money.weekly() : null;
    var todaySpent = o ? U.round2(Store.list('transactions').filter(function (t) { return t.type === 'expense' && t.date === today; })
      .reduce(function (s, t) { return s + t.amount; }, 0)) : 0;

    function stat(label, value, hint, href) {
      return '<a class="hero-stat" href="' + href + '"><span class="hero-stat-label">' + label + '</span>' +
        '<span class="hero-stat-value">' + value + '</span><span class="hero-stat-hint">' + hint + '</span></a>';
    }
    return (
      '<section class="hero-panel tod-' + timeOfDay() + (w ? ' ' + weatherFx(w) : '') + '">' +
        '<div class="hero-sky" aria-hidden="true"><span class="sky-sun"></span><span class="sky-moon"></span><span class="sky-stars"></span><span class="sky-wx"></span></div>' +
        '<div class="hero-top">' +
          '<div><p class="hero-date">' + cap(WD_FULL[d.getDay()]) + ', ' + d.getDate() + ' ' + U.monthGen(today) + '</p>' +
            '<h1>' + greeting() + '</h1></div>' +
          (w ? '<div class="weather" data-tip="' + esc('Ощущается как ' + Weather.fmtTemp(w.feels) + '\nСегодня от ' + Weather.fmtTemp(w.min) + ' до ' + Weather.fmtTemp(w.max)) + '">' +
            '<span class="weather-emoji">' + w.emoji + '</span><span><b>' + Weather.fmtTemp(w.temp) + '</b><small>' + esc(w.text) + ' · ' + esc(w.city) + '</small></span></div>' : '') +
        '</div>' +
        '<div class="hero-stats">' +
          stat('Пар сегодня', String(lessons.length), nextL ? 'дальше ' + esc(nextL.start) + ' · ' + esc(nextL.subject) : lessons.length ? 'пары закончились' : 'свободный день', '#study') +
          stat('Дел сегодня', String(todo), late ? 'и просрочено ' + late : todo ? 'со сроком на сегодня' : 'всё чисто', '#summary-today') +
          (o && o.budget
            ? stat('Можно сегодня', U.money(canSpendToday(o)), 'в бюджете ' + U.money(Math.max(0, o.left)), '#money')
            : wk
            ? stat('Можно сегодня', U.money(wk.perDay), 'на неделю осталось ' + U.money(Math.max(0, wk.left)), '#money')
            : stat('Траты сегодня', U.money(todaySpent), o ? 'за месяц ' + U.money(o.expenses) : '', '#money')) +
        '</div>' +
      '</section>'
    );
  }

  // Сколько можно потратить сегодня: остаток бюджета минус ещё не внесённые регулярные платежи,
  // делённый на оставшиеся дни месяца (включая сегодня).
  function canSpendToday(o) {
    var today = U.today();
    var daysLeft = U.daysIn(o.month) - new Date().getDate() + 1;
    var recLeft = o.recurring.filter(function (r) { return !r.paid && r.date >= today; }).reduce(function (s, r) { return s + r.amount; }, 0);
    return Math.max(0, Math.floor((o.left - recLeft) / Math.max(1, daysLeft)));
  }

  // ============================================================
  //  Обратный отсчёт до важных дат
  // ============================================================
  // Особая дата: разовая или ежегодная (день рождения, праздник). Ближайшее наступление — начиная с from.
  function nextDate(c, from) {
    from = from || U.today();
    if (!c.yearly) return c.date;
    var md = c.date.slice(5);
    var y = +from.slice(0, 4);
    function make(year) {
      var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      return year + '-' + (md === '02-29' && !leap ? '02-28' : md);
    }
    var d = make(y);
    return d >= from ? d : make(y + 1);
  }
  var CD_AHEAD = 7;   // особые даты появляются на Сводке за неделю

  function countdowns() {
    var today = U.today(), out = [];
    Store.list('countdowns').forEach(function (c) {
      var d = nextDate(c);
      if (d >= today && daysUntil(d) <= CD_AHEAD) out.push({ id: c.id, emoji: c.emoji || '📅', title: c.title, date: d, custom: true });
    });
    var kinds = (Tabs.study && Tabs.study.examKinds) || {};
    var exam = Store.list('study.exams').filter(function (e) { return !e.result && e.date && e.date >= today; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); })[0];
    if (exam) out.push({ emoji: '📝', title: (kinds[exam.kind] || 'Экзамен') + ': ' + exam.subject, date: exam.date });
    if (Tabs.study && Tabs.study.thesisProgress) {
      var def = Tabs.study.thesisProgress().stages.find(function (s) { return /защит/i.test(s.name) && !s.done && s.due; });
      if (def && def.due >= today) out.push({ emoji: '🎓', title: 'Защита ВКР', date: def.due });
    }
    (Store.getSetting('money.accounts.v2', []) || []).forEach(function (a) {
      if (a.kind === 'piggy' && a.targetDate && a.targetDate >= today) out.push({ emoji: '🐷', title: a.name, date: a.targetDate });
    });
    var ev = Store.list('study.events').filter(function (e) { return e.date && e.date >= today; }).sort(function (a, b) { return a.date.localeCompare(b.date); })[0];
    if (ev) out.push({ emoji: '🎤', title: ev.title, date: ev.date });
    return out.sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  function countdownsHtml() {
    var list = countdowns();
    var chips = list.map(function (c) {
      var n = daysUntil(c.date);
      var when = n === 0 ? 'сегодня' : n === 1 ? 'завтра' : n + ' ' + U.plural(n, 'день', 'дня', 'дней');
      return '<button type="button" class="cd-chip"' + (c.custom ? ' data-cd="' + esc(c.id) + '"' : ' data-cd-auto="1"') + ' data-tip="' +
        esc(c.title + '\n' + WD_FULL[U.toDate(c.date).getDay()] + ', ' + U.toDate(c.date).getDate() + ' ' + U.monthGen(c.date)) + '">' +
        '<span class="cd-emoji">' + c.emoji + '</span><span class="cd-text"><b>' + when + '</b><small>' + esc(c.title) + '</small></span></button>';
    }).join('');
    var total = Store.list('countdowns').length;
    return '<div class="countdowns">' + chips +
      (total ? '<button type="button" class="cd-chip cd-add" data-cd-all="1">📅 <span>Особые даты · ' + total + '</span></button>' : '') +
      '<button type="button" class="cd-chip cd-add" data-cd-new="1">＋ <span>Особая дата</span></button></div>';
  }

  // Список всех особых дат (на Сводке видны только ближайшие — за неделю).
  function allDatesDialog() {
    var list = Store.list('countdowns').map(function (c) { return { c: c, d: nextDate(c) }; })
      .sort(function (a, b) { return a.d.localeCompare(b.d); });
    var dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = '<div class="sheet-form"><div class="sheet-head"><h2>Особые даты</h2><button type="button" class="icon-x" data-close aria-label="Закрыть">' +
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="sheet-body"><ul class="plan-list">' +
      list.map(function (x) {
        var n = daysUntil(x.d);
        var when = x.d < U.today() ? 'прошла' : n === 0 ? 'сегодня' : 'через ' + n + ' ' + U.plural(n, 'день', 'дня', 'дней');
        return '<li class="plan-row"><button type="button" class="plan-main" data-cd-edit="' + esc(x.c.id) + '"><span class="tx-title">' + (x.c.emoji || '📅') + ' ' + esc(x.c.title) + '</span>' +
          '<span class="tx-sub">' + U.toDate(x.d).getDate() + ' ' + U.monthGen(x.d) + (x.c.yearly ? ' · каждый год' : '') + ' · ' + when + '</span></button></li>';
      }).join('') + '</ul><p class="field-hint">На Сводке дата появляется за неделю. Напоминания — за 7 дней, за 3 дня, накануне и в сам день.</p></div>' +
      '<div class="sheet-foot"><button type="button" class="btn" data-cd-add2>＋ Добавить</button><span class="spacer"></span><button type="button" class="btn" data-close>Готово</button></div></div>';
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
      var ed = e.target.closest('[data-cd-edit]');
      if (ed) { dlg.close(); countdownDialog(Store.list('countdowns').find(function (c) { return c.id === ed.dataset.cdEdit; })); return; }
      if (e.target.closest('[data-cd-add2]')) { dlg.close(); countdownDialog(null); }
    });
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  var CD_EMOJI = ['📅', '✈️', '🎂', '🎓', '📝', '🎉', '🏖️', '💼', '❤️', '🏆'];

  function countdownDialog(c) {
    var editing = !!c;
    U.formDialog({
      title: editing ? 'Особая дата' : 'Новая особая дата',
      values: editing ? { title: c.title, date: c.date, emoji: c.emoji || '📅', yearly: c.yearly ? '1' : '0' } : { title: '', date: '', emoji: '🎂', yearly: '1' },
      fields: [
        { name: 'title', type: 'text', label: 'Что за дата', placeholder: 'Например, день рождения мамы', maxlength: 60, autofocus: !editing },
        { name: 'date', type: 'date', label: 'Когда' },
        { name: 'yearly', type: 'seg', label: 'Повторять', options: [{ value: '1', label: 'Каждый год' }, { value: '0', label: 'Один раз' }] },
        { name: 'emoji', type: 'chips', label: 'Значок', options: CD_EMOJI.map(function (e) { return { value: e, label: e }; }) },
        { type: 'hint', text: 'На Сводке дата появится за неделю. Напомню за 7 дней, за 3 дня, накануне и в сам день.' }
      ],
      onSubmit: function (v) {
        if (!(v.title || '').trim()) return 'Напиши, что за дата';
        if (!v.date) return 'Укажи дату';
        var rec = { title: v.title.trim(), date: v.date, emoji: v.emoji || '📅', yearly: v.yearly === '1' };
        if (editing) Store.update('countdowns', c.id, rec); else Store.add('countdowns', rec);
      },
      onDelete: editing ? function () { Store.remove('countdowns', c.id); } : null
    });
  }

  // ============================================================
  //  Блоки
  // ============================================================
  function todayHtml(items) {
    var today = U.today(), now = nowHM();
    var lessons = Tabs.study && Tabs.study.lessonsOn ? Tabs.study.lessonsOn(today) : [];
    var shift = Tabs.time && Tabs.time.scheduledShift ? Tabs.time.scheduledShift(today) : null;

    // Расписание дня: смена + пары по времени.
    var slots = [];
    if (shift) slots.push({ start: shift.start, end: shift.end, title: 'Смена', meta: shift.category, icon: I.work, tab: 'time' });
    lessons.forEach(function (l) {
      slots.push({ start: l.start, end: l.end, title: l.subject, meta: (/лек/.test(l.type) ? 'лекция' : 'практика') + (l.room ? ' · ' + l.room : ''), icon: I.book, tab: 'study' });
    });
    slots.sort(function (a, b) { return a.start.localeCompare(b.start); });
    var slotsHtml = slots.map(function (s) {
      var isNow = s.start <= now && now < s.end, past = s.end <= now;
      return '<li class="slot' + (isNow ? ' is-now' : '') + (past ? ' is-past' : '') + '"><a href="#' + s.tab + '">' +
        '<span class="slot-time">' + esc(s.start) + '<span>' + esc(s.end) + '</span></span>' +
        '<span class="slot-main"><span class="slot-title">' + s.icon + esc(s.title) + '</span><span class="slot-meta">' + esc(s.meta) +
          (isNow ? ' · <b>идёт сейчас</b>' : '') + '</span></span></a></li>';
    }).join('');

    var noLessons = '';
    if (!lessons.length && Tabs.study && Tabs.study.nextLesson) {
      var nl = Tabs.study.nextLesson();
      noLessons = '<p class="muted today-note">Пар сегодня нет' + (nl ? ' · следующая: ' + esc(nl.subject) + ', ' + WD[U.toDate(nl.date).getDay()] + ' в ' + esc(nl.start) : '') + '</p>';
    }

    var prep = Tabs.study && Tabs.study.prepToday ? Tabs.study.prepToday() : [];
    var prepHtml = prep.length
      ? '<h3 class="block-sub">Подготовка к экзаменам</h3><ul class="ag-list">' + prep.map(function (p) {
          return '<li class="ag-item"><span class="ag-dot ag-dot--exam"></span><a class="ag-link" href="#study" data-prep="' + esc(p.id) + '"><span class="ag-main">' +
            '<span class="ag-title">📚 ' + esc(p.subject) + ' — ' + p.perDay + ' ' + U.plural(p.perDay, 'билет', 'билета', 'билетов') + ' сегодня</span>' +
            '<span class="ag-meta">выучено ' + p.done + ' из ' + p.total + '</span></span>' + U.ring(p.done / p.total, { size: 30, stroke: 4, text: '' }) + '</a></li>';
        }).join('') + '</ul>'
      : '';
    var todays = items.filter(function (it) { return it.date === today; });
    var todo = todays.length
      ? '<h3 class="block-sub">Дела на сегодня</h3><ul class="ag-list">' + todays.map(function (it) { return itemHtml(it, false); }).join('') + '</ul>'
      : '<p class="muted today-note">На сегодня дел со сроком нет.</p>';

    return (
      '<section class="card today-card">' +
        '<div class="card-head"><h2>' + ico('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>') + 'Сегодня</h2>' +
          (dayEndVisible() ? '' : '<button type="button" class="btn btn-small btn-ghost" data-dayend-open="1">🌙 Итог дня</button>') + '</div>' +
        (slotsHtml ? '<ul class="slots">' + slotsHtml + '</ul>' : '') + noLessons + todo + prepHtml +
      '</section>'
    );
  }

  function deadlinesHtml(items) {
    var today = U.today(), until = addDays(today, 7);
    var late = items.filter(function (it) { return it.date < today && (it.check || it.kind === 'pay'); });
    var soon = items.filter(function (it) { return it.date > today && it.date <= until; });
    var body = '';
    if (late.length) {
      body += '<div class="ag-day ag-day--late"><div class="ag-day-title">' + I.alert + 'Просрочено · ' + late.length + '</div><ul class="ag-list">' +
        late.map(function (it) { return itemHtml(it, true); }).join('') + '</ul></div>';
    }
    var byDay = {};
    soon.forEach(function (it) { (byDay[it.date] = byDay[it.date] || []).push(it); });
    Object.keys(byDay).sort().forEach(function (d) {
      body += '<div class="ag-day"><div class="ag-day-title">' + esc(dayName(d)) + '</div><ul class="ag-list">' +
        byDay[d].map(function (it) { return itemHtml(it, false); }).join('') + '</ul></div>';
    });
    return (
      '<section class="card">' +
        '<div class="card-head"><h2>' + ico('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>') + 'Сроки на 7 дней</h2><span class="muted">' + soon.length + ' ' + U.plural(soon.length, 'дело', 'дела', 'дел') + '</span></div>' +
        (body || '<p class="muted today-note">Ближайшую неделю сроков нет. Сюда попадают задачи, задания, этапы ВКР, мероприятия, экзамены и регулярные платежи.</p>') +
      '</section>'
    );
  }

  function moneyHtml() {
    if (!Tabs.money || !Tabs.money.overview) return '';
    var o = Tabs.money.overview();
    var pay = Tabs.work && Tabs.work.payStatus ? Tabs.work.payStatus() : null;
    var monthName = U.monthTitle(o.month).split(' ')[0].toLowerCase();
    var main = o.budget
      ? tile(o.left >= 0 ? 'Осталось в бюджете' : 'Перерасход', U.money(Math.abs(o.left)), 'потрачено ' + U.money(o.spent) + ' из ' + U.money(o.budget))
      : tile('Расходы за ' + monthName, U.money(o.expenses), 'доходы ' + U.money(o.income));
    var waiting = pay && pay.waiting > 0
      ? tile('Ещё должно прийти', U.money(pay.waiting), 'зарплата за ' + monthName)
      : tile('Доходы за ' + monthName, U.money(o.income), pay && (pay.officeExpected || pay.remoteExpected) ? 'вся ожидаемая зарплата пришла' : '');
    var debtLine = (o.debts || []).filter(function (d) { return Math.abs(d.balance) > 0.009; }).map(function (d) {
      return '<div class="acc">🤝<span class="acc-name">' + esc(d.name) + '</span><span class="acc-val ' + (d.balance > 0 ? 'is-plus' : 'is-minus') + '">' +
        (d.balance > 0 ? 'должен ' + U.money(d.balance) : 'ты должен ' + U.money(-d.balance)) + '</span></div>';
    }).join('');
    var accounts = debtLine + o.accounts.map(function (a) {
      return '<div class="acc">' + (a.piggy ? I.piggy : '') + '<span class="acc-name">' + esc(a.name) + '</span><span class="acc-val">' + U.money(a.balance) + '</span></div>';
    }).join('');
    return (
      '<section class="summary-block">' +
        '<div class="section-row"><h2 class="section-title">' + ico('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M15.5 15h2.5"/>') + 'Деньги</h2><a class="link-btn" href="#money">Открыть →</a></div>' +
        '<div class="grid grid--2">' + main + waiting + '</div>' +
        '<div class="card accounts"><span class="accounts-title">На счетах</span>' + accounts + '</div>' +
      '</section>'
    );
  }

  function weekHtml() {
    var mon = U.toDate(U.today());
    mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
    var monIso = U.iso(mon);
    var closed = Store.list('work.tasks').filter(function (t) { return t.done && (t.doneAt || '').slice(0, 10) >= monIso; }).length +
      Store.list('study.homework').filter(function (h) { return h.done && (h.doneAt || '').slice(0, 10) >= monIso; }).length;
    var time = Tabs.time && Tabs.time.weekStats ? Tabs.time.weekStats() : null;
    var th = Tabs.study && Tabs.study.thesisProgress ? Tabs.study.thesisProgress() : null;
    var o = Tabs.money && Tabs.money.overview ? Tabs.money.overview() : null;
    return (
      '<section class="summary-block">' +
        '<div class="section-row"><h2 class="section-title">' + ico('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>') + 'Неделя в цифрах</h2>' +
          '<span class="section-btns"><a class="btn btn-small btn-ghost" href="#time">⏱️ Время</a>' +
          (weekReportVisible() ? '' : '<button type="button" class="btn btn-small btn-ghost" data-wr-open="1">📊 Отчёт недели</button>') + '</span></div>' +
        '<div class="grid grid--4">' +
          (time ? tile('Часов записано', time.text, 'прошлая неделя — ' + time.prevText, '#time') : '') +
          tile('Закрыто дел', String(closed), 'задачи и задания с понедельника', '#work') +
          (th ? tile('ВКР', Math.round(th.done / th.total * 100) + '%', th.done + ' из ' + th.total + ' этапов', '#study') : '') +
          (o ? tile('Потрачено', U.money(o.weekExpenses), 'с понедельника', '#money') : '') +
        '</div>' +
      '</section>'
    );
  }

  function tile(label, value, hint, href) {
    var inner = '<div class="tile-label">' + label + '</div><div class="tile-value">' + value + '</div>' + (hint ? '<div class="tile-hint">' + hint + '</div>' : '');
    return href ? '<a class="card tile tile--link" href="' + href + '">' + inner + '</a>' : '<div class="card tile">' + inner + '</div>';
  }

  // ============================================================
  //  Предупреждения (лимиты, долги, выписка)
  // ============================================================
  function alertsHtml() {
    var list = Tabs.money && Tabs.money.alerts ? Tabs.money.alerts() : [];
    if (!list.length) return '';
    return '<div class="alerts">' + list.map(function (a) {
      return '<a class="alert alert--' + a.level + '" href="#' + a.tab + '"><span class="alert-emoji">' + a.emoji + '</span><span>' + esc(a.text) + '</span>' + I.arrow + '</a>';
    }).join('') + '</div>';
  }

  // ============================================================
  //  Календарь всего
  // ============================================================
  var cal = { month: U.monthKey(U.today()), day: U.today() };

  // Всё, что есть на дату: пары, смена, дела, мероприятия, экзамены, платежи, зарплата, важные даты.
  function dayItems(date, items) {
    var out = [];
    var lessons = Tabs.study && Tabs.study.lessonsOn ? Tabs.study.lessonsOn(date) : [];
    if (lessons.length) out.push({ kind: 'lesson', time: lessons[0].start, title: lessons.length + ' ' + U.plural(lessons.length, 'пара', 'пары', 'пар') + ': ' + lessons.map(function (l) { return l.subject; }).join(', '), tab: 'study' });
    var shift = Tabs.time && Tabs.time.scheduledShift ? Tabs.time.scheduledShift(date) : null;
    if (shift) out.push({ kind: 'shift', time: shift.start, title: 'Смена ' + shift.start + '–' + shift.end, tab: 'time' });
    items.filter(function (it) { return it.date === date; }).forEach(function (it) {
      var kind = it.kind === 'event' ? 'event' : it.kind === 'exam' ? 'exam' : it.kind === 'pay' ? 'money' : 'deadline';
      out.push({ kind: kind, time: it.time || '', title: it.title, sub: it.source, tab: it.tab, item: it });
    });
    if (date >= U.today()) {
      var parts = Store.getSetting('work.office.parts', []) || [];
      var day = +date.slice(8, 10), last = U.daysIn(U.monthKey(date));
      parts.forEach(function (p) {
        if (Math.min(Number(p.day) || 1, last) === day) out.push({ kind: 'money', title: 'Ожидается зарплата: ' + p.name + (p.amount ? ' ~' + U.money(p.amount) : ''), tab: 'work' });
      });
    }
    Store.list('countdowns').forEach(function (c) { if (nextDate(c, date) === date) out.push({ kind: 'date', title: (c.emoji || '📅') + ' ' + c.title, tab: 'summary' }); });
    return out.sort(function (a, b) { return (a.time || '99').localeCompare(b.time || '99'); });
  }

  function calendarHtml(items) {
    var key = cal.month;
    var first = U.toDate(key + '-01');
    var lead = (first.getDay() + 6) % 7;
    var n = U.daysIn(key), today = U.today();
    var cells = '';
    for (var i = 0; i < lead; i++) cells += '<span class="cal-cell is-blank"></span>';
    for (var d = 1; d <= n; d++) {
      var iso = key + '-' + U.pad(d);
      var kinds = {};
      dayItems(iso, items).forEach(function (x) { kinds[x.kind] = true; });
      var dots = ['lesson', 'shift', 'deadline', 'event', 'exam', 'money', 'date'].filter(function (k) { return kinds[k]; }).slice(0, 4)
        .map(function (k) { return '<i class="cal-dot cal-dot--' + k + '"></i>'; }).join('');
      var wd = U.toDate(iso).getDay();
      cells += '<button type="button" class="cal-cell' + (iso === today ? ' is-today' : '') + (iso === cal.day ? ' is-sel' : '') + (wd === 0 || wd === 6 ? ' is-weekend' : '') +
        '" data-cal-day="' + iso + '"><span class="cal-num">' + d + '</span><span class="cal-dots">' + dots + '</span></button>';
    }
    var sel = dayItems(cal.day, items);
    var spent = U.round2(Store.list('transactions').filter(function (t) { return t.type === 'expense' && t.date === cal.day; }).reduce(function (s, t) { return s + t.amount; }, 0));
    var dayList = sel.length
      ? '<ul class="cal-list">' + sel.map(function (x) {
          return '<li><a href="#' + x.tab + '"><i class="cal-dot cal-dot--' + x.kind + '"></i><span class="cal-time">' + esc(x.time || '') + '</span>' +
            '<span class="ag-main"><span class="ag-title">' + esc(x.title) + '</span>' + (x.sub ? '<span class="ag-meta">' + esc(x.sub) + '</span>' : '') + '</span></a></li>';
        }).join('') + '</ul>'
      : '<p class="muted today-note">На этот день ничего нет.</p>';
    return (
      '<section class="card cal-card">' +
        '<div class="card-head cal-head"><h2>' + ico('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>') + 'Календарь</h2>' +
          '<div class="month-switch">' +
            '<button type="button" class="icon-btn" data-cal-step="-1" aria-label="Предыдущий месяц">' + ico('<path d="m15 6-6 6 6 6"/>') + '</button>' +
            '<span class="month-label">' + U.monthTitle(key) + '</span>' +
            '<button type="button" class="icon-btn" data-cal-step="1" aria-label="Следующий месяц">' + ico('<path d="m9 6 6 6-6 6"/>') + '</button>' +
          '</div></div>' +
        '<div class="cal-grid">' + ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(function (w) { return '<span class="cal-wd">' + w + '</span>'; }).join('') + cells + '</div>' +
        '<div class="cal-legend"><span><i class="cal-dot cal-dot--lesson"></i>пары</span><span><i class="cal-dot cal-dot--shift"></i>смена</span><span><i class="cal-dot cal-dot--deadline"></i>сроки</span>' +
          '<span><i class="cal-dot cal-dot--event"></i>мероприятия</span><span><i class="cal-dot cal-dot--exam"></i>экзамены</span><span><i class="cal-dot cal-dot--money"></i>деньги</span><span><i class="cal-dot cal-dot--date"></i>важные даты</span></div>' +
        '<div class="cal-day">' +
          '<div class="cal-day-head"><b>' + esc(cap(WD_FULL[U.toDate(cal.day).getDay()])) + ', ' + U.toDate(cal.day).getDate() + ' ' + U.monthGen(cal.day) + '</b>' +
            (spent ? '<span class="muted">траты: ' + U.money(spent) + '</span>' : '') +
            '<button type="button" class="btn btn-small btn-ghost" data-cal-add="1">＋ Добавить</button></div>' +
          dayList +
        '</div>' +
      '</section>'
    );
  }

  function calAddDialog(date) {
    var subjects = Tabs.study && Tabs.study.subjects ? Tabs.study.subjects() : [];
    U.formDialog({
      title: 'На ' + U.toDate(date).getDate() + ' ' + U.monthGen(date),
      values: { kind: 'task', title: '', job: 'office', subject: subjects[0] || '', time: '' },
      fields: function (v) {
        var f = [
          { name: 'kind', type: 'seg', label: 'Что добавить', rerender: true, options: [
            { value: 'task', label: 'Задача' }, { value: 'hw', label: 'Задание' }, { value: 'event', label: 'Мероприятие' }, { value: 'date', label: 'Особая дата' }] },
          { name: 'title', type: 'text', label: 'Название', maxlength: 160, autofocus: true }
        ];
        if (v.kind === 'task') f.push({ name: 'job', type: 'seg', label: 'Работа', options: [{ value: 'office', label: 'Очная' }, { value: 'remote', label: 'Дистанционная' }] });
        if (v.kind === 'hw') f.push({ name: 'subject', type: 'select', label: 'Предмет', options: subjects.map(function (s) { return { value: s, label: s }; }) });
        if (v.kind === 'event') f.push({ name: 'time', type: 'text', label: 'Время', placeholder: '15:00', maxlength: 20 });
        return f;
      },
      onSubmit: function (v) {
        var title = (v.title || '').trim();
        if (!title) return 'Введи название';
        if (v.kind === 'task') Store.add('work.tasks', { title: title, job: v.job, due: date, important: false, note: '', done: false });
        else if (v.kind === 'hw') Store.add('study.homework', { subject: v.subject, title: title, due: date, note: '', done: false });
        else if (v.kind === 'event') Store.add('study.events', { title: title, date: date, time: (v.time || '').trim(), place: '', role: 'Участник', note: '', todo: [] });
        else Store.add('countdowns', { title: title, date: date, emoji: '📅', yearly: /рожд|праздн|годовщ/i.test(title) });
        U.toast('Добавлено на ' + U.toDate(date).getDate() + ' ' + U.monthGen(date));
      }
    });
  }

  // ============================================================
  //  Итог дня (вечером)
  // ============================================================
  var showDayEnd = false;
  var QUICK_TIME = [['thesis', '🎓 ВКР'], ['selfstudy', '📖 Учёба'], ['sport', '🏃 Спорт'], ['road', '🚌 Дорога'], ['fun', '🎮 Отдых']];

  function dayEndVisible() {
    if (showDayEnd) return true;
    var hidden = '';
    try { hidden = localStorage.getItem('dash:dayend-hidden') || ''; } catch (e) {}
    return new Date().getHours() >= 20 && hidden !== U.today();
  }

  function dayEndHtml(items) {
    if (!dayEndVisible()) return '';
    var today = U.today();
    var done = Store.list('work.tasks').filter(function (t) { return t.done && (t.doneAt || '').slice(0, 10) === today; })
      .concat(Store.list('study.homework').filter(function (h) { return h.done && (h.doneAt || '').slice(0, 10) === today; }));
    var spentList = Store.list('transactions').filter(function (t) { return t.type === 'expense' && t.date === today; });
    var spent = U.round2(spentList.reduce(function (s, t) { return s + t.amount; }, 0));
    var minutes = Tabs.time && Tabs.time.dayMinutes ? Tabs.time.dayMinutes(today) : 0;
    var left = items.filter(function (it) { return it.check && it.date <= today; });
    var leftHtml = left.length
      ? '<h3 class="block-sub">Не успел — перенести?</h3><ul class="ag-list">' + left.map(function (it) {
          return '<li class="ag-item"><span class="ag-main"><span class="ag-title">' + esc(it.title) + '</span><span class="ag-meta">' + esc(it.source) + '</span></span>' +
            '<button type="button" class="btn btn-small" data-move="' + esc(it.kind) + '" data-id="' + esc(it.id) + '"' + (it.parent ? ' data-parent="' + esc(it.parent) + '"' : '') + '>на завтра</button></li>';
        }).join('') + '</ul>' + (left.length > 1 ? '<button type="button" class="btn btn-small btn-ghost" data-move-all="1">Перенести всё на завтра</button>' : '')
      : '';
    return (
      '<section class="card dayend">' +
        '<div class="card-head"><h2>🌙 Итог дня</h2><button type="button" class="icon-btn" data-dayend-close="1" aria-label="Скрыть до завтра" data-tip="Скрыть до завтра">×</button></div>' +
        '<div class="dayend-stats">' +
          '<div><span class="tile-label">Сделано</span><b>' + done.length + '</b><small>' + (done.length ? esc(done.slice(0, 2).map(function (x) { return x.title; }).join(', ')) + (done.length > 2 ? '…' : '') : 'дел не закрыто') + '</small></div>' +
          '<div><span class="tile-label">Потрачено</span><b>' + U.money(spent) + '</b><small>' + spentList.length + ' ' + U.plural(spentList.length, 'покупка', 'покупки', 'покупок') + '</small></div>' +
          '<div><span class="tile-label">Записано времени</span><b>' + (Tabs.time ? Tabs.time.fmtDur(minutes) : '—') + '</b><small>с учётом смены</small></div>' +
        '</div>' +
        leftHtml +
        '<h3 class="block-sub">На что ещё ушло время сегодня?</h3>' +
        '<div class="chips quick-time">' + QUICK_TIME.map(function (q) {
          return '<button type="button" class="chip-btn" data-qt="' + q[0] + '">' + q[1] + '</button>';
        }).join('') + '</div>' +
      '</section>'
    );
  }

  function moveToTomorrow(kind, id, parent) {
    var tomorrow = addDays(U.today(), 1);
    if (kind === 'task') Store.update('work.tasks', id, { due: tomorrow });
    else if (kind === 'hw') Store.update('study.homework', id, { due: tomorrow });
    else if (kind === 'todo') {
      var e = Store.list('study.events').find(function (x) { return x.id === parent; });
      if (e) Store.update('study.events', parent, { todo: (e.todo || []).map(function (t) { return t.id === id ? Object.assign({}, t, { due: tomorrow }) : t; }) });
    } else if (kind === 'stage') {
      var th = JSON.parse(JSON.stringify(Store.getSetting('study.thesis', null) || {}));
      if (!th.stages) th.stages = Tabs.study.thesisProgress().stages;
      th.stages.forEach(function (s) { if (s.id === id) s.due = tomorrow; });
      Tabs.study.saveThesis(th);
    }
  }

  function quickTimeDialog(cat, label) {
    U.formDialog({
      title: label + ' — сколько?',
      submitLabel: 'Записать',
      values: { dur: '60' },
      fields: [{ name: 'dur', type: 'seg', label: 'Длительность', options: [
        { value: '30', label: '30 мин' }, { value: '60', label: '1 ч' }, { value: '90', label: '1,5 ч' }, { value: '120', label: '2 ч' }, { value: '180', label: '3 ч' }] }],
      onSubmit: function (v) {
        var m = parseInt(v.dur, 10) || 60;
        Store.add('time.entries', { category: cat, date: U.today(), minutes: m, start: '', end: '', note: '' });
        U.toast('Записано: ' + label.replace(/^\S+\s/, '') + ' · ' + (Tabs.time ? Tabs.time.fmtDur(m) : m + ' мин'));
      }
    });
  }

  function ico(path) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }

  // ============================================================
  //  Список покупок
  // ============================================================
  function shoppingHtml() {
    var all = Store.list('shopping');
    var open = all.filter(function (s) { return !s.done; });
    var done = all.filter(function (s) { return s.done; });
    // Частые покупки: что добавлял хотя бы дважды и чего сейчас нет в списке.
    var freq = Store.getSetting('shopping.freq', {}) || {};
    var openNames = open.map(function (s) { return s.text.toLowerCase(); });
    var tips = Object.keys(freq).filter(function (k) { return freq[k] >= 2 && openNames.indexOf(k) === -1; })
      .sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 6);
    var rows = open.map(function (s) {
      return '<li class="shop-item"><label><input type="checkbox" data-shop-done="' + esc(s.id) + '"><span>' + esc(s.text) + '</span></label>' +
        '<button type="button" class="icon-btn" data-shop-del="' + esc(s.id) + '" aria-label="Убрать">×</button></li>';
    }).join('');
    return (
      '<section class="card shop-card">' +
        '<div class="card-head"><h2>🛒 Список покупок</h2>' + (open.length ? '<span class="muted">' + open.length + ' ' + U.plural(open.length, 'пункт', 'пункта', 'пунктов') + '</span>' : '') + '</div>' +
        '<form class="shop-add" data-shop-form="1" autocomplete="off"><input type="text" name="text" maxlength="80" placeholder="Молоко, хлеб, яйца…" aria-label="Что купить">' +
          '<button type="submit" class="btn btn-small btn-primary">＋</button></form>' +
        (tips.length ? '<div class="chips shop-tips">' + tips.map(function (t) { return '<button type="button" class="chip-btn" data-shop-tip="' + esc(t) + '">＋ ' + esc(t) + '</button>'; }).join('') + '</div>' : '') +
        (rows ? '<ul class="shop-list">' + rows + '</ul>' : '<p class="muted today-note">Список пуст. Можно вписать несколько через запятую.</p>') +
        (done.length ? '<div class="btn-row shop-foot"><span class="muted">куплено: ' + done.length + '</span>' +
          '<button type="button" class="btn btn-small btn-primary" data-shop-pay="1">💸 Записать трату</button>' +
          '<button type="button" class="btn btn-small" data-shop-clear="1">Очистить</button></div>' : '') +
      '</section>'
    );
  }
  function shopAdd(text) {
    var freq = Object.assign({}, Store.getSetting('shopping.freq', {}) || {});
    var items = text.split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean)
      .map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); });
    if (!items.length) return;
    Store.addMany('shopping', items.map(function (s) { var k = s.toLowerCase(); freq[k] = (freq[k] || 0) + 1; return { text: s, done: false }; }));
    Store.setSetting('shopping.freq', freq);
  }
  // Купленное → форма расхода «Продукты» с перечнем в комментарии; список купленного очищается.
  function shopPay() {
    var done = Store.list('shopping').filter(function (s) { return s.done; });
    if (!done.length || !Tabs.money) return;
    var note = done.map(function (s) { return s.text; }).join(', ').slice(0, 100);
    done.forEach(function (s) { Store.remove('shopping', s.id); });
    Tabs.money.newTx({ type: 'expense', category: 'food', sub: 'food.groceries', note: note });
  }

  // ============================================================
  //  Отрисовка
  // ============================================================
  function render(el) {
    var items = agenda();
    var wrap = document.createElement('div');
    wrap.className = 'summary';
    wrap.innerHTML =
      heroHtml(items) + quickActionsHtml() + countdownsHtml() + alertsHtml() + weekReportHtml(items) + dayEndHtml(items) +
      '<div class="summary-cols">' +
        '<div class="summary-col">' + todayHtml(items) + deadlinesHtml(items) + shoppingHtml() + '</div>' +
        '<div class="summary-col">' + calendarHtml(items) + moneyHtml() + (window.Achievements ? Achievements.html() : '') + '</div>' +
      '</div>' +
      weekHtml();
    el.innerHTML = '';
    el.appendChild(wrap);
    if (window.Achievements) Achievements.check();
    wrap.addEventListener('submit', function (ev) {
      var f = ev.target.closest('[data-shop-form]');
      if (!f) return;
      ev.preventDefault();
      var v = f.elements.text.value;
      if (v.trim()) { shopAdd(v); setTimeout(function () { var i = document.querySelector('[data-shop-form] input'); if (i) i.focus(); }, 30); }
    });
    wrap.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.dataset.shopDone) {
        var li2 = t.closest('.shop-item');
        if (li2) li2.classList.add('is-leaving');
        if (window.FX && FX.haptic) FX.haptic();
        setTimeout(function () { Store.update('shopping', t.dataset.shopDone, { done: true }); }, 240);
        return;
      }
      if (t.dataset.role === 'ag-done' && t.checked) {
        var li = t.closest('.ag-item');
        if (li) li.classList.add('is-leaving');
        setTimeout(function () { markDone(t.dataset.kind, t.dataset.id, t.dataset.parent); }, 260);
      }
    });
    wrap.addEventListener('click', function (ev) {
      var a = ev.target.closest('a[href="#summary-today"]');
      if (a) { ev.preventDefault(); var tc = wrap.querySelector('.today-card'); if (tc) tc.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (ev.target.closest('[data-cd-all]')) { allDatesDialog(); return; }
      var b = ev.target.closest('[data-cd], [data-cd-new]');
      if (b) { countdownDialog(b.dataset.cd ? Store.list('countdowns').find(function (c) { return c.id === b.dataset.cd; }) : null); return; }
      var qa = ev.target.closest('[data-qa]');
      if (qa) { runQuickAction(qa.dataset.qa); return; }
      if (ev.target.closest('[data-ach-all]')) { Achievements.toggleAll(); App.softRefresh(); return; }
      var sh = ev.target.closest('[data-shop-del], [data-shop-tip], [data-shop-pay], [data-shop-clear]');
      if (sh) {
        if (sh.dataset.shopDel) Store.remove('shopping', sh.dataset.shopDel);
        else if (sh.dataset.shopTip) shopAdd(sh.dataset.shopTip);
        else if (sh.dataset.shopPay) shopPay();
        else Store.list('shopping').filter(function (s) { return s.done; }).forEach(function (s) { Store.remove('shopping', s.id); });
        return;
      }
      var pr = ev.target.closest('[data-prep]');
      if (pr && Tabs.study && Tabs.study.openPrep) { Tabs.study.openPrep(pr.dataset.prep); return; }
      var wr = ev.target.closest('[data-wr-close], [data-wr-open]');
      if (wr) {
        if (wr.dataset.wrClose) { showWeekReport = false; try { localStorage.setItem('dash:weekreport-hidden', mondayOf(U.today())); } catch (e4) {} }
        else { showWeekReport = true; window.scrollTo({ top: 0, behavior: 'smooth' }); }
        App.softRefresh();
        return;
      }
      var t = ev.target.closest('[data-cal-day], [data-cal-step], [data-cal-add], [data-dayend-close], [data-dayend-open], [data-move], [data-move-all], [data-qt]');
      if (!t) return;
      if (t.dataset.calDay) { cal.day = t.dataset.calDay; App.softRefresh(); }
      else if (t.dataset.calStep) {
        cal.month = U.addMonths(cal.month, +t.dataset.calStep);
        cal.day = cal.month === U.monthKey(U.today()) ? U.today() : cal.month + '-01';
        App.softRefresh();
      }
      else if (t.dataset.calAdd) calAddDialog(cal.day);
      else if (t.dataset.dayendClose) { showDayEnd = false; try { localStorage.setItem('dash:dayend-hidden', U.today()); } catch (e2) {} App.softRefresh(); }
      else if (t.dataset.dayendOpen) { showDayEnd = true; try { localStorage.removeItem('dash:dayend-hidden'); } catch (e3) {} App.softRefresh(); }
      else if (t.dataset.move) { moveToTomorrow(t.dataset.move, t.dataset.id, t.dataset.parent); U.toast('Перенесено на завтра'); }
      else if (t.dataset.moveAll) {
        agenda().filter(function (it) { return it.check && it.date <= U.today(); }).forEach(function (it) { moveToTomorrow(it.kind, it.id, it.parent); });
        U.toast('Всё перенесено на завтра');
      }
      else if (t.dataset.qt) { var q = QUICK_TIME.find(function (x) { return x[0] === t.dataset.qt; }); quickTimeDialog(q[0], q[1]); }
    });
  }

  window.Tabs.summary = { render: render, agenda: agenda, nextDate: nextDate };
})();
