/* ============================================================
   ИИ-чат (Gemini через твой сервер на Google Apps Script).

   Пишешь обычным языком: «вчера такси 450 и продукты 1200», «перенеси курсовую на пятницу»,
   «сколько я потратил на кафе в октябре?». Дашборд отправляет ИИ короткую сводку твоих данных,
   ИИ отвечает текстом и списком действий. Новые записи добавляются сразу (с кнопкой «Отменить»),
   а изменения и удаления — только после твоего «Да».
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var MD = window.MoneyData;
  var esc = U.esc;
  var HIST_KEY = window.DASH_KEY ? DASH_KEY('dash:ai-chat') : 'dash:ai-chat';
  var history = [];      // { role: 'user' | 'model', text, actions?, done? }
  try { history = JSON.parse(localStorage.getItem(HIST_KEY) || '[]').slice(-30); } catch (e) {}
  var panel = null, busy = false, serverUrl = '';

  function save() { try { localStorage.setItem(HIST_KEY, JSON.stringify(history.slice(-30))); } catch (e) {} }
  function round2(n) { return Math.round(n * 100) / 100; }
  function addDays(date, n) { var d = U.toDate(date); d.setDate(d.getDate() + n); return U.iso(d); }

  // ---------- Сводка данных для ИИ ----------
  function cats() { return Store.getSetting('money.cats.v2', MD.CATS); }
  function accounts() { return Store.getSetting('money.accounts.v2', MD.ACCOUNTS) || []; }

  function context() {
    var today = U.today();
    var WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    var c = cats();
    var lines = [];
    lines.push('Сегодня ' + today + ' (' + WD[new Date().getDay()] + '). Валюта — рубли.');
    lines.push('\nКАТЕГОРИИ (id группы: название; подкатегории id=название):');
    ['expense', 'income'].forEach(function (type) {
      lines.push(type === 'expense' ? 'Расходы:' : 'Доходы:');
      c[type].forEach(function (g) {
        lines.push('  ' + g.id + ': ' + g.name + (g.subs && g.subs.length ? ' [' + g.subs.map(function (s) { return s.id + '=' + s.name; }).join(', ') + ']' : ''));
      });
    });
    lines.push('\nСЧЕТА: ' + accounts().map(function (a) { return a.id + '=' + a.name + (a.kind === 'piggy' ? ' (копилка)' : a.kind === 'debt' ? ' (долги)' : ''); }).join(', '));
    var tc = window.Tabs.time && Tabs.time.cats ? Tabs.time.cats() : [];
    if (tc.length) lines.push('КАТЕГОРИИ ВРЕМЕНИ: ' + tc.map(function (x) { return x.id + '=' + x.name; }).join(', '));
    var subj = window.Tabs.study && Tabs.study.subjects ? Tabs.study.subjects() : [];
    if (subj.length) lines.push('ПРЕДМЕТЫ: ' + subj.join('; '));

    // Итоги по месяцам (для вопросов «сколько потратил на … в …»)
    var tx = Store.list('transactions');
    var byM = {};
    tx.forEach(function (t) {
      if (t.type === 'transfer') return;
      var m = t.date.slice(0, 7), k = t.type + ':' + (t.sub || t.category);
      byM[m] = byM[m] || {};
      byM[m][k] = (byM[m][k] || 0) + t.amount;
    });
    lines.push('\nИТОГИ ПО МЕСЯЦАМ (тип:подкатегория или группа = сумма):');
    Object.keys(byM).sort().forEach(function (m) {
      lines.push(m + ': ' + Object.keys(byM[m]).map(function (k) { return k + '=' + Math.round(byM[m][k]); }).join(', '));
    });
    var bal = {};
    accounts().forEach(function (a) { bal[a.id] = Number(a.start) || 0; });
    tx.forEach(function (t) {
      if (t.type === 'income') bal[t.account] += t.amount;
      else if (t.type === 'expense') bal[t.account] -= t.amount;
      else { bal[t.account] -= t.amount; bal[t.to] = (bal[t.to] || 0) + t.amount; }
    });
    lines.push('ОСТАТКИ: ' + Object.keys(bal).map(function (k) { return k + '=' + round2(bal[k]); }).join(', '));
    // Бюджеты, регулярные платежи — для вопросов «сколько осталось», «что платить»
    var wk = window.Tabs.money && Tabs.money.weekly ? Tabs.money.weekly() : null;
    lines.push('БЮДЖЕТ НА НЕДЕЛЮ (пн–вс, группы ' + (wk ? wk.groups.join(', ') : '—') + '): ' + (wk ? 'лимит ' + wk.amount + ', потрачено ' + round2(wk.spent) + ', осталось ' + round2(wk.left) + ', дней до воскресенья ' + wk.daysLeft + ', можно в день ≈ ' + wk.perDay : 'не задан'));
    var ov = window.Tabs.money && Tabs.money.overview ? Tabs.money.overview() : null;
    if (ov) {
      lines.push('БЮДЖЕТ НА МЕСЯЦ: ' + (ov.budget ? 'лимит ' + ov.budget + ', осталось ' + round2(ov.left) : 'не задан') + '; потрачено за месяц ' + round2(ov.expenses));
      if (ov.recurring && ov.recurring.length) lines.push('РЕГУЛЯРНЫЕ ПЛАТЕЖИ (месяц): ' + ov.recurring.map(function (r) { return r.name + ' ' + r.amount + ' ₽, ' + r.date + (r.paid ? ' — оплачено' : ' — не оплачено'); }).join('; '));
    }
    var accs = accounts();
    lines.push('СЧЕТА ПОДРОБНО: ' + accs.map(function (a) { return a.name + ' (' + (a.kind === 'piggy' ? 'копилка' : a.kind === 'debt' ? 'долги: плюс — мне должны, минус — я должен' : 'счёт') + ') = ' + round2(bal[a.id] || 0); }).join('; '));

    // Последние операции (чтобы можно было исправлять/удалять)
    var recent = tx.slice().sort(function (a, b) { return (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')); }).slice(0, 60);
    lines.push('\nПОСЛЕДНИЕ ОПЕРАЦИИ (id | дата | тип | сумма | счёт→куда | категория | комментарий):');
    recent.forEach(function (t) {
      lines.push(t.id + ' | ' + t.date + ' | ' + t.type + ' | ' + t.amount + ' | ' + t.account + (t.to ? '→' + t.to : '') + ' | ' + (t.sub || t.category || '') + ' | ' + String(t.note || '').slice(0, 50));
    });
    var review = tx.filter(function (t) { return t.review; }).slice(0, 60);
    if (review.length) {
      lines.push('\nНЕРАЗОБРАННЫЕ (нужно подобрать категорию; id | дата | тип | сумма | описание банка):');
      review.forEach(function (t) { lines.push(t.id + ' | ' + t.date + ' | ' + t.type + ' | ' + t.amount + ' | ' + String(t.bankDesc || t.note || '').slice(0, 70)); });
    }
    var tasks = Store.list('work.tasks').filter(function (t) { return !t.done; });
    if (tasks.length) { lines.push('\nЗАДАЧИ ПО РАБОТЕ (id | срок | работа | название):'); tasks.forEach(function (t) { lines.push(t.id + ' | ' + (t.due || '—') + ' | ' + t.job + ' | ' + t.title); }); }
    var hw = Store.list('study.homework').filter(function (h) { return !h.done; });
    if (hw.length) { lines.push('\nЗАДАНИЯ ПО УЧЁБЕ (id | срок | предмет | название):'); hw.forEach(function (h) { lines.push(h.id + ' | ' + (h.due || '—') + ' | ' + (h.subject || '') + ' | ' + h.title); }); }
    var ex = Store.list('study.exams').filter(function (e) { return !e.result; });
    if (ex.length) { lines.push('\nСЕССИЯ: ' + ex.map(function (e) { return e.date + ' ' + e.subject + ' (' + e.kind + ')'; }).join('; ')); }
    var cd = Store.list('countdowns');
    if (cd.length) { lines.push('ОСОБЫЕ ДАТЫ: ' + cd.map(function (x) { return x.id + ' ' + x.date + ' ' + x.title + (x.yearly ? ' (ежегодно)' : ''); }).join('; ')); }
    var sh = Store.list('shopping').filter(function (s) { return !s.done; });
    if (sh.length) lines.push('СПИСОК ПОКУПОК: ' + sh.map(function (s) { return s.id + '=' + s.text; }).join('; '));
    var pan = Store.list('pantry');
    lines.push('ПРОДУКТЫ ДОМА: ' + (pan.length ? pan.map(function (p) { return p.id + '=' + p.name; }).join('; ') : 'пока не записаны'));
    var rec = Store.list('recipes');
    if (rec.length) lines.push('МОИ РЕЦЕПТЫ: ' + rec.map(function (r) { return r.title + ' (' + (r.ingredients || []).join(', ') + ')'; }).join('; '));
    var men = Store.list('menu');
    if (men.length) lines.push('МЕНЮ: ' + men.filter(function (m) { return m.date >= today; }).map(function (m) { var r = rec.find(function (x) { return x.id === m.recipeId; }); return m.date + ' ' + (r ? r.title : '?'); }).join('; '));
    // Расписание на 7 дней
    if (window.Tabs.study && Tabs.study.lessonsOn) {
      var sched = [];
      for (var i = 0; i < 7; i++) {
        var d = addDays(today, i), ls = Tabs.study.lessonsOn(d);
        if (ls.length) sched.push(d + ': ' + ls.map(function (l) { return l.start + ' ' + l.subject + (l.type ? ' (' + l.type + ')' : ''); }).join(', '));
      }
      if (sched.length) lines.push('\nПАРЫ НА НЕДЕЛЮ:\n' + sched.join('\n'));
    }
    return lines.join('\n');
  }

  var RULES = [
    'Ты — помощник в личном дашборде студента (деньги, работа, учёба, время). Отвечай по-русски, коротко и дружелюбно, на «ты».',
    'Всегда отвечай ОДНИМ JSON-объектом: {"reply": "текст ответа", "actions": [ ... ]}. Без markdown, без пояснений вне JSON.',
    'Если пользователь просто спрашивает — actions пустой, ответ в reply (считай по ИТОГАМ ПО МЕСЯЦАМ и операциям, называй суммы).',
    'Даты пиши в формате ГГГГ-ММ-ДД. «Вчера», «в пятницу» переводи в даты от сегодняшней. Суммы — числа без пробелов.',
    'Категории бери ТОЛЬКО из списка (category = id группы, sub = id подкатегории или пусто). Счёт по умолчанию — карта (первый обычный счёт); «нал», «наличными» — счёт наличных.',
    'Возможные действия (поле "do"):',
    '  add_tx {type: "expense"|"income"|"transfer", amount, date, category, sub, account, to (для transfer), note}',
    '  update_tx {id, + изменяемые поля из add_tx}',
    '  delete_tx {id}',
    '  categorize {id, category, sub} — для НЕРАЗОБРАННЫХ: подобрать категорию по описанию банка (переводы людям по номеру — people; если не уверен, не трогай)',
    '  add_task {title, due, job: "office"|"remote", important: true|false}',
    '  add_homework {subject, title, due}',
    '  update_item {kind: "task"|"homework", id, title?, due?, done?}',
    '  delete_item {kind: "task"|"homework"|"countdown"|"shopping", id}',
    '  add_time {category, date, minutes, note}',
    '  add_shopping {items: ["молоко", "хлеб"]}',
    '  add_countdown {title, date, yearly: true|false, emoji}',
    '  add_recipe {title, ingredients: ["продукт", …], note}',
    '  set_menu {date, title} — блюдо из МОИХ РЕЦЕПТОВ на дату (если рецепта нет — сначала add_recipe)',
    '  pantry_add {items: ["рис", "яйца"]} — продукты, которые есть дома',
    '  pantry_out {names: ["молоко"]} — продукт закончился (убрать из «дома»)',
    'Когда предлагаешь блюда — опирайся на ПРОДУКТЫ ДОМА и МОИ РЕЦЕПТЫ, называй, чего не хватает, и предлагай add_shopping только если пользователь просит.',
    'Для изменения/удаления используй только id из сводки. Если не понятно, о какой записи речь, — переспроси в reply и не делай действий.',
    'В reply кратко перечисли, что сделано или что предлагаешь изменить.',
    'ВАЖНО: update_tx, delete_tx, categorize, update_item, delete_item выполняются только после кнопки «Да» у пользователя — поэтому про них пиши «Предлагаю удалить/изменить…», а не «Удалил/Изменил». Новые записи (add_*) добавляются сразу — про них можно «Записал».'
  ].join('\n');

  // ---------- Запрос к серверу ----------
  function getServer() {
    if (serverUrl) return Promise.resolve(serverUrl);
    if (window.DASH_SERVER && window.DASH_SERVER.indexOf('@@') < 0) return Promise.resolve(serverUrl = window.DASH_SERVER + '?a=ai');
    return Cloud._db().collection(window.DASH_ROOT || 'users').doc(Cloud._uid()).collection('meta').doc('hook').get().then(function (d) {
      var info = d.exists ? JSON.parse(d.data().json || '{}') : {};
      if (!info.url) throw new Error('Сервер ещё не настроен');
      serverUrl = info.url.split('?')[0] + '?a=ai';
      return serverUrl;
    });
  }

  function ask(text) {
    if (!window.Cloud || !Cloud._uid || !Cloud._uid()) return Promise.reject(new Error('Сначала войди в облако через Google (шестерёнка → «Войти через Google»)'));
    var msgs = history.filter(function (m) { return m.text; }).slice(-12).map(function (m) {
      return { role: m.role, text: m.role === 'model' ? JSON.stringify({ reply: m.text }) : m.text };
    });
    msgs.push({ role: 'user', text: text });
    return Promise.all([getServer(), firebase.auth().currentUser.getIdToken()]).then(function (r) {
      return fetch(r[0], {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ idToken: r[1], root: window.DASH_ROOT || 'users', system: RULES + '\n\n' + context(), messages: msgs })
      });
    }).then(function (res) { return res.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error);
      var out;
      try { out = JSON.parse(d.text); } catch (e) {
        var m = String(d.text || '').match(/\{[\s\S]*\}/);
        out = m ? JSON.parse(m[0]) : { reply: d.text, actions: [] };
      }
      return { reply: String(out.reply || ''), actions: Array.isArray(out.actions) ? out.actions : [] };
    });
  }

  // ---------- Проверка и выполнение действий ----------
  var COLL = { task: 'work.tasks', homework: 'study.homework', countdown: 'countdowns', shopping: 'shopping' };
  function validCat(type, category, sub) {
    var g = (cats()[type] || []).find(function (x) { return x.id === category; });
    if (!g) return null;
    var s = sub && g.subs && g.subs.find(function (x) { return x.id === sub; }) ? sub : '';
    return { category: g.id, sub: s };
  }
  function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? d : U.today(); }
  function defaultAccount() {
    var r = accounts().filter(function (a) { return !a.kind; });
    return (r[0] || {}).id || '';
  }
  function accOk(id) { return accounts().some(function (a) { return a.id === id; }) ? id : defaultAccount(); }

  function txFields(a, base) {
    var f = {};
    var type = a.type || (base && base.type) || 'expense';
    if (a.type) f.type = a.type;
    if (a.amount != null) { var amt = Math.abs(parseFloat(String(a.amount).replace(',', '.'))); if (amt > 0) f.amount = round2(amt); }
    if (a.date) f.date = validDate(a.date);
    if (a.account) f.account = accOk(a.account);
    if (a.note != null) f.note = String(a.note).slice(0, 120);
    if (type === 'transfer') { if (a.to) f.to = accOk(a.to); f.category = ''; f.sub = ''; }
    else if (a.category) { var c = validCat(type, a.category, a.sub); if (c) { f.category = c.category; f.sub = c.sub; } }
    return f;
  }

  // Описание для показа в чате
  function describe(a) {
    var t;
    switch (a.do) {
      case 'add_tx': return (a.type === 'income' ? '➕ Доход ' : a.type === 'transfer' ? '🔁 Перевод ' : '➖ Расход ') + U.money(Math.abs(+a.amount || 0)) + (a.note ? ' · ' + a.note : '') + (a.category && window.Tabs.money ? ' · ' + Tabs.money.catFull(a.category, a.sub) : '') + ' · ' + validDate(a.date);
      case 'update_tx': t = Store.list('transactions').find(function (x) { return x.id === a.id; }); return '✏️ Изменить: ' + (t ? (t.note || '') + ' ' + U.money(t.amount) + ' (' + t.date + ')' : a.id) + ' → ' + Object.keys(a).filter(function (k) { return k !== 'do' && k !== 'id'; }).map(function (k) { return k + ': ' + a[k]; }).join(', ');
      case 'delete_tx': t = Store.list('transactions').find(function (x) { return x.id === a.id; }); return '🗑️ Удалить: ' + (t ? (t.note || '') + ' ' + U.money(t.amount) + ' (' + t.date + ')' : a.id);
      case 'categorize': t = Store.list('transactions').find(function (x) { return x.id === a.id; }); return '🏷️ ' + (t ? (t.note || '') + ' ' + U.money(t.amount) : a.id) + ' → ' + (window.Tabs.money ? Tabs.money.catFull(a.category, a.sub) : a.category);
      case 'add_task': return '✅ Задача: ' + a.title + (a.due ? ' · до ' + a.due : '');
      case 'add_homework': return '📚 Задание: ' + (a.subject ? a.subject + ' — ' : '') + a.title + (a.due ? ' · до ' + a.due : '');
      case 'update_item': return '✏️ Изменить ' + (a.kind === 'task' ? 'задачу' : 'задание') + (a.title ? ': ' + a.title : '') + (a.due ? ' · срок ' + a.due : '') + (a.done ? ' · выполнено' : '');
      case 'delete_item': return '🗑️ Удалить ' + ({ task: 'задачу', homework: 'задание', countdown: 'особую дату', shopping: 'покупку' }[a.kind] || '') + ' ' + a.id;
      case 'add_time': return '⏱️ Время: ' + (+a.minutes || 0) + ' мин' + (a.note ? ' · ' + a.note : '') + ' · ' + validDate(a.date);
      case 'add_shopping': return '🛒 В список: ' + (a.items || []).join(', ');
      case 'add_countdown': return (a.emoji || '📅') + ' Особая дата: ' + a.title + ' · ' + a.date + (a.yearly ? ' · каждый год' : '');
      case 'add_recipe': return '🍳 Рецепт: ' + a.title + ((a.ingredients || []).length ? ' (' + a.ingredients.join(', ') + ')' : '');
      case 'set_menu': return '📅 Меню ' + validDate(a.date) + ': ' + a.title;
      case 'pantry_add': return '🏠 Дома есть: ' + (a.items || []).join(', ');
      case 'pantry_out': return '🏠 Закончилось: ' + (a.names || []).join(', ');
    }
    return '❔ ' + JSON.stringify(a);
  }
  function needsConfirm(a) { return /^(update_|delete_)/.test(a.do) || a.do === 'categorize'; }

  // Выполняет действие; возвращает функцию отмены (для новых записей) или null.
  function run(a) {
    switch (a.do) {
      case 'add_tx': {
        var f = txFields(a);
        if (!f.amount) return null;
        var rec = Object.assign({ type: 'expense', date: U.today(), account: defaultAccount(), to: '', category: '', sub: '', note: '' }, f);
        if (rec.type !== 'transfer' && !rec.category) rec.category = rec.type === 'income' ? 'other-inc' : 'other-exp';
        var added = Store.add('transactions', rec);
        return function () { Store.remove('transactions', added.id); };
      }
      case 'update_tx': {
        var t = Store.list('transactions').find(function (x) { return x.id === a.id; });
        if (t) Store.update('transactions', t.id, Object.assign(txFields(a, t), { review: false }));
        return null;
      }
      case 'delete_tx': Store.remove('transactions', a.id); return null;
      case 'categorize': {
        var r = Store.list('transactions').find(function (x) { return x.id === a.id; });
        var c = r && validCat(r.type, a.category, a.sub);
        if (!c) return null;
        Store.update('transactions', r.id, { category: c.category, sub: c.sub, review: false });
        var key = MD.norm(r.bankDesc || r.note || '');
        if (key) { var L = Store.getSetting('money.learned', {}) || {}; L[key] = { type: r.type, category: c.category, sub: c.sub }; Store.setSetting('money.learned', L); }
        return null;
      }
      case 'add_task': {
        var tk = Store.add('work.tasks', { title: String(a.title || 'Задача').slice(0, 160), job: a.job === 'remote' ? 'remote' : 'office', due: a.due ? validDate(a.due) : '', important: !!a.important, note: '', done: false });
        return function () { Store.remove('work.tasks', tk.id); };
      }
      case 'add_homework': {
        var hw = Store.add('study.homework', { subject: a.subject || '', title: String(a.title || 'Задание').slice(0, 160), due: a.due ? validDate(a.due) : '', note: '', done: false });
        return function () { Store.remove('study.homework', hw.id); };
      }
      case 'update_item': {
        var col = COLL[a.kind]; if (!col) return null;
        var p = {};
        if (a.title) p.title = String(a.title).slice(0, 160);
        if (a.due) p.due = validDate(a.due);
        if (a.done != null) { p.done = !!a.done; p.doneAt = a.done ? new Date().toISOString() : ''; }
        Store.update(col, a.id, p);
        return null;
      }
      case 'delete_item': if (COLL[a.kind]) Store.remove(COLL[a.kind], a.id); return null;
      case 'add_time': {
        var tc = window.Tabs.time && Tabs.time.cats ? Tabs.time.cats() : [];
        var cat = tc.some(function (x) { return x.id === a.category; }) ? a.category : (tc[0] || {}).id;
        var mins = Math.round(+a.minutes || 0);
        if (!mins) return null;
        var te = Store.add('time.entries', { category: cat, date: validDate(a.date), minutes: mins, start: '', end: '', note: String(a.note || '').slice(0, 120) });
        return function () { Store.remove('time.entries', te.id); };
      }
      case 'add_shopping': {
        var items = (a.items || []).map(function (s) { return String(s).trim(); }).filter(Boolean).slice(0, 30);
        var ids = Store.addMany('shopping', items.map(function (s) { return { text: s.charAt(0).toUpperCase() + s.slice(1), done: false }; })).map(function (x) { return x.id; });
        return function () { ids.forEach(function (id) { Store.remove('shopping', id); }); };
      }
      case 'add_recipe': {
        var rcp = Store.add('recipes', { title: String(a.title || 'Блюдо').slice(0, 60), ingredients: (a.ingredients || []).map(String).slice(0, 40), note: String(a.note || '').slice(0, 1000) });
        return function () { Store.remove('recipes', rcp.id); };
      }
      case 'set_menu': if (window.Tabs.shop) Tabs.shop.setMenuByTitle(validDate(a.date), a.title); return null;
      case 'pantry_add': if (window.Tabs.shop) Tabs.shop.pantryAdd((a.items || []).map(String)); return null;
      case 'pantry_out': {
        var names = (a.names || []).map(function (n) { return MD.norm(n); });
        Store.list('pantry').forEach(function (p) { if (names.some(function (n) { return MD.norm(p.name).indexOf(n) === 0 || n.indexOf(MD.norm(p.name)) === 0; })) Store.remove('pantry', p.id); });
        return null;
      }
      case 'add_countdown': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.date || ''))) return null;
        var cdr = Store.add('countdowns', { title: String(a.title || 'Дата').slice(0, 60), date: a.date, emoji: a.emoji || '📅', yearly: !!a.yearly });
        return function () { Store.remove('countdowns', cdr.id); };
      }
    }
    return null;
  }

  // ---------- Окно чата ----------
  function msgHtml(m, i) {
    if (m.role === 'user') return '<div class="ai-msg ai-msg--me">' + esc(m.text) + '</div>';
    var acts = (m.actions || []).map(function (a, j) {
      var st = (m.state || [])[j] || '';
      return '<li class="ai-act' + (st ? ' is-' + st : '') + '">' + esc(describe(a)) +
        (st === 'ask' ? '' : st === 'done' ? ' <span class="ai-st">✓</span>' : st === 'undone' ? ' <span class="ai-st">отменено</span>' : st === 'no' ? ' <span class="ai-st">не стал</span>' : '') + '</li>';
    }).join('');
    var asking = (m.state || []).some(function (s) { return s === 'ask'; });
    var canUndo = (m.state || []).some(function (s) { return s === 'done'; }) && m.undo;
    return '<div class="ai-msg ai-msg--bot">' + esc(m.text).replace(/\n/g, '<br>') +
      (acts ? '<ul class="ai-acts">' + acts + '</ul>' : '') +
      (asking ? '<div class="btn-row"><button type="button" class="btn btn-small btn-primary" data-ai-yes="' + i + '">Да, сделать</button><button type="button" class="btn btn-small" data-ai-no="' + i + '">Нет</button></div>' : '') +
      (canUndo ? '<button type="button" class="link-btn" data-ai-undo="' + i + '">Отменить добавленное</button>' : '') +
      '</div>';
  }

  var undoFns = {};   // номер сообщения → функции отмены (только в этой сессии)
  function paint() {
    if (!panel) return;
    var list = panel.querySelector('.ai-list');
    history.forEach(function (m, i) { m.undo = !!undoFns[i]; });
    list.innerHTML = history.length ? history.map(msgHtml).join('') :
      '<div class="ai-hello"><b>Привет! Я помогу записать и найти что угодно.</b><br>Например:<ul>' +
      ['вчера такси 450 и продукты в Ярче 1200', 'сколько я потратил на кафе в октябре?', 'разбери неразобранные операции', 'добавь задание по нотариату на пятницу', 'купить молоко, хлеб, яйца']
        .map(function (s) { return '<li><button type="button" class="link-btn" data-ai-ex="' + esc(s) + '">' + esc(s) + '</button></li>'; }).join('') + '</ul></div>';
    if (busy) list.insertAdjacentHTML('beforeend', '<div class="ai-msg ai-msg--bot ai-typing"><span></span><span></span><span></span></div>');
    list.scrollTop = list.scrollHeight;
  }

  function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    history.push({ role: 'user', text: text });
    busy = true; save(); paint();
    ask(text).then(function (out) {
      var m = { role: 'model', text: out.reply || 'Готово.', actions: out.actions, state: [] };
      var idx = history.length;
      var undo = [];
      out.actions.forEach(function (a, j) {
        if (needsConfirm(a)) { m.state[j] = 'ask'; return; }
        try { var u = run(a); if (u) undo.push(u); m.state[j] = 'done'; } catch (e) { m.state[j] = 'no'; }
      });
      if (undo.length) undoFns[idx] = undo;
      history.push(m);
    }).catch(function (e) {
      history.push({ role: 'model', text: '⚠️ ' + e.message, actions: [], state: [] });
    }).then(function () { busy = false; save(); paint(); });
  }

  function open() {
    if (panel) { panel.classList.add('is-open'); panel.querySelector('textarea').focus(); return; }
    panel = document.createElement('div');
    panel.className = 'ai-panel';
    panel.innerHTML =
      '<div class="ai-head"><b>✨ Помощник</b><span class="spacer"></span>' +
        '<button type="button" class="link-btn" data-ai-clear>очистить</button>' +
        '<button type="button" class="icon-x" data-ai-close aria-label="Закрыть"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<div class="ai-list"></div>' +
      '<form class="ai-form" autocomplete="off"><textarea rows="1" maxlength="1500" placeholder="Напиши, что записать или узнать…" aria-label="Сообщение помощнику"></textarea>' +
        '<button type="submit" class="btn btn-primary" aria-label="Отправить">➤</button></form>';
    document.body.appendChild(panel);
    var ta = panel.querySelector('textarea');
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); panel.querySelector('form').requestSubmit(); } });
    panel.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); var v = ta.value; ta.value = ''; ta.style.height = 'auto'; send(v); });
    panel.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-ai-close]')) { panel.classList.remove('is-open'); return; }
      if (t.closest('[data-ai-clear]')) { history = []; undoFns = {}; save(); paint(); return; }
      var ex = t.closest('[data-ai-ex]'); if (ex) { send(ex.dataset.aiEx); return; }
      var yes = t.closest('[data-ai-yes]'), no = t.closest('[data-ai-no]'), un = t.closest('[data-ai-undo]');
      if (yes || no) {
        var m = history[+(yes || no).dataset[yes ? 'aiYes' : 'aiNo']];
        (m.actions || []).forEach(function (a, j) {
          if (m.state[j] !== 'ask') return;
          if (yes) { try { run(a); m.state[j] = 'done'; } catch (err) { m.state[j] = 'no'; } } else m.state[j] = 'no';
        });
        if (yes) U.toast('Готово');
        save(); paint(); return;
      }
      if (un) {
        var i = +un.dataset.aiUndo;
        (undoFns[i] || []).forEach(function (f) { try { f(); } catch (err) {} });
        delete undoFns[i];
        (history[i].state || []).forEach(function (s, j) { if (s === 'done' && !needsConfirm(history[i].actions[j])) history[i].state[j] = 'undone'; });
        save(); paint();
      }
    });
    paint();
    requestAnimationFrame(function () { panel.classList.add('is-open'); ta.focus(); });
  }

  // Плавающая кнопка ✨ на всех экранах
  function addButton() {
    if (document.getElementById('ai-fab')) return;
    var b = document.createElement('button');
    b.id = 'ai-fab';
    b.type = 'button';
    b.className = 'ai-fab';
    b.setAttribute('aria-label', 'Помощник');
    b.setAttribute('data-tip', 'Помощник: запиши или спроси обычными словами');
    b.textContent = '✨';
    b.addEventListener('click', open);
    document.body.appendChild(b);
    var hb = document.getElementById('ai-head-btn');
    if (hb) hb.addEventListener('click', open);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();

  window.AI = { open: open, send: send, context: context };
})();
