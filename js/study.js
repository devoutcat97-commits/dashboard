/* ============================================================
   Вкладка «Учёба».

   Разделы: Пары · Задания · Оценки · ВКР · Внеучебное.

   - Пары берутся из файла data/schedule.json — его готовит программа
     tools/fetch_schedule.py с сайта alt.ranepa.ru (сайт не даёт читать себя из браузера напрямую).
   - Задания (домашки):  Store 'study.homework'  {subject, title, due, done, note}
   - Сессия и оценки:     Store 'study.exams'     {subject, kind, semester, date, result, note}
   - ВКР:                 настройка 'study.thesis' {topic, supervisor, stages: [{id, name, due, done}]}
   - Мероприятия:         Store 'study.events'    {title, date, time, place, role, note, todo: [{id, text, due, done}]}
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var esc = U.esc;
  window.Tabs = window.Tabs || {};

  var VIEWS = [['schedule', 'Пары'], ['homework', 'Задания'], ['grades', 'Оценки'], ['thesis', 'ВКР'], ['events', 'Внеучебное']];
  var WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  var WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  function ico(path) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
  var I = {
    plus: ico('<path d="M12 5v14M5 12h14"/>'),
    left: ico('<path d="m15 6-6 6 6 6"/>'),
    right: ico('<path d="m9 6 6 6-6 6"/>'),
    edit: ico('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>'),
    pin: ico('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>'),
    clock: ico('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>'),
    chevron: ico('<path d="m9 6 6 6-6 6"/>'),
    book: ico('<path d="M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5Zm0 0A2.5 2.5 0 0 0 6.5 22H20v-5"/>')
  };

  var state = { view: 'schedule', week: null, showDoneHw: false, showPastEvents: false };
  var host = null, wrap = null;

  // ============================================================
  //  Расписание: загрузка data/schedule.json
  // ============================================================
  var CACHE_KEY = 'dash:schedule-cache';
  var schedule = null, scheduleState = 'loading';
  try {
    var cached = localStorage.getItem(CACHE_KEY);
    if (cached) { schedule = JSON.parse(cached); scheduleState = 'cached'; }
  } catch (e) {}

  fetch('data/schedule.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (d) {
      schedule = d;
      scheduleState = 'fresh';
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) {}
      // Данные из облака могут прийти чуть позже — дадим им пару секунд, чтобы не создать дубли.
      setTimeout(syncSession, 4000);
      refresh();
    })
    .catch(function () {
      scheduleState = schedule ? 'cached' : 'error';
      refresh();
    });

  function refresh() {
    if (wrap && wrap.isConnected) rerender();
    else if (window.App && App.softRefresh) App.softRefresh();
  }

  function allLessons() {
    if (!schedule || !schedule.weeks) return [];
    var out = [];
    schedule.weeks.forEach(function (w) { out = out.concat(w.lessons || []); });
    return out.sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
  }
  function lessonsOn(date) { return allLessons().filter(function (l) { return l.date === date; }); }

  // Сессия из расписания сайта: экзамены и зачёты сами попадают в «Оценки → Сессия».
  // Консультации остаются в расписании как обычные пары. Добавленное вручную не трогаем.
  function sessionKind(type) {
    var t = String(type || '').toLowerCase();
    if (/^экз/.test(t)) return 'exam';
    if (/диф/.test(t) && /зач/.test(t)) return 'diff';
    if (/зач/.test(t)) return 'credit';
    return '';
  }
  function syncSession() {
    if (!schedule) return;
    var today = U.today();
    var exams = Store.list('study.exams');
    var seen = {};   // экзамены, уже обновлённые в этот проход (вторая строка того же дня — не трогаем)
    allLessons().forEach(function (l) {
      var kind = sessionKind(l.type);
      if (!kind || l.date < today) return;
      var note = 'По расписанию: ' + l.start + (l.room ? ', ауд. ' + l.room : '') + (l.teacher ? ', ' + l.teacher : '');
      var same = exams.find(function (e) { return e.subject === l.subject && e.kind === kind && !e.result; });
      if (!same) {
        var rec = Store.add('study.exams', { subject: l.subject, kind: kind, date: l.date, semester: currentSemester(), result: '', note: note, fromSchedule: true, tickets: [] });
        seen[rec.id] = true;
        exams.push(rec);
      } else if (same.fromSchedule && same.date === l.date && same.note !== note && seen[same.id]) {
        // вторая строка того же экзамена в тот же день — оставляем время начала
      } else if (same.fromSchedule && (same.date !== l.date || same.note !== note)) {
        seen[same.id] = true;
        Store.update('study.exams', same.id, { date: l.date, note: note });
      } else if (!same.date) {
        Store.update('study.exams', same.id, { date: l.date });
      }
    });
  }
  function subjects() {
    var set = {};
    allLessons().forEach(function (l) { set[l.subject] = true; });
    Store.list('study.exams').forEach(function (e) { if (e.subject) set[e.subject] = true; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
  }

  function nowHM() { var d = new Date(); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); }

  // День, который показываем сверху: сегодня, если пары ещё не кончились, иначе ближайший учебный.
  function focusDay() {
    var today = U.today();
    var t = lessonsOn(today);
    if (t.length && t[t.length - 1].end > nowHM()) return today;
    var next = allLessons().find(function (l) { return l.date > today; });
    return next ? next.date : null;
  }

  // Следующая пара по предмету после даты (для срока домашки).
  function nextLessonOf(subject, afterDate) {
    return allLessons().find(function (l) { return l.subject === subject && l.date > afterDate; }) || null;
  }

  function dayTitle(date) {
    var d = U.toDate(date);
    var label = d.getDate() + ' ' + U.monthGen(date);
    var n = daysUntil(date);
    var prefix = n === 0 ? 'Сегодня · ' : n === 1 ? 'Завтра · ' : '';
    return prefix + WEEKDAYS[d.getDay()] + ', ' + label;
  }
  function daysUntil(date) { return Math.round((U.toDate(date) - U.toDate(U.today())) / 864e5); }
  function shortDate(date) { var d = U.toDate(date); return WD_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + U.monthGen(date); }

  function dueText(due) {
    if (!due) return { text: 'без срока', cls: '' };
    var n = daysUntil(due);
    if (n < 0) return { text: 'просрочено · ' + shortDate(due), cls: 'is-late' };
    if (n === 0) return { text: 'сегодня', cls: 'is-soon' };
    if (n === 1) return { text: 'завтра', cls: 'is-soon' };
    return { text: shortDate(due) + ' · через ' + n + ' ' + U.plural(n, 'день', 'дня', 'дней'), cls: '' };
  }

  // ============================================================
  //  Отрисовка
  // ============================================================
  function render(el) {
    host = el;
    wrap = document.createElement('div');
    wrap.className = 'study';
    wrap.innerHTML =
      '<header class="page-head"><h1>Учёба</h1><p class="lead">Пары, задания, сессия, ВКР и мероприятия</p></header>' +
      toolbarHtml() + '<div class="study-body">' + bodyHtml() + '</div>';
    el.innerHTML = '';
    el.appendChild(wrap);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('change', onChange);
    wrap.addEventListener('input', onInput);
    wrap.addEventListener('submit', onSubmit);
    wrap.addEventListener('fx:swipe', function (e) {
      var h = find('study.homework', e.detail.id);
      if (!h) return;
      if (e.detail.dir === 'right') Store.update('study.homework', h.id, { done: !h.done, doneAt: h.done ? '' : new Date().toISOString() });
      else {
        Store.remove('study.homework', h.id);
        U.toast('Задание удалено', { action: 'Отменить', onAction: function () { Store.restore('study.homework', h); } });
      }
    });
    if (pendingFocus) {
      var f = wrap.querySelector(pendingFocus);
      if (f) f.focus({ preventScroll: true });
      pendingFocus = null;
    }
  }
  var pendingFocus = null;
  function rerender() { if (host) render(host); }

  function toolbarHtml() {
    var tabs = VIEWS.map(function (v) {
      return '<button type="button" role="tab" aria-selected="' + (state.view === v[0]) + '" data-action="view" data-view="' + v[0] + '">' + v[1] + '</button>';
    }).join('');
    return '<div class="toolbar"><div class="segmented segmented--scroll" role="tablist" aria-label="Разделы учёбы">' + tabs + '</div></div>';
  }

  function bodyHtml() {
    switch (state.view) {
      case 'homework': return homeworkHtml();
      case 'grades': return gradesHtml();
      case 'thesis': return thesisHtml();
      case 'events': return eventsHtml();
      default: return scheduleHtml();
    }
  }

  // ============================================================
  //  Пары
  // ============================================================
  function lessonItem(l, opts) {
    var now = nowHM();
    var isToday = l.date === U.today();
    var isNow = isToday && l.start <= now && now < l.end;
    var isPast = l.date < U.today() || (isToday && l.end <= now);
    var hw = Store.list('study.homework').filter(function (h) { return !h.done && h.subject === l.subject && h.due === l.date; });
    var type = /лек/.test(l.type) ? 'лекция' : /пр/.test(l.type) ? 'практика' : l.type;
    var akey = l.date + '|' + l.num + '|' + l.subject;
    var absent = !!attendance()[akey];
    var started = l.date < U.today() || (isToday && l.start <= now);
    var att = started
      ? '<button type="button" class="att-chip' + (absent ? ' is-absent' : '') + '" data-action="absent" data-key="' + esc(akey) + '" data-subject="' + esc(l.subject) + '" data-date="' + l.date + '"' +
          ' aria-pressed="' + absent + '" data-tip="' + (absent ? 'Отмечен пропуск — нажми, чтобы убрать' : 'Нажми, если пропустил пару') + '">' + (absent ? 'пропуск' : 'был') + '</button>'
      : '';
    return (
      '<li class="lesson' + (isNow ? ' is-now' : '') + (isPast && opts.dimPast && !absent ? ' is-past' : '') + (absent ? ' is-absent' : '') + '">' + att +
        '<div class="lesson-time"><span>' + esc(l.start) + '</span><span>' + esc(l.end) + '</span></div>' +
        '<div class="lesson-main">' +
          '<div class="lesson-subj">' + esc(l.subject) + '</div>' +
          '<div class="lesson-meta"><span class="lesson-type lesson-type--' + (/лек/.test(l.type) ? 'lec' : 'pr') + '">' + esc(type) + '</span>' +
            (l.room ? ' · ' + esc(l.room) : '') + (l.teacher ? ' · ' + esc(l.teacher) : '') + '</div>' +
          (isNow ? '<div class="lesson-now">Идёт сейчас · до ' + esc(l.end) + '</div>' : '') +
          hw.map(function (h) { return '<div class="lesson-hw">' + I.book + esc(h.title) + '</div>'; }).join('') +
        '</div>' +
      '</li>'
    );
  }

  // ---------- Посещаемость ----------
  // Храним только пропуски: { 'дата|номер|предмет': { date, subject } }. Всё остальное — «был».
  function attendance() { return Store.getSetting('study.attendance', {}) || {}; }
  function toggleAbsent(key, subject, date) {
    var a = JSON.parse(JSON.stringify(attendance()));
    if (a[key]) delete a[key];
    else a[key] = { date: date, subject: subject };
    Store.setSetting('study.attendance', a);
  }
  function absenceHtml() {
    var a = attendance();
    var by = {};
    Object.keys(a).forEach(function (k) { var s = a[k].subject; by[s] = (by[s] || 0) + 1; });
    var subjectsList = Object.keys(by).sort(function (x, y) { return by[y] - by[x]; });
    if (!subjectsList.length) return '';
    var totalN = subjectsList.reduce(function (s, k) { return s + by[k]; }, 0);
    return (
      '<section class="card absence-card"><div class="card-head"><h2>Пропуски</h2><span class="muted">всего ' + totalN + '</span></div>' +
        '<ul class="rep-list">' + subjectsList.map(function (s) {
          var n = by[s];
          return '<li><span class="rep-name">' + esc(s) + '</span><span class="rep-val' + (n >= 3 ? ' is-late' : '') + '">' + n + ' ' + U.plural(n, 'пропуск', 'пропуска', 'пропусков') + '</span>' +
            (n >= 3 ? '<span class="delta delta--bad">многовато</span>' : '') + '</li>';
        }).join('') + '</ul>' +
      '</section>'
    );
  }

  function weekStarts() {
    return schedule && schedule.weeks ? schedule.weeks.map(function (w) { return w.start; }) : [];
  }
  function mondayOf(date) {
    var d = U.toDate(date);
    var shift = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - shift);
    return U.iso(d);
  }

  function scheduleHtml() {
    if (!schedule) {
      return '<div class="card empty-note">' + (scheduleState === 'error'
        ? 'Не удалось загрузить расписание. Проверь интернет или обнови файл расписания.'
        : 'Загружаю расписание…') + '</div>';
    }
    var day = focusDay();
    var top = day
      ? '<section class="card day-card"><div class="card-head"><h2>' + esc(dayTitle(day)) + '</h2>' +
          '<span class="muted">' + lessonsOn(day).length + ' ' + U.plural(lessonsOn(day).length, 'пара', 'пары', 'пар') + '</span></div>' +
          '<ul class="lesson-list">' + lessonsOn(day).map(function (l) { return lessonItem(l, { dimPast: true }); }).join('') + '</ul></section>'
      : '<div class="card empty-note">В загруженном расписании больше нет пар. Вероятно, академия ещё не опубликовала следующие недели.</div>';

    var weeks = weekStarts();
    if (!state.week || weeks.indexOf(state.week) === -1) {
      var cur = mondayOf(day || U.today());
      state.week = weeks.indexOf(cur) !== -1 ? cur : weeks[0];
    }
    var wi = weeks.indexOf(state.week);
    var wk = schedule.weeks[wi];
    var end = U.toDate(state.week); end.setDate(end.getDate() + 6);
    var title = U.toDate(state.week).getDate() + ' ' + U.monthGen(state.week) + ' – ' + end.getDate() + ' ' + U.monthGen(U.iso(end));
    var byDay = {};
    (wk.lessons || []).forEach(function (l) { (byDay[l.date] = byDay[l.date] || []).push(l); });
    var days = Object.keys(byDay).sort().map(function (d) {
      return '<div class="week-day' + (d === U.today() ? ' is-today' : '') + '"><div class="week-day-title">' + esc(dayTitle(d)) + '</div>' +
        '<ul class="lesson-list lesson-list--compact">' + byDay[d].map(function (l) { return lessonItem(l, { dimPast: false }); }).join('') + '</ul></div>';
    }).join('');

    var updated = schedule.updatedAt ? new Date(schedule.updatedAt) : null;
    var updatedText = updated ? updated.getDate() + ' ' + U.monthGen(U.iso(updated)) + ' в ' + U.pad(updated.getHours()) + ':' + U.pad(updated.getMinutes()) : '—';

    return (
      top +
      '<div class="section-row"><h2 class="section-title">Неделя</h2>' +
        '<div class="month-switch">' +
          '<button type="button" class="icon-btn" data-action="week" data-step="-1" aria-label="Предыдущая неделя"' + (wi <= 0 ? ' disabled' : '') + '>' + I.left + '</button>' +
          '<span class="month-label">' + esc(title) + '</span>' +
          '<button type="button" class="icon-btn" data-action="week" data-step="1" aria-label="Следующая неделя"' + (wi >= weeks.length - 1 ? ' disabled' : '') + '>' + I.right + '</button>' +
        '</div></div>' +
      (days ? '<div class="card week-card">' + days + '</div>' : U.empty({ emoji: '🗓️', title: 'Расписание ещё не опубликовано', text: 'Академия пока не выложила пары на эту неделю.' })) +
      absenceHtml() +
      '<p class="section-hint">Группа ' + esc(schedule.group || '') + ' · расписание обновлено ' + esc(updatedText) +
        ' · <a href="' + esc(schedule.source || 'https://alt.ranepa.ru/shedule/') + '" target="_blank" rel="noopener">открыть на сайте академии</a></p>'
    );
  }

  // ============================================================
  //  Задания
  // ============================================================
  function matchSubject(text) {
    var words = MoneyData.norm(text).split(' ').filter(Boolean);
    var best = null, bestScore = 0, bestLen = 1e9;
    subjects().forEach(function (s) {
      var sw = MoneyData.norm(s).split(' ').filter(function (w) { return w.length > 2; });
      var initials = MoneyData.norm(s).split(' ').filter(function (w) { return w.length > 1; }).map(function (w) { return w[0]; }).join('');
      var score = 0;
      sw.forEach(function (w) {
        var stem = w.slice(0, Math.min(5, w.length));
        if (words.some(function (iw) { return iw.length >= 4 && iw.indexOf(stem) === 0; })) score++;
      });
      if (initials.length >= 2 && words.indexOf(initials) !== -1) score += 2;
      if (score > bestScore || (score === bestScore && score > 0 && s.length < bestLen)) { best = s; bestScore = score; bestLen = s.length; }
    });
    return bestScore > 0 ? best : null;
  }

  function stripSubjectWords(text, subject) {
    if (!subject) return text;
    var sw = MoneyData.norm(subject).split(' ').filter(function (w) { return w.length > 2; }).map(function (w) { return w.slice(0, Math.min(5, w.length)); });
    var initials = MoneyData.norm(subject).split(' ').filter(function (w) { return w.length > 1; }).map(function (w) { return w[0]; }).join('');
    return text.split(/\s+/).filter(function (w) {
      var n = MoneyData.norm(w);
      if (n === initials) return false;
      return !(n.length >= 4 && sw.some(function (stem) { return n.indexOf(stem) === 0; }));
    }).join(' ').trim();
  }

  // «нотариат доклад по ст. 35 завтра» → предмет, задание, срок (по умолчанию — следующая пара по предмету)
  function parseHomework(text) {
    var p = Tabs.work.parseTask(text);
    var subject = matchSubject(p.title);
    var title = stripSubjectWords(p.title, subject) || p.title;
    var due = p.due;
    var auto = false;
    if (!due && subject) {
      var nl = nextLessonOf(subject, U.today());
      if (nl) { due = nl.date; auto = true; }
    }
    return { subject: subject || '', title: title, due: due, auto: auto };
  }

  var HW_HINT = 'Начни с предмета: «нотариат доклад по ст. 35». Срок подставится к следующей паре, или укажи «завтра», «15.11».';

  function homeworkPreview(text) {
    if (!text.trim()) return HW_HINT;
    var p = parseHomework(text);
    return [
      '<b>' + esc(p.subject || 'предмет не найден') + '</b>',
      esc(p.title || '…'),
      p.due ? (p.auto ? 'к паре ' : 'срок ') + shortDate(p.due) : 'без срока'
    ].join(' · ');
  }

  function homeworkHtml() {
    var list = Store.list('study.homework');
    var open = list.filter(function (h) { return !h.done; }).sort(function (a, b) {
      if (!!a.due !== !!b.due) return a.due ? -1 : 1;
      return (a.due || '').localeCompare(b.due || '') || (a.createdAt || '').localeCompare(b.createdAt || '');
    });
    var done = list.filter(function (h) { return h.done; }).sort(function (a, b) { return (b.doneAt || '').localeCompare(a.doneAt || ''); });
    var quick =
      '<form class="quick card" data-form="hw" autocomplete="off">' +
        '<div class="quick-row"><input type="text" data-role="hw-quick" enterkeyhint="done" aria-label="Новое задание" placeholder="Задание: нотариат доклад по ст. 35">' +
        '<button type="submit" class="btn btn-primary">Добавить</button></div>' +
        '<div class="quick-preview" id="hw-preview">' + HW_HINT + '</div>' +
      '</form>';
    function item(h) {
      var d = h.done ? { text: 'сделано', cls: '' } : dueText(h.due);
      var lesson = !h.done && h.due && h.subject ? lessonsOn(h.due).find(function (l) { return l.subject === h.subject; }) : null;
      return (
        '<li class="task swipe-item' + (h.done ? ' is-done' : '') + '" data-swipe="' + h.id + '"><div class="swipe-body">' +
          '<label class="task-check"><input type="checkbox" data-role="hw-done" data-id="' + h.id + '"' + (h.done ? ' checked' : '') + ' aria-label="Сделано: ' + esc(h.title) + '"></label>' +
          '<button type="button" class="task-main" data-action="edit-hw" data-id="' + h.id + '">' +
            '<span class="task-title">' + esc(h.title) + '</span>' +
            '<span class="task-meta">' + (h.subject ? esc(h.subject) + ' · ' : '') + '<span class="' + d.cls + '">' + esc(d.text) + '</span>' +
              (lesson ? ' · пара в ' + esc(lesson.start) : '') + '</span>' +
          '</button>' +
        '</div></li>'
      );
    }
    return (
      quick +
      (open.length ? '<ul class="task-list card">' + open.map(item).join('') + '</ul>'
        : U.empty(done.length
            ? { emoji: '🎉', title: 'Все задания сделаны!', text: 'Свободен до следующей пары.' }
            : { emoji: '📚', title: 'Заданий пока нет', text: 'Начни с предмета: «нотариат доклад по ст. 35» — срок подставится к следующей паре.', action: 'Добавить задание', attr: 'data-focus="[data-role=hw-quick]"' })) +
      (done.length ? '<button type="button" class="done-toggle" data-action="toggle-hw-done" aria-expanded="' + state.showDoneHw + '">' + I.chevron + 'Сделано · ' + done.length + '</button>' +
        (state.showDoneHw ? '<ul class="task-list card is-done">' + done.slice(0, 50).map(item).join('') + '</ul>' : '') : '')
    );
  }

  function subjectOptions(current) {
    var list = subjects();
    if (current && list.indexOf(current) === -1) list.unshift(current);
    return [{ value: '', label: 'Без предмета' }].concat(list.map(function (s) { return { value: s, label: s }; }));
  }

  function homeworkDialog(h) {
    var editing = !!h;
    U.formDialog({
      title: editing ? 'Задание' : 'Новое задание',
      values: editing ? { subject: h.subject, title: h.title, due: h.due || '', note: h.note || '' } : { subject: '', title: '', due: '', note: '' },
      fields: [
        { name: 'subject', type: 'select', label: 'Предмет', options: subjectOptions(editing ? h.subject : '') },
        { name: 'title', type: 'text', label: 'Что сделать', maxlength: 200, autofocus: !editing },
        { name: 'due', type: 'date', label: 'Срок' },
        { name: 'note', type: 'textarea', label: 'Подробности', placeholder: 'Номера задач, страницы, ссылки', maxlength: 1000 }
      ],
      onSubmit: function (v) {
        var title = (v.title || '').trim();
        if (!title) return 'Напиши, что нужно сделать';
        var rec = { subject: v.subject, title: title, due: v.due || '', note: (v.note || '').trim() };
        if (editing) Store.update('study.homework', h.id, rec);
        else Store.add('study.homework', Object.assign(rec, { done: false }));
      },
      onDelete: editing ? function () {
        if (!confirm('Удалить задание?')) return false;
        Store.remove('study.homework', h.id);
      } : null
    });
  }

  // ============================================================
  //  Оценки и сессия
  // ============================================================
  var KINDS = { exam: 'Экзамен', diff: 'Дифф. зачёт', credit: 'Зачёт', course: 'Курсовая' };

  function admissionYear() {
    var saved = Store.getSetting('study.admissionYear', 0);
    if (saved) return saved;
    var m = schedule && schedule.group ? String(schedule.group).match(/^\d(\d{2})/) : null;
    return m ? 2000 + +m[1] : new Date().getFullYear();
  }
  function currentSemester() {
    var d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1;
    var fall = m >= 9 || m === 1;
    var startYear = m >= 9 ? y : y - 1;
    var course = startYear - admissionYear() + 1;
    return Math.max(1, fall ? course * 2 - 1 : course * 2);
  }

  function gradeValue(e) { return /^[2-5]$/.test(e.result) && e.kind !== 'credit' ? +e.result : null; }
  function avg(list) {
    var vals = list.map(gradeValue).filter(function (v) { return v !== null; });
    return vals.length ? vals.reduce(function (s, v) { return s + v; }, 0) / vals.length : null;
  }
  function resultLabel(e) {
    if (!e.result) return '';
    if (e.result === 'pass') return 'зачёт';
    if (e.result === 'fail') return 'незачёт';
    return { '5': 'отлично', '4': 'хорошо', '3': 'удовл.', '2': 'неудовл.' }[e.result] || e.result;
  }

  // ---------- Подготовка к экзамену: билеты ----------
  var TSTATE = { 'new': ['○', 'не учил'], repeat: ['↻', 'повторить'], done: ['✓', 'выучил'] };

  function prepStats(e) {
    var tk = e.tickets || [];
    var c = { total: tk.length, done: 0, repeat: 0, 'new': 0 };
    tk.forEach(function (x) { c[x.state || 'new']++; });
    var left = c.repeat + c['new'];
    var days = e.date ? Math.max(1, daysUntil(e.date)) : 0; // день экзамена не считаем
    c.perDay = days ? Math.ceil(left / days) : 0;
    c.days = e.date ? daysUntil(e.date) : null;
    return c;
  }

  function prepHtml(e) {
    var c = prepStats(e);
    var f = state.prepFilter || 'all';
    var list = (e.tickets || []).map(function (t, i) { return Object.assign({ n: i + 1 }, t); })
      .filter(function (t) { return f === 'all' || (t.state || 'new') === f; });
    var info = c.total
      ? 'Выучено ' + c.done + ' из ' + c.total + ' · повторить ' + c.repeat + ' · не начато ' + c['new']
      : 'Добавь билеты — вставь список вопросов, по одному на строку.';
    var plan = c.total && c.done < c.total && c.days !== null
      ? (c.days > 0 ? '🎯 Чтобы успеть, учи ≈ <b>' + c.perDay + '</b> ' + U.plural(c.perDay, 'билет', 'билета', 'билетов') + ' в день' : '⏰ Экзамен сегодня — удачи!')
      : c.total && c.done === c.total ? '🎉 Все билеты выучены!' : '';
    function fbtn(k, label, n) {
      return '<button type="button" role="tab" aria-selected="' + (f === k) + '" data-action="prep-filter" data-f="' + k + '">' + label + (n != null ? ' · ' + n : '') + '</button>';
    }
    return (
      '<section class="card prep">' +
        '<div class="card-head"><h2><button type="button" class="icon-btn" data-action="prep-close" aria-label="Назад">' + I.left + '</button>Билеты: ' + esc(e.subject) + '</h2>' +
          (e.date ? '<span class="muted">' + esc(dueText(e.date).text) + '</span>' : '') + '</div>' +
        '<div class="ring-row">' + U.ring(c.total ? c.done / c.total : 0, { size: 84, stroke: 9, cls: c.total && c.done === c.total ? 'is-good' : '' }) +
          '<div class="ring-info"><p class="hero-meta">' + info + '</p>' + (plan ? '<p class="prep-plan">' + plan + '</p>' : '') +
            (c.total && c.done < c.total ? '<button type="button" class="btn btn-primary btn-small" data-action="prep-random" data-id="' + e.id + '">🎲 Случайный билет</button>' : '') +
          '</div></div>' +
        '<form class="prep-add" data-form="prep-add" data-id="' + e.id + '">' +
          '<textarea name="lines" rows="3" placeholder="Вставь билеты списком — по одному на строку. Номера в начале строк уберутся сами."></textarea>' +
          '<button type="submit" class="btn btn-small">Добавить билеты</button>' +
        '</form>' +
        (c.total ? '<div class="segmented prep-filter" role="tablist">' + fbtn('all', 'Все', c.total) + fbtn('new', 'Не учил', c['new']) + fbtn('repeat', 'Повторить', c.repeat) + fbtn('done', 'Выучил', c.done) + '</div>' : '') +
        (list.length ? '<ol class="tickets">' + list.map(function (t) {
          var s = t.state || 'new';
          return '<li class="ticket is-' + s + '"><span class="ticket-n">' + t.n + '</span><span class="ticket-text">' + esc(t.text) + '</span>' +
            '<span class="ticket-states">' + Object.keys(TSTATE).map(function (k) {
              return '<button type="button" class="tstate' + (s === k ? ' is-on' : '') + ' tstate--' + k + '" data-action="ticket" data-exam="' + e.id + '" data-id="' + t.id + '" data-s="' + k + '" data-tip="' + TSTATE[k][1] + '" aria-label="' + TSTATE[k][1] + '">' + TSTATE[k][0] + '</button>';
            }).join('') + '<button type="button" class="tstate tstate--del" data-action="ticket-del" data-exam="' + e.id + '" data-id="' + t.id + '" aria-label="Удалить билет">×</button></span></li>';
        }).join('') + '</ol>' : (c.total ? '<p class="muted today-note">В этом фильтре билетов нет.</p>' : '')) +
      '</section>'
    );
  }

  function setTickets(examId, fn) {
    var e = find('study.exams', examId);
    if (!e) return;
    var before = prepStats(e);
    var tk = fn((e.tickets || []).map(function (t) { return Object.assign({}, t); }));
    Store.update('study.exams', examId, { tickets: tk });
    var after = prepStats(Object.assign({}, e, { tickets: tk }));
    if (after.total && after.done === after.total && before.done < before.total && window.FX) {
      FX.confetti();
      U.toast('Все билеты по «' + e.subject + '» выучены! 🎉');
    }
  }

  function randomTicket(examId) {
    var e = find('study.exams', examId);
    if (!e) return;
    var pool = (e.tickets || []).map(function (t, i) { return Object.assign({ n: i + 1 }, t); }).filter(function (t) { return t.state !== 'done'; });
    if (!pool.length) { U.toast('Все билеты выучены 🎉'); return; }
    var rep = pool.filter(function (t) { return t.state === 'repeat'; });
    var src = rep.length && Math.random() < 0.6 ? rep : pool;
    var t = src[Math.floor(Math.random() * src.length)];
    var dlg = document.createElement('dialog');
    dlg.className = 'sheet ticket-dlg';
    dlg.innerHTML =
      '<div class="sheet-form"><div class="sheet-head"><h2>🎲 Билет № ' + t.n + '</h2><button type="button" class="icon-x" data-close aria-label="Закрыть">×</button></div>' +
        '<div class="ticket-big">' + esc(t.text) + '</div>' +
        '<p class="field-hint" style="padding:0 20px">Расскажи ответ вслух или про себя — и честно отметь, как получилось.</p>' +
        '<div class="sheet-foot"><button type="button" class="btn" data-r="repeat">↻ Повторить</button><span class="spacer"></span>' +
          '<button type="button" class="btn" data-r="next">Другой</button><button type="button" class="btn btn-primary" data-r="done">✓ Знаю</button></div></div>';
    dlg.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-r], [data-close]');
      if (ev.target === dlg || (b && b.hasAttribute('data-close'))) { dlg.close(); return; }
      if (!b) return;
      var r = b.dataset.r;
      dlg.close();
      if (r === 'done' || r === 'repeat') setTickets(examId, function (list) { list.forEach(function (x) { if (x.id === t.id) x.state = r; }); return list; });
      if (r === 'done' && window.FX) FX.sparkle(b);
      if (r !== 'next' && !(r === 'done' && pool.length === 1)) setTimeout(function () { randomTicket(examId); }, 250);
      if (r === 'next') setTimeout(function () { randomTicket(examId); }, 150);
    });
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  // Для Сводки: сколько билетов учить сегодня по каждому экзамену.
  function prepToday() {
    return Store.list('study.exams').filter(function (e) { return !e.result && e.date && e.date >= U.today() && (e.tickets || []).length; })
      .map(function (e) { var c = prepStats(e); return { id: e.id, subject: e.subject, perDay: c.perDay, done: c.done, total: c.total }; })
      .filter(function (x) { return x.done < x.total; });
  }

  function gradesHtml() {
    if (state.prep) {
      var pe = find('study.exams', state.prep);
      if (pe) return prepHtml(pe);
      state.prep = null;
    }
    var exams = Store.list('study.exams');
    var upcoming = exams.filter(function (e) { return !e.result; }).sort(function (a, b) { return (a.date || '9').localeCompare(b.date || '9'); });
    var done = exams.filter(function (e) { return e.result; });
    var sem = currentSemester();
    var all = avg(done);
    var cur = avg(done.filter(function (e) { return +e.semester === sem; }));

    var stats =
      '<div class="grid grid--3">' +
        '<div class="card tile"><div class="tile-label">Средний балл</div><div class="tile-value">' + (all !== null ? all.toFixed(2).replace('.', ',') : '—') + '</div></div>' +
        '<div class="card tile"><div class="tile-label">За ' + sem + '-й семестр</div><div class="tile-value">' + (cur !== null ? cur.toFixed(2).replace('.', ',') : '—') + '</div></div>' +
        '<div class="card tile"><div class="tile-label">Впереди</div><div class="tile-value">' + upcoming.length + ' ' + U.plural(upcoming.length, 'испытание', 'испытания', 'испытаний') + '</div></div>' +
      '</div>';

    var upcomingHtml =
      '<div class="section-row"><h2 class="section-title">Сессия</h2><button type="button" class="btn btn-ghost" data-action="add-exam">' + I.plus + 'Добавить</button></div>' +
      (upcoming.length
        ? '<ul class="task-list card">' + upcoming.map(function (e) {
            var d = e.date ? dueText(e.date) : { text: 'дата не назначена', cls: '' };
            var tk = e.tickets || [];
            var tDone = tk.filter(function (x) { return x.state === 'done'; }).length;
            return '<li class="task exam-row"><button type="button" class="task-main task-main--pad" data-action="edit-exam" data-id="' + e.id + '">' +
              '<span class="task-title">' + esc(e.subject) + '</span>' +
              '<span class="task-meta">' + esc(KINDS[e.kind] || '') + ' · ' + e.semester + '-й семестр · <span class="' + d.cls + '">' + esc(d.text) + '</span>' +
                (tk.length ? ' · выучено ' + tDone + ' из ' + tk.length : '') + '</span></button>' +
              (tk.length ? U.ring(tDone / tk.length, { size: 38, stroke: 5, text: '', cls: tDone === tk.length ? 'is-good' : '' }) : '') +
              '<button type="button" class="btn btn-small" data-action="prep" data-id="' + e.id + '">📚 Билеты</button></li>';
          }).join('') + '</ul>'
        : '<div class="card empty-note">Добавь зачёты и экзамены ближайшей сессии с датами — они появятся здесь и на Сводке.</div>');

    var bySem = {};
    done.forEach(function (e) { (bySem[e.semester] = bySem[e.semester] || []).push(e); });
    var results = Object.keys(bySem).sort(function (a, b) { return b - a; }).map(function (s) {
      var a = avg(bySem[s]);
      return (
        '<section class="card sem-card"><div class="card-head"><h3>' + s + '-й семестр</h3><span class="muted">' + (a !== null ? 'средний ' + a.toFixed(2).replace('.', ',') : '') + '</span></div>' +
        '<ul class="edit-list">' + bySem[s].sort(function (x, y) { return x.subject.localeCompare(y.subject, 'ru'); }).map(function (e) {
          return '<li><button type="button" class="plan-main" data-action="edit-exam" data-id="' + e.id + '"><span>' + esc(e.subject) + '</span>' +
            '<span class="tx-sub">' + esc(KINDS[e.kind] || '') + '</span></button>' +
            '<span class="grade grade--' + esc(e.result) + '">' + esc(resultLabel(e)) + '</span></li>';
        }).join('') + '</ul></section>'
      );
    }).join('');

    return stats + upcomingHtml +
      '<h2 class="section-title">Результаты</h2>' +
      (results || '<div class="card empty-note">Оценок пока нет. Когда сдашь — открой испытание из списка «Сессия» и укажи результат. ' +
        'Можно внести и прошлые семестры, чтобы видеть общий средний балл.</div>');
  }

  function examDialog(e) {
    var editing = !!e;
    var subj = subjects();
    U.formDialog({
      title: editing ? 'Зачёт / экзамен' : 'Новое испытание',
      values: editing
        ? { pick: subj.indexOf(e.subject) !== -1 ? e.subject : '__other', other: e.subject, kind: e.kind, semester: e.semester, date: e.date || '', result: e.result || '', note: e.note || '' }
        : { pick: subj[0] || '__other', other: '', kind: 'exam', semester: currentSemester(), date: '', result: '', note: '' },
      fields: function (v) {
        var f = [{ name: 'pick', type: 'select', label: 'Предмет', rerender: true, options: subj.map(function (s) { return { value: s, label: s }; }).concat([{ value: '__other', label: 'Другой предмет…' }]) }];
        if (v.pick === '__other') f.push({ name: 'other', type: 'text', label: 'Название предмета', maxlength: 120 });
        f.push({ name: 'kind', type: 'select', label: 'Форма', half: true, rerender: true, options: Object.keys(KINDS).map(function (k) { return { value: k, label: KINDS[k] }; }) });
        f.push({ name: 'semester', type: 'number', label: 'Семестр', min: 1, max: 12, half: true });
        f.push({ name: 'date', type: 'date', label: 'Дата', half: true });
        var res = v.kind === 'credit'
          ? [{ value: '', label: 'Ещё не сдан' }, { value: 'pass', label: 'Зачёт' }, { value: 'fail', label: 'Незачёт' }]
          : [{ value: '', label: 'Ещё не сдан' }, { value: '5', label: '5 — отлично' }, { value: '4', label: '4 — хорошо' }, { value: '3', label: '3 — удовл.' }, { value: '2', label: '2 — неудовл.' }];
        if (v.kind === 'credit' && /^[2-5]$/.test(v.result)) v.result = '';
        if (v.kind !== 'credit' && (v.result === 'pass' || v.result === 'fail')) v.result = '';
        f.push({ name: 'result', type: 'select', label: 'Результат', half: true, options: res });
        f.push({ name: 'note', type: 'text', label: 'Комментарий', placeholder: 'Аудитория, преподаватель, билеты', maxlength: 200 });
        return f;
      },
      onSubmit: function (v) {
        var subject = (v.pick === '__other' ? v.other : v.pick || '').trim();
        var semester = parseInt(v.semester, 10);
        if (!subject) return 'Укажи предмет';
        if (!(semester >= 1 && semester <= 12)) return 'Семестр — от 1 до 12';
        var rec = { subject: subject, kind: v.kind, semester: semester, date: v.date || '', result: v.result || '', note: (v.note || '').trim() };
        if (editing) Store.update('study.exams', e.id, rec);
        else Store.add('study.exams', rec);
        var wasDone = editing && e.result;
        if (!wasDone && (rec.result === '5' || rec.result === 'pass')) {
          if (window.FX) FX.confetti();
          U.toast(rec.result === '5' ? 'Отлично! Поздравляю! 🎉' : 'Зачёт! 🎉');
        }
      },
      onDelete: editing ? function () {
        if (!confirm('Удалить «' + e.subject + '»?')) return false;
        Store.remove('study.exams', e.id);
      } : null
    });
  }

  // ============================================================
  //  ВКР
  // ============================================================
  var DEFAULT_STAGES = ['Тема утверждена', 'План согласован', 'Список литературы', 'Введение', 'Глава 1', 'Глава 2', 'Глава 3',
    'Заключение', 'Проверка руководителем', 'Антиплагиат', 'Предзащита', 'Сдача работы', 'Защита'];

  function thesis() {
    var t = JSON.parse(JSON.stringify(Store.getSetting('study.thesis', null) || {}));
    if (!t.stages) t.stages = DEFAULT_STAGES.map(function (n, i) { return { id: 's' + i, name: n, due: '', done: false }; });
    t.topic = t.topic || '';
    t.supervisor = t.supervisor || '';
    return t;
  }
  function saveThesis(t) { Store.setSetting('study.thesis', t); }

  function thesisHtml() {
    var t = thesis();
    var done = t.stages.filter(function (s) { return s.done; }).length;
    var pct = t.stages.length ? done / t.stages.length : 0;
    var next = t.stages.find(function (s) { return !s.done; });
    var head =
      '<section class="card thesis-card">' +
        '<div class="card-head"><h2>Выпускная квалификационная работа</h2><button type="button" class="btn btn-ghost" data-action="edit-thesis">' + I.edit + 'Тема</button></div>' +
        '<div class="ring-row">' + U.ring(pct, { size: 76, stroke: 8, cls: pct >= 1 ? 'is-good' : '' }) +
          '<div class="ring-info">' +
            '<p class="thesis-topic">' + (t.topic ? esc(t.topic) : '<span class="muted">Тема ещё не указана</span>') + '</p>' +
            (t.supervisor ? '<p class="field-hint">Научный руководитель: ' + esc(t.supervisor) + '</p>' : '') +
            '<p class="hero-meta">Готово ' + done + ' из ' + t.stages.length + ' этапов' +
              (next ? ' · дальше: ' + esc(next.name) + (next.due ? ' (' + esc(dueText(next.due).text) + ')' : '') : ' · всё готово!') + '</p>' +
          '</div></div>' +
      '</section>';
    var stages =
      '<div class="section-row"><h2 class="section-title">Этапы</h2><button type="button" class="btn btn-ghost" data-action="add-stage">' + I.plus + 'Этап</button></div>' +
      '<ul class="task-list card">' + t.stages.map(function (s, i) {
        var d = s.done ? { text: 'готово', cls: '' } : dueText(s.due);
        return (
          '<li class="task' + (s.done ? ' is-done' : '') + (next && s.id === next.id ? ' is-next' : '') + '">' +
            '<label class="task-check"><input type="checkbox" data-role="stage-done" data-id="' + s.id + '"' + (s.done ? ' checked' : '') + ' aria-label="Готово: ' + esc(s.name) + '"></label>' +
            '<button type="button" class="task-main" data-action="edit-stage" data-id="' + s.id + '">' +
              '<span class="task-title">' + (i + 1) + '. ' + esc(s.name) + '</span>' +
              '<span class="task-meta"><span class="' + d.cls + '">' + esc(s.due || s.done ? d.text : 'срок не указан') + '</span></span>' +
            '</button>' +
          '</li>'
        );
      }).join('') + '</ul>' +
      '<p class="section-hint">Нажми на этап, чтобы указать срок или переименовать. Ближайшие сроки появятся на Сводке.</p>';
    return head + stages;
  }

  function thesisDialog() {
    var t = thesis();
    U.formDialog({
      title: 'ВКР',
      values: { topic: t.topic, supervisor: t.supervisor },
      fields: [
        { name: 'topic', type: 'textarea', label: 'Тема', rows: 2, maxlength: 300 },
        { name: 'supervisor', type: 'text', label: 'Научный руководитель', maxlength: 100 }
      ],
      onSubmit: function (v) {
        t.topic = (v.topic || '').trim();
        t.supervisor = (v.supervisor || '').trim();
        saveThesis(t);
      }
    });
  }

  function stageDialog(id) {
    var t = thesis();
    var s = id ? t.stages.find(function (x) { return x.id === id; }) : null;
    U.formDialog({
      title: s ? 'Этап ВКР' : 'Новый этап',
      values: { name: s ? s.name : '', due: s ? s.due : '' },
      fields: [
        { name: 'name', type: 'text', label: 'Название', maxlength: 80, autofocus: !s },
        { name: 'due', type: 'date', label: 'Срок' }
      ],
      onSubmit: function (v) {
        var name = (v.name || '').trim();
        if (!name) return 'Введи название';
        if (s) { s.name = name; s.due = v.due || ''; }
        else t.stages.push({ id: 's' + U.uid(), name: name, due: v.due || '', done: false });
        saveThesis(t);
      },
      onDelete: s ? function () {
        if (!confirm('Удалить этап «' + s.name + '»?')) return false;
        t.stages = t.stages.filter(function (x) { return x.id !== s.id; });
        saveThesis(t);
      } : null
    });
  }

  // ============================================================
  //  Внеучебная деятельность
  // ============================================================
  var ROLES = ['Участник', 'Докладчик', 'Организатор', 'Волонтёр', 'Член команды', 'Зритель'];

  function eventsHtml() {
    var list = Store.list('study.events');
    var today = U.today();
    var upcoming = list.filter(function (e) { return !e.date || e.date >= today; })
      .sort(function (a, b) { return (a.date || '9').localeCompare(b.date || '9') || (a.time || '').localeCompare(b.time || ''); });
    var past = list.filter(function (e) { return e.date && e.date < today; }).sort(function (a, b) { return b.date.localeCompare(a.date); });

    var head = '<div class="section-row"><h2 class="section-title">Мероприятия</h2><button type="button" class="btn btn-primary btn-small" data-action="add-event">' + I.plus + 'Мероприятие</button></div>';
    var body = upcoming.length ? '<div class="events">' + upcoming.map(eventCard).join('') + '</div>'
      : U.empty({ emoji: '🎤', title: 'Мероприятий пока нет', text: 'Добавь конференцию, олимпиаду, мероприятие студсовета или волонтёрство — с датой и списком дел для подготовки.', action: 'Добавить мероприятие', attr: 'data-action="add-event"' });
    var pastBlock = past.length
      ? '<button type="button" class="done-toggle" data-action="toggle-past" aria-expanded="' + state.showPastEvents + '">' + I.chevron + 'Прошедшие · ' + past.length + '</button>' +
        (state.showPastEvents ? '<div class="events is-past">' + past.map(eventCard).join('') + '</div>' : '')
      : '';
    return head + body + pastBlock;
  }

  function eventCard(e) {
    var todo = e.todo || [];
    var doneN = todo.filter(function (t) { return t.done; }).length;
    var when = e.date ? dueText(e.date) : { text: 'дата не назначена', cls: '' };
    var whenFull = e.date && daysUntil(e.date) < 0 ? shortDate(e.date) : when.text;
    var items = todo.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.due || '9').localeCompare(b.due || '9');
    }).map(function (t) {
      var d = t.done ? null : t.due ? dueText(t.due) : null;
      return (
        '<li class="todo' + (t.done ? ' is-done' : '') + '">' +
          '<label><input type="checkbox" data-role="todo-done" data-event="' + e.id + '" data-id="' + t.id + '"' + (t.done ? ' checked' : '') + '>' +
          '<span class="todo-text">' + esc(t.text) + '</span></label>' +
          (d ? '<span class="todo-due ' + d.cls + '">' + esc(d.text) + '</span>' : '') +
          '<button type="button" class="icon-btn todo-del" data-action="del-todo" data-event="' + e.id + '" data-id="' + t.id + '" aria-label="Удалить пункт">×</button>' +
        '</li>'
      );
    }).join('');
    return (
      '<section class="card event">' +
        '<div class="event-head">' +
          '<button type="button" class="event-title" data-action="edit-event" data-id="' + e.id + '">' + esc(e.title) + '</button>' +
          (e.role ? '<span class="role-chip">' + esc(e.role) + '</span>' : '') +
        '</div>' +
        '<div class="event-meta">' +
          '<span class="' + when.cls + '">' + I.clock + esc(whenFull) + (e.time ? ', ' + esc(e.time) : '') + '</span>' +
          (e.place ? '<span>' + I.pin + esc(e.place) + '</span>' : '') +
        '</div>' +
        (e.note ? '<p class="event-note">' + esc(e.note) + '</p>' : '') +
        '<div class="todo-head">Подготовка' + (todo.length ? ' · ' + doneN + ' из ' + todo.length : '') + '</div>' +
        (items ? '<ul class="todo-list">' + items + '</ul>' : '') +
        '<form class="todo-add" data-form="todo" data-id="' + e.id + '" autocomplete="off">' +
          '<input type="text" name="text" placeholder="Что сделать… (можно со сроком: «тезисы до 20.11»)" aria-label="Новый пункт подготовки">' +
          '<button type="submit" class="btn btn-small">Добавить</button>' +
        '</form>' +
      '</section>'
    );
  }

  function eventDialog(e) {
    var editing = !!e;
    U.formDialog({
      title: editing ? 'Мероприятие' : 'Новое мероприятие',
      values: editing
        ? { title: e.title, date: e.date || '', time: e.time || '', place: e.place || '', role: e.role || 'Участник', note: e.note || '' }
        : { title: '', date: '', time: '', place: '', role: 'Участник', note: '' },
      fields: [
        { name: 'title', type: 'text', label: 'Название', placeholder: 'Например, конференция «Право и общество»', maxlength: 160, autofocus: !editing },
        { name: 'date', type: 'date', label: 'Дата', half: true },
        { name: 'time', type: 'text', label: 'Время', placeholder: '15:00', half: true, maxlength: 20 },
        { name: 'place', type: 'text', label: 'Место', placeholder: 'Аудитория, адрес или онлайн', maxlength: 160 },
        { name: 'role', type: 'select', label: 'Моя роль', options: ROLES.map(function (r) { return { value: r, label: r }; }) },
        { name: 'note', type: 'textarea', label: 'Заметки', placeholder: 'Ссылки, контакты организаторов, требования', maxlength: 1000 }
      ],
      onSubmit: function (v) {
        var title = (v.title || '').trim();
        if (!title) return 'Введи название';
        var rec = { title: title, date: v.date || '', time: (v.time || '').trim(), place: (v.place || '').trim(), role: v.role, note: (v.note || '').trim() };
        if (editing) Store.update('study.events', e.id, rec);
        else Store.add('study.events', Object.assign(rec, { todo: [] }));
      },
      onDelete: editing ? function () {
        if (!confirm('Удалить мероприятие «' + e.title + '» вместе со списком дел?')) return false;
        Store.remove('study.events', e.id);
      } : null
    });
  }

  function updateTodo(eventId, fn) {
    var e = Store.list('study.events').find(function (x) { return x.id === eventId; });
    if (!e) return;
    var todo = (e.todo || []).map(function (t) { return Object.assign({}, t); });
    Store.update('study.events', eventId, { todo: fn(todo) });
  }

  // ============================================================
  //  События
  // ============================================================
  function find(col, id) { return Store.list(col).find(function (x) { return x.id === id; }); }

  function onClick(ev) {
    var b = ev.target.closest('[data-action]');
    if (!b) return;
    var id = b.dataset.id;
    switch (b.dataset.action) {
      case 'view': state.view = b.dataset.view; rerender(); break;
      case 'week': {
        var weeks = weekStarts();
        var i = weeks.indexOf(state.week) + (+b.dataset.step);
        if (i >= 0 && i < weeks.length) { state.week = weeks[i]; rerender(); }
        break;
      }
      case 'absent': toggleAbsent(b.dataset.key, b.dataset.subject, b.dataset.date); break;
      case 'edit-hw': homeworkDialog(find('study.homework', id)); break;
      case 'toggle-hw-done': state.showDoneHw = !state.showDoneHw; rerender(); break;
      case 'add-exam': examDialog(); break;
      case 'edit-exam': examDialog(find('study.exams', id)); break;
      case 'prep': state.prep = id; state.prepFilter = 'all'; rerender(); window.scrollTo(0, 0); break;
      case 'prep-close': state.prep = null; rerender(); break;
      case 'prep-filter': state.prepFilter = b.dataset.f; rerender(); break;
      case 'prep-random': randomTicket(id); break;
      case 'ticket': setTickets(b.dataset.exam, function (list) { list.forEach(function (x) { if (x.id === id) x.state = b.dataset.s; }); return list; }); break;
      case 'ticket-del': setTickets(b.dataset.exam, function (list) { return list.filter(function (x) { return x.id !== id; }); }); break;
      case 'edit-thesis': thesisDialog(); break;
      case 'add-stage': stageDialog(); break;
      case 'edit-stage': stageDialog(id); break;
      case 'add-event': eventDialog(); break;
      case 'edit-event': eventDialog(find('study.events', id)); break;
      case 'toggle-past': state.showPastEvents = !state.showPastEvents; rerender(); break;
      case 'del-todo': updateTodo(b.dataset.event, function (list) { return list.filter(function (t) { return t.id !== id; }); }); break;
    }
  }

  function onChange(ev) {
    var t = ev.target, role = t.dataset.role;
    if (role === 'hw-done') {
      Store.update('study.homework', t.dataset.id, { done: t.checked, doneAt: t.checked ? new Date().toISOString() : '' });
    } else if (role === 'stage-done') {
      var th = thesis();
      var s = th.stages.find(function (x) { return x.id === t.dataset.id; });
      if (s) {
        s.done = t.checked;
        saveThesis(th);
        if (t.checked && window.FX) {
          FX.confetti();
          U.toast(th.stages.every(function (x) { return x.done; }) ? 'ВКР готова! Поздравляю! 🎓' : 'Этап «' + s.name + '» готов! 🎉');
        }
      }
    } else if (role === 'todo-done') {
      updateTodo(t.dataset.event, function (list) {
        list.forEach(function (x) { if (x.id === t.dataset.id) x.done = t.checked; });
        return list;
      });
    }
  }

  function onInput(ev) {
    if (ev.target.dataset.role === 'hw-quick') {
      var pv = wrap.querySelector('#hw-preview');
      if (pv) pv.innerHTML = homeworkPreview(ev.target.value);
    }
  }

  function onSubmit(ev) {
    var form = ev.target, kind = form.dataset.form;
    if (kind === 'hw') {
      ev.preventDefault();
      var input = form.querySelector('[data-role="hw-quick"]');
      if (!input.value.trim()) return;
      var p = parseHomework(input.value);
      if (!p.title) { U.toast('Напиши, что нужно сделать'); return; }
      pendingFocus = '[data-role="hw-quick"]';
      Store.add('study.homework', { subject: p.subject, title: p.title, due: p.due, note: '', done: false });
      U.toast(p.subject ? 'Задание по предмету «' + p.subject + '» добавлено' : 'Задание добавлено');
    } else if (kind === 'prep-add') {
      ev.preventDefault();
      var lines = String(form.elements.lines.value || '').split('\n')
        .map(function (s) { return s.replace(/^\s*(билет\s*)?№?\s*\d+\s*[\.\)\-:]?\s*/i, '').trim(); }).filter(Boolean);
      if (!lines.length) { U.toast('Вставь хотя бы один билет'); return; }
      setTickets(form.dataset.id, function (list) {
        return list.concat(lines.map(function (text) { return { id: 'tk' + U.uid() + Math.random().toString(36).slice(2, 5), text: text, state: 'new' }; }));
      });
      U.toast('Добавлено билетов: ' + lines.length);
    } else if (kind === 'todo') {
      ev.preventDefault();
      var text = form.elements.text.value;
      if (!text.trim()) return;
      var parsed = Tabs.work.parseTask(text);
      var eventId = form.dataset.id;
      pendingFocus = 'form[data-form="todo"][data-id="' + eventId + '"] input';
      updateTodo(eventId, function (list) {
        list.push({ id: 't' + U.uid(), text: parsed.title || text.trim(), due: parsed.due, done: false });
        return list;
      });
    }
  }

  // ============================================================
  //  Для сводки и других вкладок
  // ============================================================
  function nextLesson() {
    var today = U.today(), now = nowHM();
    return allLessons().find(function (l) { return l.date > today || (l.date === today && l.end > now); }) || null;
  }

  function summary() {
    var l = nextLesson();
    if (!l) return { value: '—', hint: schedule ? 'Пар в расписании нет' : 'Загружаю расписание…' };
    var now = nowHM();
    var isNow = l.date === U.today() && l.start <= now;
    var n = daysUntil(l.date);
    var day = n === 0 ? 'Сегодня' : n === 1 ? 'Завтра' : WD_SHORT[U.toDate(l.date).getDay()].replace(/^./, function (c) { return c.toUpperCase(); });
    return {
      value: isNow ? 'Сейчас' : day + ', ' + esc(l.start),
      hint: esc(l.subject) + (l.room ? ' · ' + esc(l.room) : '') + (isNow ? ' · до ' + esc(l.end) : '')
    };
  }

  // Ближайшие сроки из учёбы — для будущей общей сводки.
  function deadlines() {
    var out = [];
    Store.list('study.homework').forEach(function (h) { if (!h.done && h.due) out.push({ date: h.due, title: h.title, kind: 'Задание' + (h.subject ? ' · ' + h.subject : '') }); });
    thesis().stages.forEach(function (s) { if (!s.done && s.due) out.push({ date: s.due, title: s.name, kind: 'ВКР' }); });
    Store.list('study.events').forEach(function (e) {
      if (e.date) out.push({ date: e.date, title: e.title, kind: 'Мероприятие' });
      (e.todo || []).forEach(function (t) { if (!t.done && t.due) out.push({ date: t.due, title: t.text, kind: e.title }); });
    });
    Store.list('study.exams').forEach(function (e) { if (!e.result && e.date) out.push({ date: e.date, title: e.subject, kind: KINDS[e.kind] || 'Сессия' }); });
    return out.sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  function thesisProgress() {
    var t = thesis();
    return { done: t.stages.filter(function (s) { return s.done; }).length, total: t.stages.length, stages: t.stages };
  }
  function scheduleInfo() {
    return schedule ? { group: schedule.group, updatedAt: schedule.updatedAt, source: schedule.source } : null;
  }

  window.Tabs.study = {
    render: render, summary: summary, deadlines: deadlines,
    parseHomework: parseHomework, matchSubject: matchSubject,
    lessonsOn: lessonsOn, nextLesson: nextLesson, thesisProgress: thesisProgress, scheduleInfo: scheduleInfo,
    saveThesis: saveThesis, examKinds: KINDS,
    newHomework: function () { homeworkDialog(); },
    prepToday: prepToday,
    openPrep: function (id) { state.view = 'grades'; state.prep = id; },
    openHomework: function (id) { state.view = 'homework'; homeworkDialog(find('study.homework', id)); },
    openEvent: function (id) { state.view = 'events'; eventDialog(find('study.events', id)); },
    openExam: function (id) { state.view = 'grades'; examDialog(find('study.exams', id)); },
    shortDate: shortDate, subjects: subjects
  };
})();
