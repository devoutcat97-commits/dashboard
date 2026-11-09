/* ============================================================
   Вкладка «Работа»: два подраздела — очная и дистанционная.

   В каждом:
   - задачи «Сделать / Готово» со сроком, важностью и комментарием;
   - блок оплаты: очная — части зарплаты по графику,
     дистанционная — ставка + процент от выручки.
   Отметка «Получено» сразу создаёт доход во вкладке «Деньги».

   Что где хранится (через Store):
   - 'work.tasks'                     — задачи;
   - настройка 'work.office.parts'    — части очной зарплаты [{id, name, day, amount}];
   - настройка 'work.remote'          — условия дистанционки {base, percent, since};
   - настройка 'work.remote.revenue'  — выручка по месяцам {'2026-11': 500000}.
   Доходы лежат в 'transactions' (категории «Работа (очная)» / «Работа (дистанционная)»).
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var esc = U.esc;
  window.Tabs = window.Tabs || {};

  var JOBS = [['office', 'Очная'], ['remote', 'Дистанционная']];

  function ico(path) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
  var I = {
    plus: ico('<path d="M12 5v14M5 12h14"/>'),
    left: ico('<path d="m15 6-6 6 6 6"/>'),
    right: ico('<path d="m9 6 6 6-6 6"/>'),
    check: ico('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    alert: ico('<path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/>'),
    star: ico('<path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9Z"/>'),
    edit: ico('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>'),
    chevron: ico('<path d="m9 6 6 6-6 6"/>')
  };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function currentMonth() { return U.monthKey(U.today()); }

  // ---------- Настройки ----------
  function officeParts() { return clone(Store.getSetting('work.office.parts', [])); }
  function remoteCfg() {
    var c = clone(Store.getSetting('work.remote', {}));
    return { base: Number(c.base) || 0, percent: Number(c.percent) || 0, since: c.since || '' };
  }
  function revenueMap() { return clone(Store.getSetting('work.remote.revenue', {})); }

  function accounts() {
    var list = Store.getSetting('money.accounts.v2', window.MoneyData ? window.MoneyData.ACCOUNTS : []);
    return list.filter(function (a) { return a.kind !== 'piggy'; });
  }

  // ---------- Состояние ----------
  var state = { job: 'office', month: currentMonth(), showDone: false };
  var host = null, wrap = null, refocusQuick = false;

  function render(el) {
    host = el;
    wrap = document.createElement('div');
    wrap.className = 'work';
    wrap.innerHTML = headHtml() + toolbarHtml() + payHtml() + tasksHtml();
    el.innerHTML = '';
    el.appendChild(wrap);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('change', onChange);
    wrap.addEventListener('input', onInput);
    wrap.addEventListener('submit', onSubmit);
    wrap.addEventListener('fx:swipe', function (e) {
      var t = Store.list('work.tasks').find(function (x) { return x.id === e.detail.id; });
      if (!t) return;
      if (e.detail.dir === 'right') {
        if (t.done) { Store.update('work.tasks', t.id, { done: false, doneAt: '' }); return; }
        completeTask(t.id);
      } else {
        Store.remove('work.tasks', t.id);
        U.toast('Задача удалена', { action: 'Отменить', onAction: function () { Store.restore('work.tasks', t); } });
      }
    });
    if (refocusQuick) {
      var q = wrap.querySelector('[data-role="task-quick"]');
      if (q) q.focus({ preventScroll: true });
      refocusQuick = false;
    }
  }
  function rerender() { if (host) render(host); }

  function headHtml() {
    return '<header class="page-head"><h1>Работа</h1><p class="lead">Задачи и оплата — очная и дистанционная</p></header>';
  }

  function toolbarHtml() {
    var tabs = JOBS.map(function (j) {
      var open = openTasks(j[0]).length;
      return '<button type="button" role="tab" aria-selected="' + (state.job === j[0]) + '" data-action="job" data-job="' + j[0] + '">' +
        j[1] + (open ? ' <span class="count">' + open + '</span>' : '') + '</button>';
    }).join('');
    return (
      '<div class="toolbar"><div class="segmented" role="tablist" aria-label="Подраздел">' + tabs + '</div>' +
        '<div class="month-switch">' +
          '<button type="button" class="icon-btn" data-action="month" data-step="-1" aria-label="Предыдущий месяц">' + I.left + '</button>' +
          '<span class="month-label">' + U.monthTitle(state.month) + '</span>' +
          '<button type="button" class="icon-btn" data-action="month" data-step="1" aria-label="Следующий месяц">' + I.right + '</button>' +
        '</div></div>'
    );
  }

  // ============================================================
  //  Задачи
  // ============================================================
  function allTasks() { return Store.list('work.tasks'); }
  function openTasks(job) {
    return allTasks().filter(function (t) { return !t.done && (!job || t.job === job); });
  }

  function sortOpen(list) {
    return list.sort(function (a, b) {
      if (!!a.due !== !!b.due) return a.due ? -1 : 1;
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      if (!!a.important !== !!b.important) return a.important ? -1 : 1;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }

  function daysUntil(date) {
    return Math.round((U.toDate(date) - U.toDate(U.today())) / 864e5);
  }

  function dueLabel(t) {
    if (!t.due) return { text: 'Без срока', cls: '' };
    var n = daysUntil(t.due);
    var d = U.toDate(t.due);
    var short = d.getDate() + ' ' + U.monthGen(t.due);
    if (n < 0) return { text: 'Просрочено на ' + (-n) + ' ' + U.plural(-n, 'день', 'дня', 'дней') + ' · ' + short, cls: 'is-late' };
    if (n === 0) return { text: 'Сегодня', cls: 'is-soon' };
    if (n === 1) return { text: 'Завтра', cls: 'is-soon' };
    return { text: short + ' · через ' + n + ' ' + U.plural(n, 'день', 'дня', 'дней'), cls: '' };
  }

  var QUICK_HINT = 'Срок: «сегодня», «завтра», «15.11». Важная задача — добавь «!».';

  function tasksHtml() {
    var job = state.job;
    var open = sortOpen(openTasks(job));
    var done = allTasks().filter(function (t) { return t.done && t.job === job; })
      .sort(function (a, b) { return (b.doneAt || '').localeCompare(a.doneAt || ''); });

    var quick =
      '<form class="quick card" data-form="task-quick" autocomplete="off">' +
        '<div class="quick-row">' +
          '<input type="text" data-role="task-quick" enterkeyhint="done" aria-label="Новая задача" placeholder="Новая задача: отчёт по проекту завтра !">' +
          '<button type="submit" class="btn btn-primary">Добавить</button>' +
        '</div>' +
        '<div class="quick-preview" id="task-preview">' + QUICK_HINT + '</div>' +
      '</form>';

    var list = open.length
      ? '<ul class="task-list card">' + open.map(taskItem).join('') + '</ul>'
      : U.empty(done.length
          ? { emoji: '🏖️', title: 'Все задачи сделаны!', text: 'Можно выдохнуть. Новая задача — строкой выше.' }
          : { emoji: '🗂️', title: 'Пока нет задач', text: 'Напиши задачу строкой выше: например, «отчёт по проекту завтра !».', action: 'Добавить задачу', attr: 'data-focus="[data-role=task-quick]"' });

    var doneBlock = done.length
      ? '<button type="button" class="done-toggle" data-action="toggle-done" aria-expanded="' + state.showDone + '">' + I.chevron +
          'Готово · ' + done.length + '</button>' +
        (state.showDone ? '<ul class="task-list card is-done">' + done.slice(0, 50).map(taskItem).join('') + '</ul>' : '')
      : '';

    return '<h2 class="section-title">Задачи · ' + (job === 'office' ? 'очная работа' : 'дистанционная работа') + '</h2>' + quick + list + doneBlock;
  }

  var REPEAT = { '': 'Не повторять', daily: 'Каждый день', weekdays: 'По будням', weekly: 'Каждую неделю', monthly: 'Каждый месяц' };
  var REPEAT_SHORT = { daily: 'каждый день', weekdays: 'по будням', weekly: 'каждую неделю', monthly: 'каждый месяц' };

  function taskItem(t) {
    var meta = [];
    if (t.done) meta.push({ text: 'Готово' + (t.doneAt ? ' ' + U.dayShort(t.doneAt.slice(0, 10)) : ''), cls: '' });
    else meta.push(dueLabel(t));
    if (t.repeat && !t.done) meta.push({ text: '↻ ' + REPEAT_SHORT[t.repeat], cls: '' });
    var subs = t.subtasks || [];
    if (subs.length) meta.push({ text: subs.filter(function (s) { return s.done; }).length + '/' + subs.length + ' подзадач', cls: '' });
    if (t.note) meta.push({ text: t.note, cls: 'note' });
    var subsHtml = subs.length && !t.done
      ? '<ul class="subtasks">' + subs.map(function (s) {
          return '<li class="' + (s.done ? 'is-done' : '') + '"><label><input type="checkbox" data-role="sub-done" data-task="' + t.id + '" data-id="' + s.id + '"' +
            (s.done ? ' checked' : '') + '><span>' + esc(s.text) + '</span></label></li>';
        }).join('') + '</ul>'
      : '';
    return (
      '<li class="task swipe-item' + (t.done ? ' is-done' : '') + '" data-swipe="' + t.id + '"><div class="swipe-body">' +
        '<label class="task-check"><input type="checkbox" data-role="task-done" data-id="' + t.id + '"' + (t.done ? ' checked' : '') +
          ' aria-label="' + (t.done ? 'Вернуть в работу: ' : 'Готово: ') + esc(t.title) + '"></label>' +
        '<div class="task-body">' +
          '<button type="button" class="task-main" data-action="edit-task" data-id="' + t.id + '">' +
            '<span class="task-title">' + (t.important ? '<span class="imp" aria-label="Важная">' + I.star + '</span>' : '') + esc(t.title) + '</span>' +
            '<span class="task-meta">' + meta.map(function (m) { return '<span class="' + m.cls + '">' + esc(m.text) + '</span>'; }).join(' · ') + '</span>' +
          '</button>' + subsHtml +
        '</div>' +
      '</div></li>'
    );
  }

  // Следующая дата для повторяющейся задачи — первая после сегодняшнего дня.
  function nextDue(t) {
    var today = U.today();
    var d = U.toDate(t.due || today);
    var day = d.getDate();
    function step() {
      if (t.repeat === 'daily') d.setDate(d.getDate() + 1);
      else if (t.repeat === 'weekly') d.setDate(d.getDate() + 7);
      else if (t.repeat === 'weekdays') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); }
      else if (t.repeat === 'monthly') {
        d.setDate(1); d.setMonth(d.getMonth() + 1);
        d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      }
    }
    step();
    while (U.iso(d) <= today) step();
    return U.iso(d);
  }

  function completeTask(id) {
    var t = Store.list('work.tasks').find(function (x) { return x.id === id; });
    if (!t) return;
    Store.update('work.tasks', id, { done: true, doneAt: new Date().toISOString() });
    if (t.repeat) {
      var next = nextDue(t);
      Store.add('work.tasks', {
        title: t.title, job: t.job, due: next, important: t.important, note: t.note || '', repeat: t.repeat, done: false,
        subtasks: (t.subtasks || []).map(function (s) { return { id: s.id, text: s.text, done: false }; })
      });
      U.toast('Готово! Следующая — ' + dueLabel({ due: next }).text.toLowerCase());
    } else if (!openTasks(t.job).length) {
      if (window.FX) FX.confetti();
      U.toast('Все задачи закрыты! 🎉');
    } else {
      U.toast('Готово!');
    }
  }

  // «отчёт по проекту завтра !» → { title, due, important }
  function parseTask(text) {
    var words = String(text || '').trim().split(/\s+/).filter(Boolean);
    var res = { title: '', due: '', important: false };
    var rest = [];
    var today = new Date();
    words.forEach(function (w, i) {
      var lw = w.toLowerCase().replace(/ё/g, 'е');
      if (/^!+$/.test(lw)) { res.important = true; return; }
      if (lw.charAt(0) === '!' && lw.length > 1) { res.important = true; w = w.slice(1); lw = lw.slice(1); }
      var shift = { 'сегодня': 0, 'завтра': 1, 'послезавтра': 2 }[lw];
      if (shift !== undefined) {
        var d = new Date(); d.setDate(d.getDate() + shift); res.due = U.iso(d);
        if (rest.length && /^до$/i.test(rest[rest.length - 1])) rest.pop();
        return;
      }
      var m = lw.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?$/);
      if (m && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) {
        var y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.getFullYear();
        var iso = y + '-' + U.pad(+m[2]) + '-' + U.pad(+m[1]);
        // «15.01» в декабре — это, скорее всего, следующий год.
        if (!m[3] && daysUntil(iso) < -60) iso = (y + 1) + iso.slice(4);
        res.due = iso;
        if (rest.length && /^до$/i.test(rest[rest.length - 1])) rest.pop();
        return;
      }
      if (w) rest.push(w);
    });
    res.title = rest.join(' ');
    return res;
  }

  function taskPreview(text) {
    var p = parseTask(text);
    if (!p.title && !p.due) return QUICK_HINT;
    var parts = ['<b>' + esc(p.title || 'без названия') + '</b>'];
    parts.push(p.due ? dueLabel({ due: p.due }).text : 'без срока');
    if (p.important) parts.push('важная');
    return parts.join(' · ');
  }

  function taskDialog(t) {
    var editing = !!t;
    U.formDialog({
      title: editing ? 'Задача' : 'Новая задача',
      values: editing
        ? { title: t.title, job: t.job, due: t.due || '', important: t.important ? '1' : '0', repeat: t.repeat || '', note: t.note || '',
            subs: (t.subtasks || []).map(function (s) { return s.text; }).join('\n') }
        : { title: '', job: state.job, due: '', important: '0', repeat: '', note: '', subs: '' },
      fields: [
        { name: 'title', type: 'text', label: 'Что сделать', maxlength: 160, autofocus: !editing },
        { name: 'job', type: 'seg', label: 'Работа', options: [{ value: 'office', label: 'Очная' }, { value: 'remote', label: 'Дистанционная' }] },
        { name: 'due', type: 'date', label: 'Срок (необязательно)', half: true },
        { name: 'important', type: 'select', label: 'Важность', half: true, options: [{ value: '0', label: 'Обычная' }, { value: '1', label: 'Важная' }] },
        { name: 'repeat', type: 'select', label: 'Повторять', options: Object.keys(REPEAT).map(function (k) { return { value: k, label: REPEAT[k] }; }) },
        { name: 'subs', type: 'textarea', label: 'Подзадачи (по одной на строке)', placeholder: 'Собрать данные\nСверстать\nОтправить', rows: 3, maxlength: 2000 },
        { name: 'note', type: 'textarea', label: 'Комментарий', placeholder: 'Детали, ссылки, контакты', maxlength: 1000 }
      ],
      onSubmit: function (v) {
        var title = (v.title || '').trim();
        if (!title) return 'Напиши, что нужно сделать';
        if (v.repeat && !v.due) v.due = U.today();
        var old = editing ? (t.subtasks || []) : [];
        var subtasks = String(v.subs || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (text) {
          var was = old.find(function (o) { return o.text === text; });
          return { id: was ? was.id : 'st' + U.uid(), text: text, done: was ? was.done : false };
        });
        var rec = { title: title, job: v.job, due: v.due || '', important: v.important === '1', repeat: v.repeat || '', note: (v.note || '').trim(), subtasks: subtasks };
        if (editing) Store.update('work.tasks', t.id, rec);
        else Store.add('work.tasks', Object.assign(rec, { done: false }));
      },
      onDelete: editing ? function () {
        if (!confirm('Удалить задачу «' + t.title + '»?')) return false;
        Store.remove('work.tasks', t.id);
      } : null
    });
  }

  // ============================================================
  //  Оплата
  // ============================================================
  function payHtml() {
    return state.job === 'office' ? officePayHtml() : remotePayHtml();
  }

  function workIncome(category) {
    return Store.list('transactions').filter(function (t) { return t.type === 'income' && t.category === category; });
  }

  // Какая часть зарплаты за месяц уже пришла. Сначала ищем записи, отмеченные кнопкой «Получено»,
  // потом — подходящие поступления из выписки (дата ±5 дней, сумма ±25%).
  function matchParts(parts, key) {
    var incomes = workIncome('work-office');
    var used = {};
    var result = {};
    parts.forEach(function (p) {
      var linked = incomes.find(function (t) { return t.workPartId === p.id && t.workMonth === key; });
      if (linked) { used[linked.id] = true; result[p.id] = linked; }
    });
    parts.forEach(function (p) {
      if (result[p.id]) return;
      var expected = expectedDate(p, key);
      var hit = incomes.find(function (t) {
        if (used[t.id] || t.workPartId) return false;
        var diff = Math.abs((U.toDate(t.date) - U.toDate(expected)) / 864e5);
        var near = !p.amount || Math.abs(t.amount - p.amount) <= p.amount * 0.25;
        return diff <= 5 && near;
      });
      if (hit) { used[hit.id] = true; result[p.id] = hit; }
    });
    return result;
  }

  function expectedDate(p, key) {
    return key + '-' + U.pad(Math.min(Number(p.day) || 1, U.daysIn(key)));
  }

  function officePayHtml() {
    var key = state.month;
    var parts = officeParts().sort(function (a, b) { return a.day - b.day; });
    var head = '<div class="card-head"><h2>Зарплата за ' + U.monthTitle(key).split(' ')[0].toLowerCase() + '</h2>' +
      '<button type="button" class="btn btn-ghost" data-action="add-part">' + I.plus + 'Часть</button></div>';
    if (!parts.length) {
      return '<section class="card pay-card">' + head + '<p class="chart-empty">Добавь части зарплаты: примерно какого числа и сколько приходит. ' +
        'Тогда здесь будет видно, что уже пришло, а что ещё ждать.</p></section>';
    }
    var got = matchParts(parts, key);
    var expectedTotal = 0, gotTotal = 0;
    var rows = parts.map(function (p) {
      expectedTotal += Number(p.amount) || 0;
      var tx = got[p.id];
      var status, when = '';
      if (tx) {
        gotTotal += tx.amount;
        status = '<span class="status status--good">' + I.check + U.money(tx.amount) + ' · ' + U.dayShort(tx.date).split(',')[0] + '</span>';
      } else {
        var n = daysUntil(expectedDate(p, key));
        when = ' · <span class="pay-when' + (n < 0 ? ' is-late' : '') + '">' +
          (n > 0 ? 'через ' + n + ' ' + U.plural(n, 'день', 'дня', 'дней') : n === 0 ? 'сегодня' : 'ещё не пришло') + '</span>';
        status = '<button type="button" class="btn btn-small" data-action="got-part" data-id="' + p.id + '">Получено</button>';
      }
      return (
        '<li class="plan-row">' +
          '<button type="button" class="plan-main" data-action="edit-part" data-id="' + p.id + '">' +
            '<span class="tx-title">' + esc(p.name) + '</span>' +
            '<span class="tx-sub tx-sub--wrap">около ' + p.day + '-го · ~' + U.money(p.amount || 0) + when + '</span>' +
          '</button>' + status +
        '</li>'
      );
    }).join('');
    return (
      '<section class="card pay-card">' + head +
        '<ul class="plan-list">' + rows + '</ul>' +
        '<div class="pay-total"><span>Пришло ' + U.money(gotTotal) + ' из ~' + U.money(expectedTotal) + '</span>' +
          '<div class="meter" data-level="ok"><span style="width:' + (expectedTotal ? Math.min(100, gotTotal / expectedTotal * 100) : 0).toFixed(1) + '%"></span></div></div>' +
      '</section>'
    );
  }

  function remotePayHtml() {
    var key = state.month;
    var cfg = remoteCfg();
    var head = '<div class="card-head"><h2>Оплата за ' + U.monthTitle(key).split(' ')[0].toLowerCase() + '</h2>' +
      '<button type="button" class="btn btn-ghost" data-action="remote-cfg">' + I.edit + 'Условия</button></div>';
    var received = workIncome('work-remote').filter(function (t) {
      return (t.workMonth || U.monthKey(t.date)) === key;
    });
    var gotTotal = U.round2(received.reduce(function (s, t) { return s + t.amount; }, 0));
    var active = cfg.base > 0 && (!cfg.since || key >= cfg.since);

    var body = '';
    if (!cfg.base && !cfg.percent) {
      body = '<p class="chart-empty">Укажи условия: ставку и процент от выручки. Тогда здесь будет видно, сколько тебе должны за месяц.</p>';
    } else if (!active) {
      body = '<p class="chart-empty">Условия «' + U.money(cfg.base) + ' + ' + U.num(cfg.percent) + '%» действуют с ' +
        U.monthGen(cfg.since) + ' ' + cfg.since.slice(0, 4) + '. За этот месяц считаю только то, что пришло.</p>';
    }
    var lines = '';
    var expected = 0;
    if (active) {
      var rev = Number(revenueMap()[key]) || 0;
      var bonus = U.round2(rev * cfg.percent / 100);
      expected = U.round2(cfg.base + bonus);
      lines =
        '<div class="pay-lines">' +
          '<div class="pay-line"><span>Ставка</span><span>' + U.money(cfg.base) + '</span></div>' +
          '<label class="pay-line"><span>Выручка за месяц</span>' +
            '<span class="money-input money-input--sm"><input data-role="revenue" inputmode="decimal" autocomplete="off" placeholder="ввести" value="' +
              esc(rev ? U.moneyInput(rev) : '') + '"><span class="suffix">₽</span></span></label>' +
          '<div class="pay-line"><span>Твой процент' + (cfg.percent ? ' (' + U.num(cfg.percent) + '%)' : '') + '</span><span>' +
            (cfg.percent ? U.money(bonus) : '<button type="button" class="link-btn" data-action="remote-cfg">указать процент</button>') + '</span></div>' +
          '<div class="pay-line pay-line--total"><span>Должны за месяц</span><span>' + U.money(expected) + '</span></div>' +
        '</div>';
    }
    var receivedList = received.length
      ? '<ul class="pay-received">' + received.sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (t) {
          return '<li><span>' + U.dayShort(t.date) + (t.note ? ' · ' + esc(t.note) : '') + '</span><span>+' + U.money(t.amount) + '</span></li>';
        }).join('') + '</ul>'
      : '';
    var left = U.round2(expected - gotTotal);
    var total =
      '<div class="pay-total"><span>Пришло ' + U.money(gotTotal) + (expected ? ' из ' + U.money(expected) + (left > 0 ? ' · осталось ' + U.money(left) : '') : '') + '</span>' +
        (expected ? '<div class="meter" data-level="ok"><span style="width:' + Math.min(100, gotTotal / expected * 100).toFixed(1) + '%"></span></div>' : '') +
      '</div>';
    return (
      '<section class="card pay-card">' + head + body + lines + receivedList + total +
        '<div class="btn-row"><button type="button" class="btn btn-small btn-primary" data-action="got-remote">' + I.plus + 'Получено</button></div>' +
      '</section>'
    );
  }

  function accountOptions() {
    return accounts().map(function (a) { return { value: a.id, label: a.name }; });
  }

  function gotPartDialog(p) {
    var key = state.month;
    var date = key === currentMonth() ? U.today() : expectedDate(p, key);
    U.formDialog({
      title: 'Получено: ' + p.name,
      submitLabel: 'Записать доход',
      values: { amount: U.moneyInput(p.amount || ''), date: date, account: accounts()[0] ? accounts()[0].id : '' },
      fields: [
        { name: 'amount', type: 'money', label: 'Сколько пришло', autofocus: true },
        { name: 'date', type: 'date', label: 'Дата', half: true },
        { name: 'account', type: 'select', label: 'На счёт', half: true, options: accountOptions() },
        { type: 'hint', text: 'Запись появится в «Деньгах» как доход «Работа (очная) › Зарплата».' }
      ],
      onSubmit: function (v) {
        var amount = U.parseMoney(v.amount);
        if (!(amount > 0)) return 'Введи сумму больше нуля';
        var rec = Store.add('transactions', {
          type: 'income', amount: amount, category: 'work-office', sub: 'work-office.salary', account: v.account, to: '',
          date: v.date, note: p.name, workPartId: p.id, workMonth: key
        });
        U.toast('Доход записан: ' + U.money(amount));
        if (window.Tabs.money && Tabs.money.offerSave) Tabs.money.offerSave(rec);
      }
    });
  }

  function partDialog(p) {
    var editing = !!p;
    U.formDialog({
      title: editing ? 'Часть зарплаты' : 'Новая часть зарплаты',
      values: editing ? { name: p.name, day: p.day, amount: U.moneyInput(p.amount) } : { name: '', day: 15, amount: '' },
      fields: [
        { name: 'name', type: 'text', label: 'Название', placeholder: 'Например, аванс через Сбер', maxlength: 40, autofocus: !editing },
        { name: 'day', type: 'number', label: 'Примерно какого числа', min: 1, max: 31, half: true },
        { name: 'amount', type: 'money', label: 'Примерно сколько', half: true }
      ],
      onSubmit: function (v) {
        var name = (v.name || '').trim();
        var day = parseInt(v.day, 10);
        var amount = v.amount ? U.parseMoney(v.amount) : 0;
        if (!name) return 'Введи название';
        if (!(day >= 1 && day <= 31)) return 'Число — от 1 до 31';
        if (isNaN(amount)) return 'Проверь сумму';
        var parts = officeParts();
        if (editing) {
          var cur = parts.find(function (x) { return x.id === p.id; });
          Object.assign(cur, { name: name, day: day, amount: amount });
        } else {
          parts.push({ id: 'wp' + U.uid(), name: name, day: day, amount: amount });
        }
        Store.setSetting('work.office.parts', parts);
      },
      onDelete: editing ? function () {
        if (!confirm('Удалить часть «' + p.name + '»? Уже записанные доходы останутся в «Деньгах».')) return false;
        Store.setSetting('work.office.parts', officeParts().filter(function (x) { return x.id !== p.id; }));
      } : null
    });
  }

  function remoteCfgDialog() {
    var c = remoteCfg();
    U.formDialog({
      title: 'Условия дистанционной работы',
      values: { base: U.moneyInput(c.base || ''), percent: c.percent ? String(c.percent).replace('.', ',') : '', since: c.since || currentMonth() },
      fields: [
        { name: 'base', type: 'money', label: 'Ставка в месяц', half: true },
        { name: 'percent', type: 'text', label: 'Процент от выручки', placeholder: 'например, 3', half: true, maxlength: 6 },
        { name: 'since', type: 'select', label: 'Действует с', options: monthOptions() },
        { type: 'hint', text: 'Выручку за каждый месяц вписываешь в блоке оплаты — дашборд посчитает твой процент.' }
      ],
      onSubmit: function (v) {
        var base = v.base ? U.parseMoney(v.base) : 0;
        var percent = v.percent ? parseFloat(String(v.percent).replace(',', '.').replace('%', '')) : 0;
        if (isNaN(base)) return 'Проверь ставку';
        if (isNaN(percent) || percent < 0 || percent > 100) return 'Процент — число от 0 до 100';
        Store.setSetting('work.remote', { base: base, percent: percent, since: v.since });
      }
    });
  }

  function monthOptions() {
    var out = [];
    for (var i = -6; i <= 3; i++) {
      var k = U.addMonths(currentMonth(), i);
      out.push({ value: k, label: U.monthTitle(k) });
    }
    return out;
  }

  function gotRemoteDialog() {
    var key = state.month;
    var opts = [];
    for (var i = -2; i <= 1; i++) {
      var k = U.addMonths(key, i);
      opts.push({ value: k, label: 'За ' + U.monthTitle(k).toLowerCase() });
    }
    U.formDialog({
      title: 'Оплата за дистанционку',
      submitLabel: 'Записать доход',
      values: { amount: '', date: key === currentMonth() ? U.today() : key + '-' + U.pad(U.daysIn(key)), account: accounts()[0] ? accounts()[0].id : '', month: key, note: '' },
      fields: [
        { name: 'amount', type: 'money', label: 'Сколько пришло', autofocus: true },
        { name: 'month', type: 'select', label: 'За какой месяц', options: opts },
        { name: 'date', type: 'date', label: 'Дата', half: true },
        { name: 'account', type: 'select', label: 'На счёт', half: true, options: accountOptions() },
        { name: 'note', type: 'text', label: 'Комментарий', placeholder: 'Например, процент за октябрь', maxlength: 80 }
      ],
      onSubmit: function (v) {
        var amount = U.parseMoney(v.amount);
        if (!(amount > 0)) return 'Введи сумму больше нуля';
        var rec = Store.add('transactions', {
          type: 'income', amount: amount, category: 'work-remote', sub: 'work-remote.orders', account: v.account, to: '',
          date: v.date, note: (v.note || '').trim() || 'Дистанционная работа', workMonth: v.month
        });
        U.toast('Доход записан: ' + U.money(amount));
        if (window.Tabs.money && Tabs.money.offerSave) Tabs.money.offerSave(rec);
      }
    });
  }

  // ============================================================
  //  События
  // ============================================================
  function onClick(e) {
    var b = e.target.closest('[data-action]');
    if (!b) return;
    var id = b.dataset.id;
    switch (b.dataset.action) {
      case 'job': state.job = b.dataset.job; rerender(); break;
      case 'month': state.month = U.addMonths(state.month, +b.dataset.step); rerender(); break;
      case 'toggle-done': state.showDone = !state.showDone; rerender(); break;
      case 'edit-task': taskDialog(Store.list('work.tasks').find(function (t) { return t.id === id; })); break;
      case 'add-part': partDialog(); break;
      case 'edit-part': partDialog(officeParts().find(function (p) { return p.id === id; })); break;
      case 'got-part': gotPartDialog(officeParts().find(function (p) { return p.id === id; })); break;
      case 'remote-cfg': remoteCfgDialog(); break;
      case 'got-remote': gotRemoteDialog(); break;
    }
  }

  function onChange(e) {
    var role = e.target.dataset.role;
    if (role === 'task-done') {
      var id = e.target.dataset.id;
      if (e.target.checked) {
        var li = e.target.closest('.task');
        if (li) li.classList.add('is-leaving');
        setTimeout(function () { completeTask(id); }, 260);
      } else {
        Store.update('work.tasks', id, { done: false, doneAt: '' });
      }
    } else if (role === 'sub-done') {
      var task = Store.list('work.tasks').find(function (x) { return x.id === e.target.dataset.task; });
      if (task) {
        var subs = (task.subtasks || []).map(function (s) { return s.id === e.target.dataset.id ? Object.assign({}, s, { done: e.target.checked }) : s; });
        Store.update('work.tasks', task.id, { subtasks: subs });
        if (e.target.checked && subs.every(function (s) { return s.done; })) U.toast('Все подзадачи готовы — можно закрывать задачу ✨');
      }
    } else if (role === 'revenue') {
      var s = e.target.value.trim();
      var v = s ? U.parseMoney(s) : 0;
      if (isNaN(v)) { U.toast('Проверь сумму выручки'); return; }
      var map = revenueMap();
      if (v) map[state.month] = v; else delete map[state.month];
      Store.setSetting('work.remote.revenue', map);
    }
  }

  function onInput(e) {
    if (e.target.dataset.role === 'task-quick') {
      var pv = wrap.querySelector('#task-preview');
      if (pv) pv.innerHTML = taskPreview(e.target.value);
    }
  }

  function onSubmit(e) {
    if (e.target.dataset.form !== 'task-quick') return;
    e.preventDefault();
    var input = e.target.querySelector('[data-role="task-quick"]');
    var p = parseTask(input.value);
    if (!p.title) { U.toast('Напиши, что нужно сделать'); return; }
    refocusQuick = true;
    Store.add('work.tasks', { title: p.title, job: state.job, due: p.due, important: p.important, note: '', done: false });
    U.toast('Задача добавлена');
  }

  // ---------- Для сводки ----------
  function summary() {
    var open = openTasks();
    var today = U.today();
    var late = open.filter(function (t) { return t.due && t.due < today; }).length;
    var next = sortOpen(open.filter(function (t) { return t.due && t.due >= today; }))[0];
    return {
      value: open.length + ' ' + U.plural(open.length, 'задача', 'задачи', 'задач'),
      hint: late ? 'Просрочено: ' + late : next ? 'Ближайшая: ' + esc(next.title) + ' · ' + dueLabel(next).text.toLowerCase() : 'Срочных нет'
    };
  }

  // Сколько зарплаты ждём и сколько уже пришло за месяц — для Сводки.
  function payStatus(key) {
    key = key || currentMonth();
    var parts = officeParts();
    var got = matchParts(parts, key);
    var officeExpected = 0, officeGot = 0;
    parts.forEach(function (p) {
      officeExpected += Number(p.amount) || 0;
      if (got[p.id]) officeGot += got[p.id].amount;
    });
    var cfg = remoteCfg();
    var active = cfg.base > 0 && (!cfg.since || key >= cfg.since);
    var remoteExpected = active ? U.round2(cfg.base + (Number(revenueMap()[key]) || 0) * cfg.percent / 100) : 0;
    var remoteGot = U.round2(workIncome('work-remote').filter(function (t) { return (t.workMonth || U.monthKey(t.date)) === key; })
      .reduce(function (s, t) { return s + t.amount; }, 0));
    return {
      officeExpected: officeExpected, officeGot: U.round2(officeGot),
      remoteExpected: remoteExpected, remoteGot: remoteGot,
      waiting: U.round2(Math.max(0, officeExpected - officeGot) + Math.max(0, remoteExpected - remoteGot))
    };
  }

  function openTask(id) { var t = Store.list('work.tasks').find(function (x) { return x.id === id; }); if (t) { state.job = t.job; taskDialog(t); } }

  window.Tabs.work = {
    render: render, summary: summary, parseTask: parseTask, payStatus: payStatus, completeTask: completeTask,
    openTask: openTask, dueLabel: dueLabel,
    newTask: function () { taskDialog(); }
  };
})();
