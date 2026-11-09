/* ============================================================
   Единая строка: добавить что угодно и найти что угодно.

   Открывается кнопкой с лупой в шапке, сочетанием Ctrl+K или клавишей «/».
   Пишешь «такси 450», «вкр 2ч», «отчёт завтра» или «нотариат доклад» —
   дашборд предлагает, куда это записать (лучший вариант первым), и тут же ищет совпадения.
   ↑/↓ — выбрать, Enter — выполнить, Esc — закрыть.
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var esc = U.esc;
  var dlg = null, input = null, list = null, options = [], sel = 0;

  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }

  // ---------- Варианты «добавить» ----------
  function addOptions(text) {
    var out = [];
    if (!text.trim()) return out;
    var T = window.Tabs || {};

    var m = T.money && T.money.quickParse ? T.money.quickParse(text) : null;
    var tm = T.time && T.time.parseEntry ? T.time.parseEntry(text) : null;
    var hw = T.study && T.study.parseHomework ? T.study.parseHomework(text) : null;
    var task = T.work && T.work.parseTask ? T.work.parseTask(text) : null;
    var hasTimeUnit = /\d\s*(ч|час[а-я]*|мин[а-я]*|м)(?=\s|$)|\d{1,2}(:\d{2})?\s*[-–]\s*\d{1,2}/i.test(text);

    if (m && m.amount > 0 && !hasTimeUnit) {
      out.push({
        score: hw && hw.subject ? 55 : m.matched ? 90 : 60, emoji: m.type === 'income' ? '💰' : '💸',
        title: (m.type === 'income' ? 'Доход' : 'Расход') + ': ' + (m.matched ? T.money.catFull(m.category, m.sub) : 'выбрать категорию') + ' · ' + U.money(m.amount),
        hint: 'Деньги' + (m.date ? ' · ' + U.dayLabel(m.date) : ''),
        run: function () { T.money.quickAdd(text); }
      });
    }
    if (tm && tm.minutes > 0 && tm.category) {
      out.push({
        score: hasTimeUnit ? 95 : 50, emoji: '⏱️',
        title: 'Время: ' + T.time.catName(tm.category) + ' · ' + T.time.fmtDur(tm.minutes),
        hint: 'Время' + (tm.date ? ' · ' + U.dayLabel(tm.date) : ' · сегодня'),
        run: function () { T.time.quickAdd(text); }
      });
    }
    if (hw && hw.subject) {
      out.push({
        score: 80, emoji: '📚',
        title: 'Задание: ' + hw.subject + ' — ' + (hw.title || '…'),
        hint: 'Учёба' + (hw.due ? ' · ' + (hw.auto ? 'к паре ' : 'срок ') + T.study.shortDate(hw.due) : ''),
        run: function () {
          Store.add('study.homework', { subject: hw.subject, title: hw.title || text, due: hw.due, note: '', done: false });
          U.toast('Задание по предмету «' + hw.subject + '» добавлено');
        }
      });
    }
    if (task && task.title) {
      ['office', 'remote'].forEach(function (job, i) {
        out.push({
          score: (task.due || task.important ? 70 : 40) - i, emoji: '✅',
          title: 'Задача (' + (job === 'office' ? 'очная' : 'дистанционная') + '): ' + task.title + (task.important ? ' ★' : ''),
          hint: 'Работа · ' + (task.due ? T.work.dueLabel({ due: task.due }).text.toLowerCase() : 'без срока'),
          run: function () {
            Store.add('work.tasks', { title: task.title, job: job, due: task.due, important: task.important, note: '', done: false });
            U.toast('Задача добавлена');
          }
        });
      });
    }
    return out.sort(function (a, b) { return b.score - a.score; });
  }

  // ---------- Поиск ----------
  function search(text) {
    var q = norm(text).trim();
    if (q.length < 2) return [];
    var T = window.Tabs || {};
    var res = [];
    function hit() { for (var i = 0; i < arguments.length; i++) if (norm(arguments[i]).indexOf(q) !== -1) return true; return false; }

    Store.list('transactions').forEach(function (t) {
      var title = T.money ? T.money.txTitle(t) : '';
      if (!hit(t.note, title)) return;
      res.push({ date: t.date, emoji: t.type === 'income' ? '💰' : t.type === 'transfer' ? '🔁' : T.money.catEmoji(t.category),
        title: (t.note || title) + ' · ' + (t.type === 'expense' ? '−' : t.type === 'income' ? '+' : '') + U.money(t.amount),
        hint: 'Деньги · ' + U.dayShort(t.date), tab: 'money', run: function () { T.money.openTx(t.id); } });
    });
    Store.list('work.tasks').forEach(function (t) {
      if (!hit(t.title, t.note)) return;
      res.push({ date: t.due || (t.createdAt || '').slice(0, 10), emoji: t.done ? '☑️' : '✅', title: t.title,
        hint: 'Работа · ' + (t.done ? 'сделано' : t.due ? U.dayShort(t.due) : 'без срока'), tab: 'work', run: function () { T.work.openTask(t.id); } });
    });
    Store.list('study.homework').forEach(function (h) {
      if (!hit(h.title, h.subject, h.note)) return;
      res.push({ date: h.due || '', emoji: '📚', title: h.title, hint: 'Задание · ' + (h.subject || '') + (h.due ? ' · ' + U.dayShort(h.due) : ''),
        tab: 'study', run: function () { T.study.openHomework(h.id); } });
    });
    Store.list('study.events').forEach(function (e) {
      if (!hit(e.title, e.place, e.note)) return;
      res.push({ date: e.date || '', emoji: '🎤', title: e.title, hint: 'Мероприятие' + (e.date ? ' · ' + U.dayShort(e.date) : ''),
        tab: 'study', run: function () { T.study.openEvent(e.id); } });
    });
    Store.list('study.exams').forEach(function (e) {
      if (!hit(e.subject)) return;
      res.push({ date: e.date || '', emoji: '📝', title: e.subject, hint: 'Сессия' + (e.date ? ' · ' + U.dayShort(e.date) : ''),
        tab: 'study', run: function () { T.study.openExam(e.id); } });
    });
    return res.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }).slice(0, 12);
  }

  // ---------- Окно ----------
  function draw() {
    var text = input.value;
    var adds = addOptions(text);
    var found = search(text);
    options = adds.concat(found);
    if (sel >= options.length) sel = 0;
    var html = '';
    if (!text.trim()) {
      html = '<div class="cmd-hint"><p>Пиши что угодно:</p><ul>' +
        '<li><b>такси 450</b> — расход</li><li><b>стипендия +3200</b> — доход</li><li><b>вкр 2ч</b> — время</li>' +
        '<li><b>нотариат доклад</b> — задание к паре</li><li><b>отчёт завтра !</b> — задача</li><li>или слово для <b>поиска</b></li></ul></div>';
    }
    if (adds.length) html += '<div class="cmd-group">Добавить</div>';
    adds.forEach(function (o, i) { html += row(o, i); });
    if (found.length) html += '<div class="cmd-group">Найдено</div>';
    found.forEach(function (o, i) { html += row(o, adds.length + i); });
    if (text.trim() && !options.length) html += '<div class="cmd-hint"><p>Ничего не найдено.</p></div>';
    list.innerHTML = html;
  }

  function row(o, i) {
    return '<button type="button" class="cmd-row' + (i === sel ? ' is-sel' : '') + '" data-i="' + i + '">' +
      '<span class="cmd-emoji">' + o.emoji + '</span><span class="cmd-main"><span class="cmd-title">' + esc(o.title) + '</span>' +
      '<span class="cmd-sub">' + esc(o.hint) + '</span></span>' + (i === sel ? '<kbd>Enter</kbd>' : '') + '</button>';
  }

  function runOption(i) {
    var o = options[i];
    if (!o) return;
    dlg.close();
    if (o.tab && location.hash !== '#' + o.tab) location.hash = '#' + o.tab;
    setTimeout(function () { o.run(); }, o.tab ? 120 : 0);
  }

  function open() {
    if (dlg && dlg.open) return;
    dlg = document.createElement('dialog');
    dlg.className = 'sheet cmd';
    dlg.innerHTML =
      '<div class="cmd-box">' +
        '<div class="cmd-input"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>' +
          '<input type="text" autocomplete="off" enterkeyhint="go" placeholder="Добавить или найти…" aria-label="Добавить или найти"><kbd class="cmd-esc">Esc</kbd></div>' +
        '<div class="cmd-list"></div>' +
      '</div>';
    input = dlg.querySelector('input');
    list = dlg.querySelector('.cmd-list');
    sel = 0;
    input.addEventListener('input', function () { sel = 0; draw(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(options.length - 1, sel + 1); draw(); scrollSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); scrollSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); runOption(sel); }
    });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('.cmd-row');
      if (b) runOption(+b.dataset.i);
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.classList.contains('cmd-esc')) dlg.close(); });
    dlg.addEventListener('close', function () { dlg.remove(); dlg = null; });
    document.body.appendChild(dlg);
    dlg.showModal();
    draw();
    input.focus();
  }

  function scrollSel() {
    var el = list.querySelector('.is-sel');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  // ---------- Горячие клавиши ----------
  document.addEventListener('keydown', function (e) {
    var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) { e.preventDefault(); open(); }
    else if (!typing && !document.querySelector('dialog[open]') && (e.key === '/' || e.key === '.')) { e.preventDefault(); open(); }
  });

  var btn = document.getElementById('search-btn');
  if (btn) {
    btn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';
    btn.addEventListener('click', open);
  }

  window.Command = { open: open, addOptions: addOptions, search: search };
})();
