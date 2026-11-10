/* ============================================================
   Вкладка «Покупки».
   - Купил: чеки с товарами (QR-код с чека → товары и цены из ФНС, или вручную).
   - Дома: какие продукты есть сейчас (пополняется из чеков, «закончилось» — одним нажатием).
   - Список: что купить (с примерной ценой по прошлым чекам). «Купил» → трата записывается сама.
   - Еда: мои рецепты, меню на неделю и «✨ Что приготовить?».
   - Для работы: рабочие покупки отдельно и отметка «возместили».
   Коллекции: purchases (чеки), pantry (дома), recipes, menu, shopping (список).
   Настройка shop.prices — последняя цена каждого товара.
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var MD = window.MoneyData;
  var esc = U.esc;
  var VIEWS = [['bought', '🧾 Купил'], ['home', '🏠 Дома'], ['list', '🛒 Список'], ['food', '🍳 Еда'], ['work', '💼 Для работы']];
  var state = { view: 'bought', open: '' };
  var host = null;

  // ---------- Названия товаров ----------
  // «МОЛОКО ПРОСТОКВАШИНО 3.2% 930МЛ» → «Молоко простоквашино»; ключ для сравнения — «молоко простоквашино».
  function shortName(name) {
    var s = String(name || '').replace(/[«»"']/g, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/\d+([.,]\d+)?\s*(%|гр|г|кг|мл|л|шт|уп|см|м)(?=[\s.,)]|$)\.?/gi, ' ').replace(/(^|\s)(ООО|АО|ИП)(?=\s|$)/g, ' ');
    s = s.replace(/[\d*/\\#№]+/g, ' ').replace(/\s+/g, ' ').trim();
    var w = s.split(' ').filter(function (x) { return x.length > 1; }).slice(0, 3).join(' ');
    w = w.toLowerCase();
    return w ? w.charAt(0).toUpperCase() + w.slice(1) : String(name || '').slice(0, 30);
  }
  function key(name) { return MD.norm(shortName(name)).split(' ').slice(0, 2).join(' '); }
  function firstWord(name) { return MD.norm(shortName(name)).split(' ')[0] || ''; }

  // ---------- Цены ----------
  function prices() { return Store.getSetting('shop.prices', {}) || {}; }
  function lookup(P, name) {
    var k = key(name);
    if (P[k]) return P[k];
    var fw = firstWord(name);
    var hit = Object.keys(P).filter(function (x) { return x.split(' ')[0] === fw; })
      .sort(function (a, b) { return (P[b].date || '').localeCompare(P[a].date || ''); })[0];
    return hit ? P[hit] : null;
  }
  // Сначала цена из твоих чеков, иначе — найденная на сайте магазина.
  function priceOf(name) { return lookup(prices(), name) || lookup(Store.getSetting('shop.sitePrices', {}) || {}, name); }
  function promosFor(name) {
    var pr = Store.getSetting('shop.promos', null);
    if (!pr || !pr.items) return [];
    var fw = firstWord(name);
    if (!fw || fw.length < 3) return [];
    return pr.items.filter(function (x) { return MD.norm(x.name).indexOf(fw.slice(0, Math.max(4, fw.length - 2))) === 0; });
  }
  // Узнать цены на сайтах: Магнит (поиск) и акции Марии-Ра.
  function fetchSitePrices() {
    var open = Store.list('shopping').filter(function (s) { return !s.done; });
    var q = open.filter(function (s) { return !lookup(prices(), s.text); }).map(function (s) { return s.text; }).slice(0, 25);
    U.toast('Узнаю цены в магазинах…');
    return Promise.all([server(), firebase.auth().currentUser.getIdToken()]).then(function (r) {
      return fetch(r[0] + '?a=prices', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ idToken: r[1], q: q, promos: true }) });
    }).then(function (res) { return res.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error);
      var SP = Object.assign({}, Store.getSetting('shop.sitePrices', {}) || {});
      var found = 0;
      Object.keys(d.magnit || {}).forEach(function (q1) {
        var fw = firstWord(q1);
        var list = (d.magnit[q1] || []).filter(function (i) { return MD.norm(i.name).indexOf(fw.slice(0, Math.max(3, fw.length - 2))) !== -1; });
        if (!list.length) return;
        var best = list.sort(function (a, b) { return a.price - b.price; })[0];
        SP[key(q1)] = { name: shortName(best.name), price: best.price, date: U.today(), store: 'Магнит', full: best.name };
        found++;
      });
      Store.setSetting('shop.sitePrices', SP);
      if (d.promos && d.promos.length) Store.setSetting('shop.promos', { date: U.today(), items: d.promos });
      U.toast('Цены: ' + found + ' из ' + q.length + (d.promos ? ' · акций Марии-Ра: ' + d.promos.length : ''));
    }).catch(function (e) { alert(e.message); });
  }
  function rememberPrices(items, store, date) {
    var P = Object.assign({}, prices());
    items.forEach(function (it) {
      var unit = it.qty && it.qty > 0 && it.qty < 50 ? it.sum / it.qty : it.price || it.sum;
      if (!(unit > 0)) return;
      var k = key(it.name);
      if (!P[k] || (P[k].date || '') <= date) P[k] = { name: shortName(it.name), price: Math.round(unit * 100) / 100, date: date, store: store || '' };
    });
    Store.setSetting('shop.prices', P);
  }

  // ---------- Продукты дома ----------
  function pantryAdd(names) {
    var have = {};
    Store.list('pantry').forEach(function (p) { have[p.key] = p; });
    var add = [];
    names.forEach(function (n) {
      var nm = shortName(n), k = key(n);
      if (!k || have[k]) return;
      have[k] = true;
      add.push({ name: nm, key: k, since: U.today() });
    });
    if (add.length) Store.addMany('pantry', add);
    return add.length;
  }

  // ---------- Привязка чека к трате ----------
  function cardAccount() {
    var A = Store.getSetting('money.accounts.v2', MD.ACCOUNTS) || [];
    var r = A.filter(function (a) { return !a.kind; });
    return ((r.find(function (a) { return /т-банк|тбанк|тинькофф/i.test(a.name); }) || r[0]) || {}).id || '';
  }
  // Ищем уже записанную трату (из уведомления, выписки или вручную): та же сумма, ±2 дня, ещё без чека.
  function findTx(total, date) {
    var d0 = U.toDate(date).getTime();
    return Store.list('transactions').filter(function (t) {
      return t.type === 'expense' && !t.purchaseId && Math.abs(t.amount - total) < 0.01 && Math.abs(U.toDate(t.date).getTime() - d0) <= 864e5 * 2;
    }).sort(function (a, b) { return Math.abs(U.toDate(a.date) - d0) - Math.abs(U.toDate(b.date) - d0); })[0];
  }

  // Сохранить покупку: чек + трата + цены + продукты дома.
  function savePurchase(p) {
    var rec = Store.add('purchases', {
      date: p.date, store: p.store || '', total: Math.round(p.total * 100) / 100, items: p.items || [],
      work: !!p.work, job: p.job || '', source: p.source || 'manual', qrraw: p.qrraw || ''
    });
    var cat = p.work ? { category: 'worktax', sub: 'worktax.workexp' } : { category: 'food', sub: 'food.groceries' };
    var tx = p.txId ? Store.list('transactions').find(function (t) { return t.id === p.txId; }) : findTx(rec.total, rec.date);
    if (tx) {
      var patch = { purchaseId: rec.id };
      if (p.work || tx.review || /^other-/.test(tx.category)) Object.assign(patch, cat, { review: false });
      if (p.work) patch.reimbursed = false;
      Store.update('transactions', tx.id, patch);
      Store.update('purchases', rec.id, { txId: tx.id });
    } else if (rec.total > 0) {
      var t = Store.add('transactions', Object.assign({
        type: 'expense', amount: rec.total, date: rec.date, account: p.account || cardAccount(), to: '',
        note: p.store || (p.work ? 'Покупка для работы' : 'Покупка'), purchaseId: rec.id
      }, cat, p.work ? { reimbursed: false } : {}));
      Store.update('purchases', rec.id, { txId: t.id });
    }
    if (rec.items.length) {
      rememberPrices(rec.items.filter(function (i) { return i.sum > 0; }), rec.store, rec.date);
      if (!p.work && p.toPantry !== false) pantryAdd(rec.items.map(function (i) { return i.name; }));
    }
    return rec;
  }

  // ---------- Сервер (QR → товары) ----------
  var serverBase = '';
  function server() {
    if (serverBase) return Promise.resolve(serverBase);
    if (!window.Cloud || !Cloud._uid || !Cloud._uid()) return Promise.reject(new Error('Сначала войди в облако через Google'));
    return Cloud._db().collection('users').doc(Cloud._uid()).collection('meta').doc('hook').get().then(function (d) {
      var info = d.exists ? JSON.parse(d.data().json || '{}') : {};
      if (!info.url) throw new Error('Сервер ещё не настроен');
      serverBase = info.url.split('?')[0];
      return serverBase;
    });
  }
  function fetchReceipt(qrraw) {
    return Promise.all([server(), firebase.auth().currentUser.getIdToken()]).then(function (r) {
      return fetch(r[0] + '?a=check', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ idToken: r[1], qrraw: qrraw }) });
    }).then(function (res) { return res.json(); }).then(function (d) { if (d.error) throw new Error(d.error); return d; });
  }

  // ---------- Сканер QR ----------
  function scanDialog() {
    var dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    var hasDetector = 'BarcodeDetector' in window;
    dlg.innerHTML = '<div class="sheet-form"><div class="sheet-head"><h2>📷 Чек по QR-коду</h2><button type="button" class="icon-x" data-close aria-label="Закрыть"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<div class="sheet-body">' +
        (hasDetector ? '<div class="qr-cam"><video playsinline muted></video><div class="qr-frame"></div></div><p class="field-hint" data-st>Наведи камеру на QR-код внизу чека.</p>' : '<p class="field-hint">Этот браузер не умеет читать QR с камеры. Сфотографируй чек или введи данные с чека вручную.</p>') +
        '<div class="btn-row"><label class="btn"><input type="file" accept="image/*" capture="environment" hidden data-photo>📸 Фото чека</label>' +
        '<button type="button" class="btn" data-manual>✍️ Ввести данные с чека</button></div>' +
        '<form class="qr-manual" data-mform hidden autocomplete="off">' +
          '<div class="form-grid"><label class="field field--half"><span class="field-label">Дата и время</span><input type="datetime-local" name="dt" required></label>' +
          '<label class="field field--half"><span class="field-label">Сумма, ₽</span><input name="s" inputmode="decimal" required></label>' +
          '<label class="field field--half"><span class="field-label">ФН</span><input name="fn" inputmode="numeric" required></label>' +
          '<label class="field field--half"><span class="field-label">ФД</span><input name="i" inputmode="numeric" required></label>' +
          '<label class="field field--half"><span class="field-label">ФП (ФПД)</span><input name="fp" inputmode="numeric" required></label></div>' +
          '<p class="field-hint">Эти номера напечатаны внизу чека рядом с QR-кодом.</p><button type="submit" class="btn btn-primary">Найти чек</button></form>' +
      '</div></div>';
    document.body.appendChild(dlg);
    var stream = null, timer = null, done = false;
    var st = dlg.querySelector('[data-st]');
    function stop() { if (timer) clearInterval(timer); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); }
    function got(raw) {
      if (done) return; done = true; stop();
      if (st) st.textContent = 'Нашёл QR, получаю товары из ФНС…';
      U.toast('Получаю чек…');
      fetchReceipt(raw).then(function (r) { dlg.close(); reviewReceipt(r, raw); })
        .catch(function (e) { done = false; alert(e.message); });
    }
    if (hasDetector) {
      var det = new BarcodeDetector({ formats: ['qr_code'] });
      var video = dlg.querySelector('video');
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (s) {
        stream = s; video.srcObject = s; video.play();
        timer = setInterval(function () {
          if (video.readyState < 2) return;
          det.detect(video).then(function (codes) { if (codes[0] && /fn=/.test(codes[0].rawValue)) got(codes[0].rawValue); }).catch(function () {});
        }, 400);
      }).catch(function () { if (st) st.textContent = 'Нет доступа к камере — сфотографируй чек или введи данные вручную.'; });
    }
    dlg.querySelector('[data-photo]').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      if (!hasDetector) { alert('Браузер не умеет читать QR с фото — введи данные с чека вручную.'); return; }
      createImageBitmap(f).then(function (img) { return new BarcodeDetector({ formats: ['qr_code'] }).detect(img); })
        .then(function (codes) { if (codes[0]) got(codes[0].rawValue); else alert('На фото не нашёл QR-код. Попробуй ближе и ровнее.'); });
    });
    dlg.querySelector('[data-manual]').addEventListener('click', function () { dlg.querySelector('[data-mform]').hidden = false; });
    dlg.querySelector('[data-mform]').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target.elements;
      var dt = f.dt.value.replace(/[-:]/g, '').slice(0, 13);
      got('t=' + dt + '&s=' + String(f.s.value).replace(',', '.').replace(/\s/g, '') + '&fn=' + f.fn.value.trim() + '&i=' + f.i.value.trim() + '&fp=' + f.fp.value.trim() + '&n=1');
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
    dlg.addEventListener('close', function () { stop(); dlg.remove(); });
    dlg.showModal();
  }

  // Показать товары из чека и сохранить.
  function reviewReceipt(r, qrraw) {
    var date = (r.dateTime || '').slice(0, 10) || U.today();
    var dup = Store.list('purchases').find(function (p) { return p.qrraw && p.qrraw === qrraw; });
    if (dup) { U.toast('Этот чек уже записан'); return; }
    var tx = findTx(r.total, date);
    U.formDialog({
      title: '🧾 ' + (r.store || 'Чек') + ' · ' + U.money(r.total),
      submitLabel: 'Сохранить чек',
      values: { kind: 'home', job: 'office', pantry: '1' },
      fields: function (v) {
        var f = [
          { type: 'hint', text: U.toDate(date).getDate() + ' ' + U.monthGen(date) + ' · ' + r.items.length + ' ' + U.plural(r.items.length, 'товар', 'товара', 'товаров') + ':\n' +
            r.items.slice(0, 40).map(function (i) { return '• ' + shortName(i.name) + ' — ' + U.money(i.sum); }).join('\n') },
          { name: 'kind', type: 'seg', label: 'Чья покупка', rerender: true, options: [{ value: 'home', label: 'Для себя' }, { value: 'work', label: 'Для работы' }] }
        ];
        if (v.kind === 'work') f.push({ name: 'job', type: 'seg', label: 'Какая работа', options: [{ value: 'office', label: 'Очная' }, { value: 'remote', label: 'Дистанционная' }] });
        else f.push({ name: 'pantry', type: 'seg', label: 'Продукты — в «Дома»?', options: [{ value: '1', label: 'Да' }, { value: '0', label: 'Нет' }] });
        f.push({ type: 'hint', text: tx ? 'Привяжу к уже записанной трате «' + (tx.note || '') + '» от ' + U.dayShort(tx.date) + '.' : 'Такой траты ещё нет — запишу её сама.' });
        return f;
      },
      onSubmit: function (v) {
        savePurchase({ date: date, store: r.store, total: r.total, items: r.items, work: v.kind === 'work', job: v.job, source: 'qr', qrraw: qrraw, txId: tx && tx.id, toPantry: v.pantry !== '0' });
        if (window.FX) FX.sparkle(document.body);
        U.toast('Чек сохранён: ' + r.items.length + ' ' + U.plural(r.items.length, 'товар', 'товара', 'товаров'));
      }
    });
  }

  // Покупка вручную (без чека).
  function manualDialog(work) {
    U.formDialog({
      title: work ? 'Покупка для работы' : 'Покупка',
      values: { what: '', amount: '', date: U.today(), store: '', job: 'office' },
      fields: function () {
        var f = [
          { name: 'what', type: 'textarea', label: 'Что купил', placeholder: work ? 'Бумага, картридж' : 'Молоко, хлеб, яйца — через запятую', rows: 2, autofocus: true },
          { name: 'amount', type: 'money', label: 'Сколько всего', half: true },
          { name: 'date', type: 'date', label: 'Когда', half: true },
          { name: 'store', type: 'text', label: 'Где (необязательно)', placeholder: 'Ярче', maxlength: 40 }
        ];
        if (work) f.push({ name: 'job', type: 'seg', label: 'Какая работа', options: [{ value: 'office', label: 'Очная' }, { value: 'remote', label: 'Дистанционная' }] });
        return f;
      },
      onSubmit: function (v) {
        var amount = U.parseMoney(v.amount);
        if (!(amount > 0)) return 'Укажи сумму';
        var names = String(v.what || '').split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
        savePurchase({ date: v.date || U.today(), store: (v.store || '').trim(), total: amount, items: names.map(function (n) { return { name: n, qty: 1, price: 0, sum: 0 }; }), work: !!work, job: v.job, source: 'manual' });
        U.toast('Покупка записана');
      }
    });
  }

  // ---------- Список: «купил отмеченное» ----------
  function buyChecked() {
    var done = Store.list('shopping').filter(function (s) { return s.done; });
    if (!done.length) return;
    var est = done.reduce(function (s, x) { var p = priceOf(x.text); return s + (p ? p.price : 0); }, 0);
    U.formDialog({
      title: 'Купил ' + done.length + ' ' + U.plural(done.length, 'товар', 'товара', 'товаров'),
      submitLabel: 'Записать',
      values: { amount: est ? U.moneyInput(Math.round(est)) : '', store: '', date: U.today(), kind: 'home' },
      fields: [
        { type: 'hint', text: done.map(function (s) { return '• ' + s.text; }).join('\n') + (est ? '\nПо прошлым чекам примерно ' + U.money(Math.round(est)) + '.' : '') },
        { name: 'amount', type: 'money', label: 'Сколько заплатил', half: true, autofocus: true },
        { name: 'date', type: 'date', label: 'Когда', half: true },
        { name: 'store', type: 'text', label: 'Где', placeholder: 'Ярче', maxlength: 40 },
        { name: 'kind', type: 'seg', label: 'Чья покупка', options: [{ value: 'home', label: 'Для себя' }, { value: 'work', label: 'Для работы' }] },
        { type: 'hint', text: 'Если потом отсканируешь чек этой покупки — товары и цены уточнятся. Трата запишется в «Деньги».' }
      ],
      onSubmit: function (v) {
        var amount = U.parseMoney(v.amount);
        if (!(amount > 0)) return 'Укажи сумму';
        savePurchase({ date: v.date, store: (v.store || '').trim(), total: amount, items: done.map(function (s) { return { name: s.text, qty: 1, price: 0, sum: 0 }; }), work: v.kind === 'work', source: 'list' });
        done.forEach(function (s) { Store.remove('shopping', s.id); });
        U.toast('Записано: ' + U.money(amount));
      }
    });
  }
  function addToList(items) {
    var open = Store.list('shopping').filter(function (s) { return !s.done; }).map(function (s) { return key(s.text); });
    var add = items.map(function (s) { return String(s).trim(); }).filter(function (s) { return s && open.indexOf(key(s)) === -1; })
      .map(function (s) { return { text: s.charAt(0).toUpperCase() + s.slice(1), done: false }; });
    if (add.length) Store.addMany('shopping', add);
    return add.length;
  }

  // ---------- Рецепты и меню ----------
  function recipeDialog(r) {
    U.formDialog({
      title: r ? 'Рецепт' : 'Новый рецепт',
      values: r ? { title: r.title, ing: (r.ingredients || []).join('\n'), note: r.note || '' } : { title: '', ing: '', note: '' },
      fields: [
        { name: 'title', type: 'text', label: 'Блюдо', placeholder: 'Паста с курицей', maxlength: 60, autofocus: !r },
        { name: 'ing', type: 'textarea', label: 'Продукты (по одному в строке)', rows: 6, placeholder: 'Макароны\nКуриное филе\nСливки\nСыр' },
        { name: 'note', type: 'textarea', label: 'Как готовить (необязательно)', rows: 3 }
      ],
      onSubmit: function (v) {
        var title = (v.title || '').trim();
        if (!title) return 'Напиши название блюда';
        var rec = { title: title, ingredients: String(v.ing || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean), note: (v.note || '').trim() };
        if (r) Store.update('recipes', r.id, rec); else Store.add('recipes', rec);
      },
      onDelete: r ? function () { Store.remove('recipes', r.id); } : null
    });
  }
  function missingFor(recipe) {
    var have = {};
    Store.list('pantry').forEach(function (p) { have[firstWord(p.name)] = true; have[p.key] = true; });
    return (recipe.ingredients || []).filter(function (i) { return !have[key(i)] && !have[firstWord(i)]; });
  }
  function weekDays() {
    var d = U.toDate(U.today()); d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    var out = [];
    for (var i = 0; i < 7; i++) { out.push(U.iso(d)); d.setDate(d.getDate() + 1); }
    return out;
  }
  function menuFor(date) { return Store.list('menu').find(function (m) { return m.date === date; }); }
  function setMenu(date, recipeId) {
    var m = menuFor(date);
    if (!recipeId) { if (m) Store.remove('menu', m.id); return; }
    if (m) Store.update('menu', m.id, { recipeId: recipeId }); else Store.add('menu', { date: date, recipeId: recipeId });
  }
  function weekShopping() {
    var R = Store.list('recipes');
    var need = [];
    weekDays().forEach(function (d) {
      var m = menuFor(d); var r = m && R.find(function (x) { return x.id === m.recipeId; });
      if (r) missingFor(r).forEach(function (i) { if (need.indexOf(i) === -1) need.push(i); });
    });
    var n = addToList(need);
    U.toast(n ? 'В список добавлено: ' + n : 'Всё для меню уже есть дома или в списке');
  }
  function askCook() {
    if (!window.AI) return;
    AI.open();
    AI.send('Что приготовить из того, что у меня есть дома? Предложи 3 простых блюда, у каждого — чего не хватает. Если чего-то не хватает — предложи добавить в список покупок.');
  }

  // ---------- Отрисовка ----------
  function monthTotal(list) { return list.reduce(function (s, x) { return s + (x.total || x.amount || 0); }, 0); }

  function boughtHtml() {
    var P = Store.list('purchases').filter(function (p) { return !p.work; }).sort(function (a, b) { return (b.date + b.createdAt).localeCompare(a.date + a.createdAt); });
    var mk = U.monthKey(U.today());
    var month = P.filter(function (p) { return U.monthKey(p.date) === mk; });
    var rows = P.slice(0, 40).map(function (p) {
      var open = state.open === p.id;
      return '<li class="shop-rc' + (open ? ' is-open' : '') + '"><button type="button" class="plan-main" data-sh-open="' + p.id + '"><span class="tx-title">' + esc(p.store || 'Покупка') + (p.source === 'qr' ? ' 🧾' : '') + '</span>' +
        '<span class="tx-sub">' + U.dayShort(p.date) + ' · ' + (p.items || []).length + ' ' + U.plural((p.items || []).length, 'позиция', 'позиции', 'позиций') + '</span></button>' +
        '<span class="plan-amt">' + U.money(p.total) + '</span>' +
        (open ? '<ul class="shop-items">' + (p.items || []).map(function (i) { return '<li><span>' + esc(shortName(i.name)) + (i.qty && i.qty !== 1 ? ' × ' + U.num(i.qty) : '') + '</span><b>' + (i.sum ? U.money(i.sum) : '') + '</b></li>'; }).join('') +
          '</ul><button type="button" class="link-btn" data-sh-delp="' + p.id + '">удалить чек</button>' : '') + '</li>';
    }).join('');
    return '<div class="btn-row shop-actions"><button type="button" class="btn btn-primary" data-sh-scan>📷 Сканировать чек</button><button type="button" class="btn" data-sh-manual>✍️ Вписать покупку</button></div>' +
      '<div class="grid grid--2"><div class="card tile"><div class="tile-label">Покупки за месяц</div><div class="tile-value">' + U.money(Math.round(monthTotal(month))) + '</div><div class="tile-hint">' + month.length + ' ' + U.plural(month.length, 'чек', 'чека', 'чеков') + '</div></div>' +
      '<div class="card tile"><div class="tile-label">Знаю цен</div><div class="tile-value">' + Object.keys(prices()).length + '</div><div class="tile-hint">из твоих чеков</div></div></div>' +
      (rows ? '<ul class="plan-list card">' + rows + '</ul>' : U.empty({ emoji: '🧾', title: 'Чеков пока нет', text: 'Отсканируй QR-код с чека — дашборд узнает, что ты купил и почём, и сам положит продукты в «Дома».', action: 'Сканировать чек', attr: 'data-sh-scan' }));
  }

  function homeHtml() {
    var P = Store.list('pantry').sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
    var rows = P.map(function (p) {
      return '<li class="shop-item"><span>' + esc(p.name) + '</span><span class="muted">' + (p.since ? U.dayShort(p.since).split(',')[0] : '') + '</span>' +
        '<button type="button" class="btn btn-small" data-sh-out="' + p.id + '" data-tip="Закончилось — убрать и добавить в список">закончилось</button></li>';
    }).join('');
    return '<div class="btn-row shop-actions"><button type="button" class="btn btn-primary" data-sh-cook>✨ Что приготовить?</button></div>' +
      '<form class="shop-add card" data-sh-pform autocomplete="off"><input name="t" placeholder="Есть дома: рис, яйца, лук…" aria-label="Добавить продукт"><button type="submit" class="btn btn-small btn-primary">＋</button></form>' +
      (rows ? '<ul class="shop-list card">' + rows + '</ul><p class="field-hint">Продукты попадают сюда из чеков и списка покупок. Нажми «закончилось» — уберу и спрошу, добавить ли в список.</p>'
        : U.empty({ emoji: '🏠', title: 'Здесь будет то, что есть дома', text: 'Продукты появятся сами после сканирования чеков. Можно вписать и вручную.' }));
  }

  function listHtml() {
    var all = Store.list('shopping');
    var open = all.filter(function (s) { return !s.done; }), done = all.filter(function (s) { return s.done; });
    var est = 0, known = 0;
    var row = function (s) {
      var p = priceOf(s.text);
      if (p && !s.done) { est += p.price; known++; }
      return '<li class="shop-item' + (s.done ? ' is-done' : '') + '"><label><input type="checkbox" data-sh-check="' + s.id + '"' + (s.done ? ' checked' : '') + '><span>' + esc(s.text) + '</span></label>' +
        (p ? '<span class="muted" data-tip="' + esc((p.store ? p.store + ', ' : '') + U.dayShort(p.date) + (p.full ? '
' + p.full : '')) + '">≈ ' + U.money(Math.round(p.price)) + (p.store === 'Магнит' ? ' М' : '') + '</span>' : '') +
        (!s.done && promosFor(s.text).length ? '<span class="shop-promo" data-tip="' + esc(promosFor(s.text).slice(0, 4).map(function (x) { return x.name + ' — ' + x.price + ' ₽ (было ' + x.old + ', ' + x.until + ')'; }).join('
')) + '">🏷️ акция</span>' : '') +
        '<button type="button" class="icon-btn" data-sh-del="' + s.id + '" aria-label="Убрать">×</button></li>';
    };
    var html = open.map(row).join('') + done.map(row).join('');
    return '<form class="shop-add card" data-sh-lform autocomplete="off"><input name="t" placeholder="Молоко, хлеб, яйца…" aria-label="Что купить"><button type="submit" class="btn btn-small btn-primary">＋</button></form>' +
      (html ? '<ul class="shop-list card">' + html + '</ul>' : U.empty({ emoji: '🛒', title: 'Список пуст', text: 'Впиши, что нужно купить, или собери список из меню на неделю во вкладке «Еда».' })) +
      (known ? '<p class="field-hint">Примерно ' + U.money(Math.round(est)) + ' (известно для ' + known + ' из ' + open.length + '). «М» — цена с сайта Магнита, остальное — из твоих чеков. 🏷️ — сейчас есть акция в Марии-Ра.</p>' : '') +
      (open.length ? '<div class="btn-row"><button type="button" class="btn" data-sh-prices>🏷️ Цены и акции в магазинах</button></div>' : '') +
      promoHtml(open) +
      (done.length ? '<div class="btn-row"><button type="button" class="btn btn-primary" data-sh-buy>💸 Купил отмеченное (' + done.length + ')</button></div>' : '');
  }

  function promoHtml(open) {
    var pr = Store.getSetting('shop.promos', null);
    if (!pr || !pr.items || !pr.items.length) return '';
    var hits = [];
    open.forEach(function (s) { promosFor(s.text).slice(0, 3).forEach(function (x) { if (hits.indexOf(x) === -1) hits.push(x); }); });
    var all = state.promoAll ? pr.items : hits;
    return '<section class="card"><div class="card-head"><h2>🏷️ Акции Марии-Ра</h2><button type="button" class="link-btn" data-sh-promoall>' + (state.promoAll ? 'только по списку' : 'все (' + pr.items.length + ')') + '</button></div>' +
      (all.length ? '<ul class="shop-items">' + all.slice(0, 80).map(function (x) {
        return '<li><span>' + esc(shortName(x.name)) + ' <small class="muted">' + esc(x.until) + '</small></span><b>' + U.money(x.price) + (x.old ? ' <s class="muted">' + U.money(x.old) + '</s>' : '') + '</b></li>';
      }).join('') + '</ul>' : '<p class="chart-empty">На товары из списка акций сейчас нет.</p>') +
      '<p class="field-hint">Обновлено ' + U.dayShort(pr.date) + '.</p></section>';
  }

  function foodHtml() {
    var R = Store.list('recipes').sort(function (a, b) { return a.title.localeCompare(b.title, 'ru'); });
    var opts = '<option value="">—</option>' + R.map(function (r) { return '<option value="' + r.id + '">' + esc(r.title) + '</option>'; }).join('');
    var WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    var week = weekDays().map(function (d) {
      var m = menuFor(d);
      return '<label class="menu-day' + (d === U.today() ? ' is-today' : '') + '"><span>' + WD[U.toDate(d).getDay()] + ' ' + U.toDate(d).getDate() + '</span>' +
        '<select data-sh-menu="' + d + '">' + opts.replace('value="' + (m && m.recipeId) + '"', 'value="' + (m && m.recipeId) + '" selected') + '</select></label>';
    }).join('');
    var rows = R.map(function (r) {
      var miss = missingFor(r);
      return '<li class="plan-row"><button type="button" class="plan-main" data-sh-recipe="' + r.id + '"><span class="tx-title">' + esc(r.title) + '</span>' +
        '<span class="tx-sub">' + (miss.length ? 'не хватает: ' + esc(miss.slice(0, 4).join(', ')) + (miss.length > 4 ? '…' : '') : '✅ всё есть дома') + '</span></button>' +
        (miss.length ? '<button type="button" class="btn btn-small" data-sh-need="' + r.id + '">в список</button>' : '') + '</li>';
    }).join('');
    return '<div class="btn-row shop-actions"><button type="button" class="btn btn-primary" data-sh-cook>✨ Что приготовить?</button><button type="button" class="btn" data-sh-addrecipe>＋ Рецепт</button></div>' +
      '<section class="card"><div class="card-head"><h2>Меню на неделю</h2><button type="button" class="btn btn-small" data-sh-weekbuy>Собрать покупки</button></div>' +
        (R.length ? '<div class="menu-week">' + week + '</div>' : '<p class="chart-empty">Добавь пару рецептов — и выбирай блюда по дням.</p>') + '</section>' +
      '<div class="section-row"><h2 class="section-title">Мои рецепты</h2></div>' +
      (rows ? '<ul class="plan-list card">' + rows + '</ul>' : U.empty({ emoji: '🍳', title: 'Рецептов пока нет', text: 'Сохрани любимые блюда с составом — дашборд подскажет, чего не хватает, и соберёт список покупок. Или спроси ✨ помощника.', action: 'Добавить рецепт', attr: 'data-sh-addrecipe' }));
  }

  function workList() {
    return Store.list('transactions').filter(function (t) { return t.type === 'expense' && t.category === 'worktax' && t.sub === 'worktax.workexp'; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
  }
  function workDue() { return workList().filter(function (t) { return t.reimbursed === false; }).reduce(function (s, t) { return s + t.amount; }, 0); }

  function workHtml() {
    var L = workList(), mk = U.monthKey(U.today());
    var P = {}; Store.list('purchases').forEach(function (p) { P[p.id] = p; });
    var month = L.filter(function (t) { return U.monthKey(t.date) === mk; }).reduce(function (s, t) { return s + t.amount; }, 0);
    var due = workDue();
    var rows = L.slice(0, 50).map(function (t) {
      var p = t.purchaseId && P[t.purchaseId];
      var what = p && p.items && p.items.length ? p.items.map(function (i) { return shortName(i.name); }).slice(0, 4).join(', ') : '';
      var st = t.reimbursed === true ? '<span class="status status--good">возместили</span>' : t.reimbursed === false
        ? '<button type="button" class="btn btn-small" data-sh-reimb="' + t.id + '">Возместили</button>' : '<button type="button" class="link-btn" data-sh-wait="' + t.id + '">ждать возмещения</button>';
      return '<li class="plan-row"><button type="button" class="plan-main" data-sh-tx="' + t.id + '"><span class="tx-title">' + esc(t.note || 'Покупка') + '</span>' +
        '<span class="tx-sub">' + U.dayShort(t.date) + (p && p.job ? ' · ' + (p.job === 'remote' ? 'дистанционная' : 'очная') : '') + (what ? ' · ' + esc(what) : '') + '</span></button>' +
        '<span class="plan-amt">' + U.money(t.amount) + '</span>' + st + '</li>';
    }).join('');
    return '<div class="btn-row shop-actions"><button type="button" class="btn btn-primary" data-sh-scan>📷 Сканировать чек</button><button type="button" class="btn" data-sh-wmanual>✍️ Рабочая покупка</button></div>' +
      '<div class="grid grid--2"><div class="card tile"><div class="tile-label">Для работы за месяц</div><div class="tile-value">' + U.money(Math.round(month)) + '</div></div>' +
      '<div class="card tile"><div class="tile-label">Должны вернуть</div><div class="tile-value' + (due ? ' is-bad' : '') + '">' + U.money(Math.round(due)) + '</div><div class="tile-hint">' + (due ? 'отметь, когда вернут' : 'всё возмещено') + '</div></div></div>' +
      (rows ? '<ul class="plan-list card">' + rows + '</ul>' : U.empty({ emoji: '💼', title: 'Рабочих покупок пока нет', text: 'Отсканируй чек и выбери «Для работы» — или впиши покупку. Сюда же попадают траты с категорией «Расходы на работу».' }));
  }

  function render(el) {
    host = el;
    var tabs = VIEWS.map(function (v) {
      return '<button type="button" role="tab" aria-selected="' + (state.view === v[0]) + '" data-sh-view="' + v[0] + '">' + v[1] + '</button>';
    }).join('');
    var body = state.view === 'home' ? homeHtml() : state.view === 'list' ? listHtml() : state.view === 'food' ? foodHtml() : state.view === 'work' ? workHtml() : boughtHtml();
    el.innerHTML = '<div class="shop"><header class="page-head"><h1>Покупки</h1><p class="lead">Чеки, продукты дома, список, еда и рабочие покупки</p></header><div class="toolbar"><div class="segmented shop-tabs" role="tablist" aria-label="Подраздел">' + tabs + '</div></div>' + body + '</div>';
    var wrap = el.firstChild;
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('change', onChange);
    wrap.addEventListener('submit', onSubmit);
  }
  function rerender() { if (host && host.isConnected) render(host); }

  function onClick(e) {
    var t = e.target.closest('button, [data-sh-scan]');
    if (!t) return;
    var d = t.dataset;
    if (d.shView) { state.view = d.shView; rerender(); }
    else if ('shScan' in d) scanDialog();
    else if ('shManual' in d) manualDialog(false);
    else if ('shWmanual' in d) manualDialog(true);
    else if (d.shOpen) { state.open = state.open === d.shOpen ? '' : d.shOpen; rerender(); }
    else if (d.shDelp) { if (confirm('Удалить чек? Трата в «Деньгах» останется.')) { Store.remove('purchases', d.shDelp); state.open = ''; } }
    else if (d.shOut) {
      var p = Store.list('pantry').find(function (x) { return x.id === d.shOut; });
      Store.remove('pantry', d.shOut);
      if (p) U.toast(p.name + ' — закончилось', { action: 'В список', onAction: function () { addToList([p.name]); } });
    }
    else if ('shCook' in d) askCook();
    else if (d.shDel) Store.remove('shopping', d.shDel);
    else if ('shBuy' in d) buyChecked();
    else if ('shPrices' in d) fetchSitePrices();
    else if ('shPromoall' in d) { state.promoAll = !state.promoAll; rerender(); }
    else if ('shAddrecipe' in d) recipeDialog(null);
    else if (d.shRecipe) recipeDialog(Store.list('recipes').find(function (r) { return r.id === d.shRecipe; }));
    else if (d.shNeed) { var r = Store.list('recipes').find(function (x) { return x.id === d.shNeed; }); U.toast('В список добавлено: ' + addToList(missingFor(r))); }
    else if ('shWeekbuy' in d) weekShopping();
    else if (d.shReimb) {
      var tx = Store.list('transactions').find(function (x) { return x.id === d.shReimb; });
      Store.update('transactions', d.shReimb, { reimbursed: true });
      if (tx) U.toast('Отмечено. Записать возврат денег как доход?', { action: 'Записать', onAction: function () {
        Store.add('transactions', { type: 'income', amount: tx.amount, date: U.today(), account: tx.account, to: '', category: 'refunds', sub: '', note: 'Возмещение: ' + (tx.note || 'покупка для работы') });
      } });
    }
    else if (d.shWait) Store.update('transactions', d.shWait, { reimbursed: false });
    else if (d.shTx && Tabs.money && Tabs.money.openTx) Tabs.money.openTx(d.shTx);
  }
  function onChange(e) {
    var t = e.target;
    if (t.dataset.shCheck) Store.update('shopping', t.dataset.shCheck, { done: t.checked });
    else if (t.dataset.shMenu) setMenu(t.dataset.shMenu, t.value);
  }
  function onSubmit(e) {
    var f = e.target;
    if (!f.dataset.shLform && !f.dataset.shPform) return;
    e.preventDefault();
    var items = String(f.elements.t.value || '').split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!items.length) return;
    if (f.dataset.shLform) addToList(items); else pantryAdd(items);
    setTimeout(function () { var i = document.querySelector('[data-sh-' + (f.dataset.shLform ? 'lform' : 'pform') + '] input'); if (i) i.focus(); }, 50);
  }

  // ---------- Для других вкладок ----------
  // Напоминание о возмещении — в «На что обратить внимание».
  function hookAlerts() {
    if (!window.Tabs.money || Tabs.money._shopHooked) return;
    var orig = Tabs.money.alerts;
    Tabs.money.alerts = function () {
      var out = orig ? orig() : [];
      var due = workDue();
      if (due > 0) out.push({ emoji: '💼', text: 'За рабочие покупки должны вернуть ' + U.money(Math.round(due)), tab: 'shop', level: 'info' });
      return out;
    };
    Tabs.money._shopHooked = true;
  }
  setTimeout(hookAlerts, 0);

  window.Tabs.shop = {
    render: render,
    summary: function () { return { value: U.money(Math.round(monthTotal(Store.list('purchases').filter(function (p) { return !p.work && U.monthKey(p.date) === U.monthKey(U.today()); })))), hint: 'покупки за месяц' }; },
    scan: scanDialog, addToList: addToList, pantryAdd: pantryAdd, priceOf: priceOf, workDue: workDue, shortName: shortName, missingFor: missingFor,
    setMenuByTitle: function (date, title) {
      var r = Store.list('recipes').find(function (x) { return MD.norm(x.title) === MD.norm(title); });
      if (r) setMenu(date, r.id);
      return !!r;
    }
  };
})();
