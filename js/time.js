/* ============================================================
   Вкладка «Время»: на что уходят часы.

   - Записи вносятся быстрой строкой задним числом: «вкр 2ч», «спорт 45м вчера», «работа 10-13».
   - Смены очной работы идут по шаблону (дни недели + часы) и считаются сами;
     отдельный день можно изменить или отметить «не было».
   - Неделя: сколько часов на каждую категорию и сравнение с прошлой неделей.

   Что где хранится (через Store):
   - 'time.entries'         — записи {date, category, minutes, start, end, note}
   - 'time.shiftOverrides'  — исключения из шаблона смен {date, skip} или {date, start, end}
   - настройка 'time.shifts'     — шаблон {enabled, days: [1..5], start, end, category, since}
   - настройка 'time.categories' — список категорий [{id, name}]
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var esc = U.esc;
  window.Tabs = window.Tabs || {};

  var DEFAULT_CATS = [
    { id: 'classes', name: 'Учёба (пары)' },
    { id: 'selfstudy', name: 'Самоподготовка' },
    { id: 'thesis', name: 'ВКР' },
    { id: 'work-office', name: 'Работа (очная)' },
    { id: 'work-remote', name: 'Работа (дистанционная)' },
    { id: 'extra', name: 'Внеучебное' },
    { id: 'sport', name: 'Спорт' },
    { id: 'road', name: 'Дорога' },
    { id: 'fun', name: 'Отдых и развлечения' },
    { id: 'chores', name: 'Быт' },
    { id: 'sleep', name: 'Сон' }
  ];

  // Слова для быстрой строки. Побеждает самое длинное совпадение.
  var KEYWORDS = {
    classes: ['пары', 'пара', 'лекци', 'семинар', 'универ', 'академи'],
    selfstudy: ['самоподготов', 'учеба', 'учёба', 'учил', 'домашк', 'дз', 'подготовк', 'конспект', 'зачет', 'экзамен'],
    thesis: ['вкр', 'диплом'],
    'work-office': ['работа', 'офис', 'смена', 'очная'],
    'work-remote': ['дистанц', 'удаленк', 'удалёнк', 'фриланс', 'работа дист'],
    extra: ['мероприят', 'конференц', 'волонт', 'студсовет', 'олимпиад', 'внеучеб'],
    sport: ['спорт', 'зал', 'трениров', 'бег', 'футбол', 'зарядк', 'бассейн', 'йога'],
    road: ['дорог', 'путь', 'автобус', 'такси', 'метро', 'ехал', 'транспорт'],
    fun: ['отдых', 'кино', 'сериал', 'игры', 'игра', 'друзья', 'прогулк', 'гулял', 'развлеч'],
    chores: ['быт', 'уборк', 'готовк', 'магазин', 'стирк', 'продукт'],
    sleep: ['сон', 'спал', 'поспал', 'спать']
  };

  var WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  function ico(path) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
  var I = {
    left: ico('<path d="m15 6-6 6 6 6"/>'),
    right: ico('<path d="m9 6 6 6-6 6"/>'),
    edit: ico('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>'),
    plus: ico('<path d="M12 5v14M5 12h14"/>'),
    repeat: ico('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>')
  };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }

  // ---------- Настройки ----------
  function cats() { return clone(Store.getSetting('time.categories', DEFAULT_CATS)); }
  function catName(id) { var c = cats().find(function (x) { return x.id === id; }); return c ? c.name : 'Без категории'; }
  function shiftCfg() {
    return Object.assign({ enabled: false, days: [1, 2, 3, 4, 5], start: '10:00', end: '13:00', category: 'work-office', since: '' },
      clone(Store.getSetting('time.shifts', {})));
  }

  // ---------- Время и длительность ----------
  function toMin(hm) { var p = String(hm).split(':'); return (+p[0]) * 60 + (+(p[1] || 0)); }
  function fromMin(m) { m = ((m % 1440) + 1440) % 1440; return U.pad(Math.floor(m / 60)) + ':' + U.pad(m % 60); }
  function span(start, end) { var d = toMin(end) - toMin(start); return d <= 0 ? d + 1440 : d; } // через полночь — тоже ок
  function fmtDur(min) {
    min = Math.round(min);
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' мин';
    return h + ' ч' + (m ? ' ' + m + ' мин' : '');
  }
  function fmtHours(min) {
    var h = Math.round(min / 6) / 10;
    return (h % 1 === 0 ? String(h) : h.toFixed(1).replace('.', ',')) + ' ч';
  }
  function nowHM() { var d = new Date(); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); }

  function mondayOf(date) {
    var d = U.toDate(date);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return U.iso(d);
  }
  function addDays(date, n) { var d = U.toDate(date); d.setDate(d.getDate() + n); return U.iso(d); }

  // ---------- Записи за период ----------
  function shiftEntries(from, to) {
    var c = shiftCfg();
    if (!c.enabled || !c.since) return [];
    var ov = {};
    Store.list('time.shiftOverrides').forEach(function (o) { ov[o.date] = o; });
    var out = [], today = U.today(), now = nowHM();
    for (var iso = from; iso <= to; iso = addDays(iso, 1)) {
      if (iso < c.since || iso > today) continue;
      var o = ov[iso];
      var isDay = c.days.indexOf(U.toDate(iso).getDay()) !== -1;
      if (!isDay && !(o && !o.skip)) continue;
      if (o && o.skip) continue;
      var s = (o && o.start) || c.start, e = (o && o.end) || c.end;
      if (iso === today && now < e) continue; // сегодняшняя смена засчитается, когда закончится
      out.push({ id: 'shift-' + iso, date: iso, category: c.category, start: s, end: e, minutes: span(s, e),
        note: o ? 'Смена (изменена)' : 'Смена по графику', virtual: true });
    }
    return out;
  }

  function entriesBetween(from, to) {
    var list = Store.list('time.entries').filter(function (e) { return e.date >= from && e.date <= to; });
    return list.concat(shiftEntries(from, to));
  }

  function sumByCat(list) {
    var m = {};
    list.forEach(function (e) { m[e.category] = (m[e.category] || 0) + e.minutes; });
    return m;
  }
  function total(list) { return list.reduce(function (s, e) { return s + e.minutes; }, 0); }

  // ---------- Быстрая строка ----------
  // «вкр 2ч», «спорт 45м вчера», «работа 10-13», «сон 23:30-7:30», «учёба 1ч20м 5.11»
  function matchCategory(text) {
    var t = ' ' + norm(text) + ' ';
    var best = null, bestLen = 0;
    var list = cats();
    Object.keys(KEYWORDS).forEach(function (id) {
      if (!list.some(function (c) { return c.id === id; })) return;
      KEYWORDS[id].forEach(function (w) {
        if (w.length > bestLen && t.indexOf(norm(w)) !== -1) { best = id; bestLen = w.length; }
      });
    });
    // Свои категории — по названию.
    list.forEach(function (c) {
      var n = norm(c.name);
      if (n.length > bestLen && t.indexOf(' ' + n) !== -1) { best = c.id; bestLen = n.length; }
    });
    return best;
  }

  function parseEntry(text) {
    var src = String(text || '')
      .replace(/\s*[–—-]\s*/g, '-')
      // «2 ч», «1 час», «30 мин» → «2ч», «1час», «30мин»
      .replace(/(\d+(?:[.,]\d+)?)\s+(ч|час[а-я]*|м|мин[а-я]*)(?=\s|$)/gi, '$1$2')
      .trim();
    var tokens = src.split(/\s+/).filter(Boolean);
    var res = { minutes: 0, start: '', end: '', date: '', category: '', note: '' };
    var rest = [];
    tokens.forEach(function (tk) {
      var low = norm(tk);
      var m;
      if ((m = low.match(/^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/)) && +m[1] < 24 && +m[3] < 24) {
        res.start = U.pad(+m[1]) + ':' + (m[2] || '00');
        res.end = U.pad(+m[3]) + ':' + (m[4] || '00');
        res.minutes = span(res.start, res.end);
        return;
      }
      if ((m = low.match(/^(\d+)(?:ч|час[а-я]*)(\d+)(?:м|мин[а-я]*)?$/))) { res.minutes += (+m[1]) * 60 + (+m[2]); return; }
      if ((m = low.match(/^(\d+(?:[.,]\d+)?)(?:ч|час[а-я]*|h)$/))) { res.minutes += Math.round(parseFloat(m[1].replace(',', '.')) * 60); return; }
      if ((m = low.match(/^(\d+)(?:м|мин[а-я]*|m)$/))) { res.minutes += +m[1]; return; }
      rest.push(tk);
    });
    // Голое число без единиц — часы («вкр 2»).
    if (!res.minutes) {
      for (var i = rest.length - 1; i >= 0; i--) {
        if (/^\d+(?:[.,]5)?$/.test(rest[i]) && parseFloat(rest[i].replace(',', '.')) <= 16) {
          res.minutes = Math.round(parseFloat(rest[i].replace(',', '.')) * 60);
          rest.splice(i, 1);
          break;
        }
      }
    }
    var p = Tabs.work.parseTask(rest.join(' ')); // дата: «сегодня», «вчера», «5.11»
    res.date = p.due;
    if (/(^|\s)вчера(\s|$)/i.test(rest.join(' '))) res.date = addDays(U.today(), -1);
    if (/(^|\s)позавчера(\s|$)/i.test(rest.join(' '))) res.date = addDays(U.today(), -2);
    var words = (p.title || '').split(/\s+/).filter(function (w) { return !/^(вчера|позавчера)$/i.test(w); });
    res.note = words.join(' ');
    res.category = matchCategory(res.note);
    return res;
  }

  // ============================================================
  //  Отрисовка
  // ============================================================
  var state = { week: mondayOf(U.today()) };
  var host = null, wrap = null, refocus = false;

  function render(el) {
    host = el;
    wrap = document.createElement('div');
    wrap.className = 'time';
    wrap.innerHTML = headHtml() + quickHtml() + weekHtml() + shiftsHtml();
    el.innerHTML = '';
    el.appendChild(wrap);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('input', onInput);
    wrap.addEventListener('submit', onSubmit);
    if (refocus) {
      var q = wrap.querySelector('[data-role="time-quick"]');
      if (q) q.focus({ preventScroll: true });
      refocus = false;
    }
  }
  function rerender() { if (host) render(host); }

  function weekTitle(mon) {
    var sun = addDays(mon, 6);
    return U.toDate(mon).getDate() + ' ' + U.monthGen(mon) + ' – ' + U.toDate(sun).getDate() + ' ' + U.monthGen(sun);
  }

  function headHtml() {
    return (
      '<header class="page-head"><h1>Время</h1><p class="lead">На что уходят часы</p></header>' +
      '<div class="toolbar"><span></span><div class="month-switch">' +
        '<button type="button" class="icon-btn" data-action="week" data-step="-1" aria-label="Предыдущая неделя">' + I.left + '</button>' +
        '<span class="month-label">' + esc(weekTitle(state.week)) + '</span>' +
        '<button type="button" class="icon-btn" data-action="week" data-step="1" aria-label="Следующая неделя">' + I.right + '</button>' +
      '</div></div>'
    );
  }

  var QUICK_HINT = 'Например: «вкр 2ч», «спорт 45м вчера», «дорога 1,5ч», «работа 10-13», «сон 23:30-7:30».';

  function quickHtml() {
    return (
      '<form class="quick card" data-form="time-quick" autocomplete="off">' +
        '<div class="quick-row"><input type="text" data-role="time-quick" enterkeyhint="done" aria-label="Записать время" placeholder="Записать: вкр 2ч · спорт 45м вчера">' +
        '<button type="submit" class="btn btn-primary">Добавить</button></div>' +
        '<div class="quick-preview" id="time-preview">' + QUICK_HINT + '</div>' +
      '</form>'
    );
  }

  function preview(text) {
    if (!text.trim()) return QUICK_HINT;
    var p = parseEntry(text);
    return [
      p.category ? '<b>' + esc(catName(p.category)) + '</b>' : '<span class="warn">категорию выберешь в форме</span>',
      p.minutes ? fmtDur(p.minutes) + (p.start ? ' (' + p.start + '–' + p.end + ')' : '') : '<span class="warn">нет длительности</span>',
      U.dayLabel(p.date || U.today())
    ].join(' · ');
  }

  function deltaChip(cur, prev) {
    var d = cur - prev;
    if (Math.abs(d) < 6) return '<span class="delta">= как на прошлой</span>';
    return '<span class="delta ' + (d > 0 ? 'delta--up' : 'delta--down') + '">' + (d > 0 ? '+' : '−') + fmtHours(Math.abs(d)) + '</span>';
  }

  function weekHtml() {
    var mon = state.week, sun = addDays(mon, 6);
    var prevMon = addDays(mon, -7), prevSun = addDays(mon, -1);
    var cur = entriesBetween(mon, sun), prev = entriesBetween(prevMon, prevSun);
    var curBy = sumByCat(cur), prevBy = sumByCat(prev);
    var curTotal = total(cur), prevTotal = total(prev);

    function group(ids) { return ids.reduce(function (s, id) { return s + (curBy[id] || 0); }, 0); }
    function groupPrev(ids) { return ids.reduce(function (s, id) { return s + (prevBy[id] || 0); }, 0); }
    var studyIds = ['classes', 'selfstudy', 'thesis'], workIds = ['work-office', 'work-remote'];

    var tiles =
      '<div class="grid grid--3">' +
        tile('Записано за неделю', fmtHours(curTotal), deltaChip(curTotal, prevTotal)) +
        tile('Учёба и ВКР', fmtHours(group(studyIds)), deltaChip(group(studyIds), groupPrev(studyIds))) +
        tile('Работа', fmtHours(group(workIds)), deltaChip(group(workIds), groupPrev(workIds))) +
      '</div>';

    // На что ушли часы: эта неделя (цвет) и прошлая (серая тонкая полоска).
    var ids = Object.keys(curBy).concat(Object.keys(prevBy)).filter(function (v, i, a) { return a.indexOf(v) === i; });
    ids.sort(function (a, b) { return (curBy[b] || 0) - (curBy[a] || 0) || (prevBy[b] || 0) - (prevBy[a] || 0); });
    var max = ids.reduce(function (m, id) { return Math.max(m, curBy[id] || 0, prevBy[id] || 0); }, 1);
    var rows = ids.map(function (id) {
      var c = curBy[id] || 0, p = prevBy[id] || 0;
      var share = curTotal ? Math.round(c / curTotal * 100) : 0;
      return (
        '<div class="cat-row" data-tip="' + esc(catName(id) + '\nЭта неделя: ' + fmtDur(c) + (c ? ' · ' + share + '%' : '') + '\nПрошлая неделя: ' + fmtDur(p)) + '">' +
          '<div class="cat-top"><span class="cat-name">' + esc(catName(id)) + '</span>' +
            '<span class="cat-val">' + fmtHours(c) + ' ' + deltaChip(c, p) + '</span></div>' +
          '<div class="cat-bar"><span style="width:' + (c ? Math.max(1, c / max * 100) : 0).toFixed(1) + '%"></span></div>' +
          '<div class="cat-bar cat-bar--prev"><span style="width:' + (p ? Math.max(1, p / max * 100) : 0).toFixed(1) + '%"></span></div>' +
        '</div>'
      );
    }).join('');
    var tableRows = ids.map(function (id) {
      return '<tr><td>' + esc(catName(id)) + '</td><td class="num">' + fmtDur(curBy[id] || 0) + '</td><td class="num">' + fmtDur(prevBy[id] || 0) + '</td></tr>';
    }).join('');
    var chart =
      '<section class="card chart-card">' +
        '<div class="chart-head"><h2>На что ушли часы</h2><span class="chart-sub">' + esc(weekTitle(mon)) + '</span></div>' +
        (rows
          ? '<div class="legend"><span><i class="key key--line"></i>Эта неделя</span><span><i class="key key--prev"></i>Прошлая неделя</span></div>' +
            '<div class="cat-rows">' + rows + '</div>' +
            '<details class="chart-table"><summary>Таблица</summary><div class="table-scroll"><table><thead><tr><th>Категория</th><th class="num">Эта неделя</th><th class="num">Прошлая</th></tr></thead><tbody>' +
              tableRows + '</tbody></table></div></details>'
          : '<p class="chart-empty">За эту неделю пока ничего не записано.</p>') +
      '</section>';

    // По дням
    var days = '';
    for (var i = 0; i < 7; i++) {
      var d = addDays(mon, i);
      var list = cur.filter(function (e) { return e.date === d; })
        .sort(function (a, b) { return (a.start || '99').localeCompare(b.start || '99'); });
      var isToday = d === U.today();
      days +=
        '<div class="week-day' + (isToday ? ' is-today' : '') + '">' +
          '<div class="week-day-title">' + WD_FULL[U.toDate(d).getDay()] + ', ' + U.toDate(d).getDate() + ' ' + U.monthGen(d) +
            (list.length ? ' · ' + fmtDur(total(list)) : '') + '</div>' +
          (list.length ? '<ul class="time-list">' + list.map(entryItem).join('') + '</ul>' : '<div class="muted time-empty">—</div>') +
        '</div>';
    }

    return tiles + '<div class="charts charts--single">' + chart + '</div>' +
      '<h2 class="section-title">По дням</h2><div class="card week-card">' + days + '</div>';
  }

  function tile(label, value, extra) {
    return '<div class="card tile"><div class="tile-label">' + label + '</div><div class="tile-value">' + value + '</div>' +
      (extra ? '<div class="tile-extra">' + extra + '</div>' : '') + '</div>';
  }

  function entryItem(e) {
    return (
      '<li><button type="button" class="time-item" data-action="' + (e.virtual ? 'edit-shift' : 'edit-entry') + '" data-id="' + esc(e.id) + '" data-date="' + e.date + '">' +
        '<span class="time-when">' + (e.start ? esc(e.start) + '–' + esc(e.end) : '') + '</span>' +
        '<span class="time-main"><span class="tx-title">' + esc(catName(e.category)) + (e.virtual ? ' ' + I.repeat : '') + '</span>' +
          (e.note ? '<span class="tx-sub">' + esc(e.note) + '</span>' : '') + '</span>' +
        '<span class="time-dur">' + fmtDur(e.minutes) + '</span>' +
      '</button></li>'
    );
  }

  function shiftsHtml() {
    var c = shiftCfg();
    var days = c.days.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); }).map(function (d) { return WD_SHORT[d]; }).join(', ');
    return (
      '<section class="card settings-card time-settings">' +
        '<div class="card-head"><h2>Шаблон смен</h2><button type="button" class="btn btn-ghost" data-action="edit-shifts">' + I.edit + 'Изменить</button></div>' +
        (c.enabled
          ? '<p class="field-hint">' + esc(days) + ' · ' + esc(c.start) + '–' + esc(c.end) + ' · ' + esc(catName(c.category)) +
              (c.since ? ' · считается с ' + U.toDate(c.since).getDate() + ' ' + U.monthGen(c.since) : '') +
              '. Прошедшие смены засчитываются сами. Если смены не было или она была другой — нажми на неё в списке по дням.</p>'
          : '<p class="field-hint">Шаблон выключен. Включи, если работаешь по постоянному графику — смены будут считаться сами.</p>') +
        '<div class="btn-row"><button type="button" class="btn btn-small" data-action="edit-cats">Категории</button></div>' +
      '</section>'
    );
  }

  // ============================================================
  //  Диалоги
  // ============================================================
  function catOptions() { return cats().map(function (c) { return { value: c.id, label: c.name }; }); }

  function entryDialog(e, prefill) {
    var editing = !!e;
    var p = prefill || {};
    var v0 = editing
      ? { category: e.category, date: e.date, start: e.start || '', end: e.end || '', duration: e.start ? '' : fmtDur(e.minutes), note: e.note || '' }
      : { category: p.category || cats()[0].id, date: p.date || U.today(), start: p.start || '', end: p.end || '', duration: p.minutes && !p.start ? fmtDur(p.minutes) : '', note: p.note || '' };
    U.formDialog({
      title: editing ? 'Запись времени' : 'Новая запись времени',
      values: v0,
      fields: [
        { name: 'category', type: 'select', label: 'Категория', options: catOptions() },
        { name: 'date', type: 'date', label: 'Дата' },
        { name: 'start', type: 'text', label: 'С', placeholder: '10:00', half: true, maxlength: 5 },
        { name: 'end', type: 'text', label: 'До', placeholder: '13:00', half: true, maxlength: 5 },
        { name: 'duration', type: 'text', label: 'Или сколько', placeholder: '2ч 30м', maxlength: 20 },
        { type: 'hint', text: 'Укажи время «с–до» или просто длительность.' },
        { name: 'note', type: 'text', label: 'Комментарий', maxlength: 120 }
      ],
      onSubmit: function (v) {
        var rec = { category: v.category, date: v.date, note: (v.note || '').trim(), start: '', end: '', minutes: 0 };
        var hm = /^\d{1,2}(:\d{2})?$/;
        if (v.start || v.end) {
          if (!hm.test(v.start) || !hm.test(v.end)) return 'Время пиши так: 10:00 и 13:00';
          rec.start = fromMin(toMin(v.start)); rec.end = fromMin(toMin(v.end));
          rec.minutes = span(rec.start, rec.end);
        } else {
          rec.minutes = parseEntry(v.duration || '').minutes;
        }
        if (!(rec.minutes > 0)) return 'Укажи длительность или время «с–до»';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.date)) return 'Укажи дату';
        if (editing) Store.update('time.entries', e.id, rec);
        else Store.add('time.entries', rec);
      },
      onDelete: editing ? function () {
        if (!confirm('Удалить запись?')) return false;
        Store.remove('time.entries', e.id);
      } : null
    });
  }

  function shiftDialog(date) {
    var c = shiftCfg();
    var o = Store.list('time.shiftOverrides').find(function (x) { return x.date === date; });
    U.formDialog({
      title: 'Смена · ' + WD_SHORT[U.toDate(date).getDay()] + ' ' + U.toDate(date).getDate() + ' ' + U.monthGen(date),
      values: { status: o ? (o.skip ? 'skip' : 'other') : 'usual', start: (o && o.start) || c.start, end: (o && o.end) || c.end },
      fields: function (v) {
        var f = [{ name: 'status', type: 'seg', label: 'Смена', rerender: true, options: [
          { value: 'usual', label: 'Как обычно' }, { value: 'other', label: 'Другое время' }, { value: 'skip', label: 'Не было' }] }];
        if (v.status === 'other') {
          f.push({ name: 'start', type: 'text', label: 'С', half: true, maxlength: 5 });
          f.push({ name: 'end', type: 'text', label: 'До', half: true, maxlength: 5 });
        }
        f.push({ type: 'hint', text: 'По графику: ' + c.start + '–' + c.end + '.' });
        return f;
      },
      onSubmit: function (v) {
        if (o) Store.remove('time.shiftOverrides', o.id);
        if (v.status === 'skip') Store.add('time.shiftOverrides', { date: date, skip: true });
        else if (v.status === 'other') {
          var hm = /^\d{1,2}(:\d{2})?$/;
          if (!hm.test(v.start) || !hm.test(v.end)) return 'Время пиши так: 10:00 и 13:00';
          Store.add('time.shiftOverrides', { date: date, start: fromMin(toMin(v.start)), end: fromMin(toMin(v.end)) });
        }
      }
    });
  }

  function shiftsDialog() {
    var c = shiftCfg();
    var dayOpts = [1, 2, 3, 4, 5, 6, 0];
    U.formDialog({
      title: 'Шаблон смен',
      values: {
        enabled: c.enabled ? '1' : '0',
        days: c.days.slice().sort(function (a, b) { return dayOpts.indexOf(a) - dayOpts.indexOf(b); }).map(function (d) { return WD_SHORT[d]; }).join(', '),
        start: c.start, end: c.end, category: c.category, since: c.since || mondayOf(U.today())
      },
      fields: [
        { name: 'enabled', type: 'seg', label: 'Шаблон', options: [{ value: '1', label: 'Включён' }, { value: '0', label: 'Выключен' }] },
        { name: 'days', type: 'text', label: 'Дни недели', placeholder: 'пн, вт, ср, чт, пт', maxlength: 40 },
        { name: 'start', type: 'text', label: 'С', half: true, maxlength: 5 },
        { name: 'end', type: 'text', label: 'До', half: true, maxlength: 5 },
        { name: 'category', type: 'select', label: 'Категория', options: catOptions() },
        { name: 'since', type: 'date', label: 'Считать начиная с' }
      ],
      onSubmit: function (v) {
        var hm = /^\d{1,2}(:\d{2})?$/;
        if (!hm.test(v.start) || !hm.test(v.end)) return 'Время пиши так: 10:00 и 13:00';
        var days = parseDays(v.days);
        if (!days.length) return 'Укажи дни: например, «пн, вт, ср, чт, пт» или «пн-пт»';
        Store.setSetting('time.shifts', {
          enabled: v.enabled === '1', days: days, start: fromMin(toMin(v.start)), end: fromMin(toMin(v.end)),
          category: v.category, since: v.since || mondayOf(U.today())
        });
      }
    });
  }

  function parseDays(text) {
    var t = norm(text).replace(/\s+/g, '');
    var order = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
    var num = { 'пн': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'пт': 5, 'сб': 6, 'вс': 0 };
    var out = [];
    t.split(',').forEach(function (part) {
      var r = part.split('-');
      if (r.length === 2 && num[r[0]] !== undefined && num[r[1]] !== undefined) {
        for (var i = order.indexOf(r[0]); i <= order.indexOf(r[1]); i++) out.push(num[order[i]]);
      } else if (num[part] !== undefined) out.push(num[part]);
    });
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  function catsDialog() {
    var list = cats();
    U.formDialog({
      title: 'Категории времени',
      submitLabel: 'Сохранить',
      values: { text: list.map(function (c) { return c.name; }).join('\n') },
      fields: [
        { name: 'text', type: 'textarea', label: 'По одной на строке', rows: 12, maxlength: 2000 },
        { type: 'hint', text: 'Переименование сохраняет старые записи. Если убрать категорию, у которой есть записи, она вернётся.' }
      ],
      onSubmit: function (v) {
        var names = String(v.text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!names.length) return 'Нужна хотя бы одна категория';
        var used = {};
        Store.list('time.entries').forEach(function (e) { used[e.category] = true; });
        used[shiftCfg().category] = true;
        // Строки сопоставляем с прежними категориями по порядку: переименование сохраняет id.
        var next = names.map(function (n, i) {
          var old = list[i];
          return old ? { id: old.id, name: n } : { id: 'c' + U.uid(), name: n };
        });
        list.slice(names.length).forEach(function (old) { if (used[old.id]) next.push(old); });
        Store.setSetting('time.categories', next);
      }
    });
  }

  // ============================================================
  //  События
  // ============================================================
  function onClick(ev) {
    var b = ev.target.closest('[data-action]');
    if (!b) return;
    switch (b.dataset.action) {
      case 'week': state.week = addDays(state.week, 7 * (+b.dataset.step)); rerender(); break;
      case 'edit-entry': entryDialog(Store.list('time.entries').find(function (e) { return e.id === b.dataset.id; })); break;
      case 'edit-shift': shiftDialog(b.dataset.date); break;
      case 'edit-shifts': shiftsDialog(); break;
      case 'edit-cats': catsDialog(); break;
    }
  }

  function onInput(ev) {
    if (ev.target.dataset.role === 'time-quick') {
      var pv = wrap.querySelector('#time-preview');
      if (pv) pv.innerHTML = preview(ev.target.value);
    }
  }

  function onSubmit(ev) {
    if (ev.target.dataset.form !== 'time-quick') return;
    ev.preventDefault();
    var input = ev.target.querySelector('[data-role="time-quick"]');
    if (!input.value.trim()) return;
    var p = parseEntry(input.value);
    if (p.category && p.minutes > 0) {
      refocus = true;
      Store.add('time.entries', { category: p.category, date: p.date || U.today(), minutes: p.minutes, start: p.start, end: p.end, note: p.note });
      U.toast('Записано: ' + catName(p.category) + ' · ' + fmtDur(p.minutes));
    } else {
      entryDialog(null, p);
      input.value = '';
    }
  }

  // ---------- Для сводки ----------
  function summary() {
    var mon = mondayOf(U.today());
    var list = entriesBetween(mon, addDays(mon, 6));
    var by = sumByCat(list);
    var top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0];
    return {
      value: fmtHours(total(list)),
      hint: top ? 'Больше всего — ' + esc(catName(top)) + ', ' + fmtHours(by[top]) : 'За неделю пока ничего не записано'
    };
  }

  // Смена по графику на дату (даже если она ещё не прошла) — для блока «Сегодня».
  function scheduledShift(date) {
    var c = shiftCfg();
    if (!c.enabled || !c.since || date < c.since) return null;
    var o = Store.list('time.shiftOverrides').find(function (x) { return x.date === date; });
    if (o && o.skip) return null;
    var isDay = c.days.indexOf(U.toDate(date).getDay()) !== -1;
    if (!isDay && !o) return null;
    var s = (o && o.start) || c.start, e = (o && o.end) || c.end;
    return { start: s, end: e, category: catName(c.category) };
  }

  function weekStats() {
    var mon = mondayOf(U.today());
    var cur = entriesBetween(mon, addDays(mon, 6));
    var prev = entriesBetween(addDays(mon, -7), addDays(mon, -1));
    return { minutes: total(cur), prevMinutes: total(prev), text: fmtHours(total(cur)), prevText: fmtHours(total(prev)) };
  }

  function quickAdd(text) {
    var p = parseEntry(text);
    if (!p.category || !(p.minutes > 0)) return false;
    Store.add('time.entries', { category: p.category, date: p.date || U.today(), minutes: p.minutes, start: p.start, end: p.end, note: p.note });
    U.toast('Записано: ' + catName(p.category) + ' · ' + fmtDur(p.minutes));
    return true;
  }

  window.Tabs.time = {
    render: render, summary: summary, parseEntry: parseEntry, scheduledShift: scheduledShift, weekStats: weekStats,
    quickAdd: quickAdd, catName: catName, fmtDur: fmtDur,
    dayMinutes: function (date) { return total(entriesBetween(date, date)); },
    rangeMinutes: function (from, to) { return total(entriesBetween(from, to)); },
    rangeByCat: function (from, to) { return sumByCat(entriesBetween(from, to)); },
    newEntry: function () { entryDialog(null); }
  };
})();
