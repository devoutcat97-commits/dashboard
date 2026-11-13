/* ============================================================
   Сервер дашборда на Google Apps Script (бесплатно, в твоём Google-аккаунте).

   Делает две вещи:
   1) Принимает уведомления Т-Банка с телефона (MacroDroid шлёт сюда текст пуша)
      и кладёт их в облако: users/<id>/inbox. Дашборд сам разберёт их по категориям.
   2) Раз в минуту смотрит план напоминаний (users/<id>/meta/plan, его составляет дашборд)
      и отправляет push-уведомления на устройства (users/<id>/meta/push).

   Настройки (Свойства скрипта):
     UID       — id пользователя в Firebase (видно в дашборде: Настройки → Автоматизация)
     HOOK_KEY  — секрет для ссылки MacroDroid (создаётся сам функцией setup)
     EXEC_URL  — адрес развёртывания веб-приложения (…/exec)
   Секретов в этом файле нет.
   ============================================================ */

var PROJECT = 'dashboard-2948a';
var FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/';
var FCM = 'https://fcm.googleapis.com/v1/projects/' + PROJECT + '/messages:send';

function props() { return PropertiesService.getScriptProperties(); }
function uid() {
  var u = props().getProperty('UID');
  if (!u) throw new Error('Не задан UID в свойствах скрипта');
  return u;
}

function api(method, url, body) {
  var res = UrlFetchApp.fetch(url, {
    method: method,
    contentType: 'application/json',
    payload: body ? JSON.stringify(body) : null,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode(), text = res.getContentText();
  if (code === 404) return null;
  if (code >= 300) throw new Error(method.toUpperCase() + ' ' + url.replace(FS, '') + ' → ' + code + ' ' + text.slice(0, 400));
  return text ? JSON.parse(text) : {};
}
// ---------- Пользователи ----------
// Каждый пользователь живёт в <root>/<uid>/…, где root = users (рабочий сайт) или users_test (тестовая копия).
// Список пользователей и их секретные ключи для MacroDroid — в свойстве USERS: { "root/uid": "ключ" }.
// Владелец (UID) работает всегда, даже если его нет в списке, — так старые настройки не ломаются.
var ROOTS = { users: 1, users_test: 1 };
function cleanRoot(r) { return ROOTS[r] ? r : 'users'; }
function U(root, id) { return { root: cleanRoot(root), uid: id }; }
function owner() { return U('users', uid()); }
function base(u) { return FS + u.root + '/' + u.uid + '/'; }
function getJsonU(u, p) {
  var d = api('get', base(u) + p);
  return d && d.fields && d.fields.json ? JSON.parse(d.fields.json.stringValue) : null;
}
function setJsonU(u, p, obj) { api('patch', base(u) + p, { fields: { json: { stringValue: JSON.stringify(obj) } } }); }
function delU(u, p) { api('delete', base(u) + p); }
// Старые имена (для владельца) — чтобы прежние функции из редактора работали как раньше.
function userPath(p) { return base(owner()) + p; }
function getJson(p) { return getJsonU(owner(), p); }
function setJson(p, obj) { setJsonU(owner(), p, obj); }
function del(p) { delU(owner(), p); }

function registry() { try { return JSON.parse(props().getProperty('USERS') || '{}'); } catch (e) { return {}; } }
function allUsers() {
  var list = Object.keys(registry()).map(function (k) { var a = k.split('/'); return U(a[0], a[1]); });
  var o = owner();
  if (!list.some(function (u) { return u.root === o.root && u.uid === o.uid; })) list.unshift(o);
  return list;
}
function isOwner(id) { return id === props().getProperty('UID'); }

// Кто прислал запрос: проверяем вход через Google и берём root из запроса.
function caller(req) {
  var id = req && req.idToken ? whoIs(req.idToken) : '';
  return id ? U(req.root, id) : null;
}

// Дневные лимиты для всех, кроме владельца.
var LIMITS = { ai: 30, check: 5, prices: 10 };
var LIMIT_NAMES = { ai: 'вопросов к ИИ', check: 'чеков', prices: 'проверок цен' };
function overLimit(u, kind) {
  if (isOwner(u.uid)) return '';
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var day = Utilities.formatDate(new Date(), 'Asia/Barnaul', 'yyyyMMdd');
    var key = 'LIM_' + day, p = props();
    var all = JSON.parse(p.getProperty(key) || '{}');
    var id = u.uid + ':' + kind;
    if ((all[id] || 0) >= LIMITS[kind]) return 'На сегодня лимит ' + LIMIT_NAMES[kind] + ' исчерпан (' + LIMITS[kind] + ' в день). Завтра снова можно.';
    all[id] = (all[id] || 0) + 1;
    p.setProperty(key, JSON.stringify(all));
    Object.keys(p.getProperties()).forEach(function (k) { if (/^LIM_\d{8}$/.test(k) && k !== key) p.deleteProperty(k); });
    return '';
  } finally { lock.releaseLock(); }
}

// Регистрация: дашборд вызывает после входа. Выдаёт личную ссылку для MacroDroid и кладёт её в <root>/<uid>/meta/hook.
function register(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ error: 'Плохой запрос' }); }
  var u = caller(req);
  if (!u) return json({ error: 'Нужно войти в дашборд через Google' });
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var key = '';
  try {
    var reg = registry(), k = u.root + '/' + u.uid;
    if (u.root === 'users' && isOwner(u.uid)) key = props().getProperty('HOOK_KEY') || '';
    key = key || reg[k] || Utilities.getUuid().replace(/-/g, '');
    reg[k] = key;
    props().setProperty('USERS', JSON.stringify(reg));
  } finally { lock.releaseLock(); }
  var url = execUrl() + '?k=' + key;
  setJsonU(u, 'meta/hook', { url: url, at: new Date().toISOString() });
  return json({ ok: true, url: url });
}
function execUrl() { return props().getProperty('EXEC_URL') || ScriptApp.getService().getUrl(); }
function userByKey(key) {
  if (!key) return null;
  if (key === props().getProperty('HOOK_KEY')) return owner();
  var reg = registry();
  for (var k in reg) if (reg[k] === key) { var a = k.split('/'); return U(a[0], a[1]); }
  return null;
}

// ---------- 1. Уведомления банка с телефона ----------
function doPost(e) {
  if (e && e.parameter && e.parameter.a === 'ai') return aiChat(e);
  if (e && e.parameter && e.parameter.a === 'check') return receipt(e);
  if (e && e.parameter && e.parameter.a === 'prices') return sitePrices(e);
  if (e && e.parameter && e.parameter.a === 'register') return register(e);
  var who = userByKey((e && e.parameter && e.parameter.k) || '');
  if (!who) return text('forbidden');
  var body = (e.postData && e.postData.contents) || (e.parameter && e.parameter.text) || '';
  body = String(body).replace(/\s+/g, ' ').trim().slice(0, 1000);
  // Коды подтверждения и пароли никогда не сохраняем.
  if (!/\d/.test(body) || /код|пароль|никому не сообщ/i.test(body)) return text('skip');
  api('post', base(who) + 'inbox', { fields: {
    text: { stringValue: body },
    at: { stringValue: new Date().toISOString() },
    source: { stringValue: 'macrodroid' }
  } });
  props().setProperty('LAST_HOOK', new Date().toISOString());
  return text('ok');
}
function doGet() { return text('Сервер дашборда работает'); }

// ---------- 3. ИИ-чат (Gemini) ----------
// Дашборд присылает: idToken (кто пишет), system (правила + сводка данных), messages (переписка).
// Проверяем, что пишет именно владелец, и спрашиваем Gemini с ключом из свойства скрипта GEMINI_KEY
// (создаётся в Google Cloud → «Учётные данные»). VPN не нужен: запрос идёт с серверов Google.
var API_KEY = 'AIzaSyBpboHWJ6WXQi9bu1RHphYv5lpcmJmFHVo';   // публичный ключ Firebase (только для проверки входа)
var MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

function geminiUrl(model) {
  var key = props().getProperty('GEMINI_KEY') || props().getProperty('GEMENI_KEY');
  if (!key) throw new Error('Не задан ключ GEMINI_KEY в свойствах скрипта');
  return 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key);
}
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function whoIs(idToken) {
  var res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + API_KEY, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return '';
  var u = JSON.parse(res.getContentText()).users;
  return u && u[0] ? u[0].localId : '';
}

function aiChat(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ error: 'Плохой запрос' }); }
  var u = caller(req);
  if (!u) return json({ error: 'Нужно войти в дашборд через Google' });
  var lim = overLimit(u, 'ai');
  if (lim) return json({ error: lim });
  var body = {
    systemInstruction: { parts: [{ text: String(req.system || '').slice(0, 120000) }] },
    contents: (req.messages || []).slice(-16).map(function (m) {
      return { role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.text || '').slice(0, 4000) }] };
    }),
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
  };
  var models = props().getProperty('GEMINI_MODEL') ? [props().getProperty('GEMINI_MODEL')] : MODELS;
  var last = '';
  for (var i = 0; i < models.length; i++) {
    var url;
    try { url = geminiUrl(models[i]); } catch (err) { return json({ error: err.message }); }
    var res, code, out;
    for (var attempt = 0; attempt < 2; attempt++) {   // при перегрузке — короткая пауза и ещё попытка
      res = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true
      });
      code = res.getResponseCode(); out = res.getContentText();
      if (code !== 503) break;
      Utilities.sleep(1500);
    }
    if (code === 200) {
      var d = JSON.parse(out);
      var parts = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts || [];
      return json({ text: parts.map(function (p) { return p.text || ''; }).join(''), model: models[i] });
    }
    last = code + ' ' + out.slice(0, 300);
    // модель не найдена или перегружена — пробуем следующую; иначе сразу сообщаем
    if (code !== 404 && code !== 503 && code !== 500) break;
  }
  console.warn('Gemini ' + last);
  return json({ error: /429|RESOURCE_EXHAUSTED/.test(last) ? 'Лимит запросов к ИИ на сегодня исчерпан, попробуй позже'
    : /503|UNAVAILABLE/.test(last) ? 'ИИ сейчас перегружен (у Google пик нагрузки). Попробуй через минуту.' : 'ИИ не ответил: ' + last.slice(0, 160) });
}

// Проверка из редактора: «aiPing» → в журнале должен появиться ответ модели.
function aiPing() {
  var res = UrlFetchApp.fetch(geminiUrl(MODELS[0]), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Ответь одним словом: работает?' }] }] })
  });
  console.log(res.getResponseCode() + ' ' + res.getContentText().slice(0, 400));
}
function text(s) { return ContentService.createTextOutput(s); }

// ---------- 2. Push-уведомления ----------
function sendDue() {
  allUsers().forEach(function (u) {
    try { sendDueFor(u, sent); } catch (err) { console.warn(u.root + '/' + u.uid + ': ' + err.message); }
  });
  var now = Date.now();
  Object.keys(sent).forEach(function (k) { if (sent[k] < now - 4 * 864e5) delete sent[k]; });
  props().setProperty('SENT', JSON.stringify(sent));
}
// Для владельца на рабочем сайте метка отправки — просто id (как раньше), для остальных — с приставкой.
function sendDueFor(u, sent) {
  var pre = (u.root === 'users' && isOwner(u.uid)) ? '' : u.root + '/' + u.uid + '/';
  var push = getJsonU(u, 'meta/push');
  var tokens = push && push.tokens ? Object.keys(push.tokens) : [];
  if (!tokens.length) return;
  var plan = getJsonU(u, 'meta/plan');
  var test = getJsonU(u, 'meta/test');
  var now = Date.now();
  var items = (plan && plan.items) || [];
  if (test) items = items.concat([test]);
  var due = items.filter(function (it) {
    var t = Date.parse(it.at);
    return t <= now + 30e3 && t > now - 20 * 60e3 && !sent[pre + it.id];
  });
  var dead = {};
  due.forEach(function (it) {
    tokens.forEach(function (t) {
      if (dead[t]) return;
      var res = UrlFetchApp.fetch(FCM, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true,
        payload: JSON.stringify({ message: {
          token: t,
          data: { title: String(it.title || ''), body: String(it.body || ''), url: String(it.url || '#summary'), tag: String(it.id) },
          webpush: { headers: { Urgency: 'high', TTL: '3600' } }
        } })
      });
      var code = res.getResponseCode(), out = res.getContentText();
      if (code === 404 || /UNREGISTERED|registration-token-not-registered/.test(out)) dead[t] = true;
      else if (code >= 300) console.warn('FCM ' + code + ' ' + out.slice(0, 400));
    });
    sent[pre + it.id] = now;
  });
  if (test && (sent[pre + test.id] || Date.parse(test.at) < now - 20 * 60e3)) delU(u, 'meta/test');
  var deadList = Object.keys(dead);
  if (deadList.length) {
    deadList.forEach(function (t) { delete push.tokens[t]; });
    setJsonU(u, 'meta/push', push);
  }
}

// ---------- Установка (запустить один раз) ----------
function setup() {
  var p = props();
  if (!p.getProperty('HOOK_KEY')) p.setProperty('HOOK_KEY', Utilities.getUuid().replace(/-/g, ''));
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendDue').timeBased().everyMinutes(1).create();
  // Проверяем доступ к базе.
  getJson('meta/plan');
  console.log('Готово. Ссылка для MacroDroid: ' + webhookUrl());
}
function webhookUrl() {
  // EXEC_URL — постоянный адрес развёртывания (…/exec). Из редактора getUrl() отдаёт тестовый …/dev.
  var url = props().getProperty('EXEC_URL') || ScriptApp.getService().getUrl() || '(сначала разверни веб-приложение)';
  return url + '?k=' + props().getProperty('HOOK_KEY');
}
// Положить ссылку в облако, чтобы её было видно в настройках дашборда.
function publishWebhook() {
  setJson('meta/hook', { url: webhookUrl(), at: new Date().toISOString() });
  console.log('Ссылка сохранена в дашборд: ' + webhookUrl());
}

// ---------- Проверка доступности (запускать из редактора) ----------
// Смотрим, отвечают ли серверам Google сайты магазинов и сервис чеков. Ключи не используются.
function probe() {
  var urls = ['https://lenta.com/', 'https://magnit.ru/', 'https://www.maria-ra.ru/', 'https://5ka.ru/',
    'https://lenta.com/api/v1/search?value=молоко', 'https://5ka.ru/api/v2/special_offers/'];
  urls.forEach(function (u) {
    try {
      var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
      console.log(r.getResponseCode() + ' ' + r.getContentText().length + ' ' + u + ' | ' + r.getContentText().slice(0, 120).replace(/\s+/g, ' '));
    } catch (e) { console.log('ОШИБКА ' + u + ' ' + e.message); }
  });
  try {
    var c = UrlFetchApp.fetch('https://proverkacheka.com/api/v1/check/get', { method: 'post', muteHttpExceptions: true,
      payload: { token: 'test', qrraw: 't=20240101T1200&s=1.00&fn=1&i=1&fp=1&n=1' } });
    console.log('чеки: ' + c.getResponseCode() + ' ' + c.getContentText().slice(0, 200));
  } catch (e) { console.log('чеки: ОШИБКА ' + e.message); }
}


// ---------- 4. Чек по QR-коду (proverkacheka.com → данные ФНС) ----------
// Дашборд присылает строку из QR-кода чека (t=…&s=…&fn=…&i=…&fp=…&n=…), сервер возвращает товары.
function receipt(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ error: 'Плохой запрос' }); }
  var u = caller(req);
  if (!u) return json({ error: 'Нужно войти в дашборд через Google' });
  var token = props().getProperty('PROVERKACHEKA_TOKEN');
  if (!token) return json({ error: 'Не задан ключ PROVERKACHEKA_TOKEN в свойствах сервера' });
  var qr = String(req.qrraw || '').trim();
  if (!/fn=\d+/.test(qr) || !/s=[\d.]+/.test(qr)) return json({ error: 'Это не QR-код кассового чека' });
  var lim = overLimit(u, 'check');
  if (lim) return json({ error: lim });
  var res = UrlFetchApp.fetch('https://proverkacheka.com/api/v1/check/get', {
    method: 'post', muteHttpExceptions: true, payload: { token: token, qrraw: qr }
  });
  var d;
  try { d = JSON.parse(res.getContentText()); } catch (err) { return json({ error: 'Сервис чеков не ответил' }); }
  if (d.code !== 1 || !d.data || !d.data.json) {
    var msg = typeof d.data === 'string' ? d.data : 'код ' + d.code;
    return json({ error: d.code === 0 ? 'Чек пока не найден в ФНС — попробуй через пару часов' : 'Чек не получен: ' + msg });
  }
  var j = d.data.json;
  return json({
    store: j.user || j.retailPlace || '',
    address: j.retailPlaceAddress || '',
    dateTime: j.dateTime || '',
    total: (j.totalSum || 0) / 100,
    items: (j.items || []).map(function (it) {
      return { name: String(it.name || '').trim(), qty: it.quantity || 1, price: (it.price || 0) / 100, sum: (it.sum || 0) / 100 };
    })
  });
}


// ---------- 5. Цены магазинов (только открытые источники) ----------
// Магнит — их публичный поиск по каталогу; Мария-Ра — страница акций. Лента и Пятёрочка
// закрыли автоматический доступ, их не трогаем.
function magnitSearch(q) {
  var r = UrlFetchApp.fetch('https://magnit.ru/webgate/v2/goods/search', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ term: q, pagination: { limit: 6, offset: 0 }, sort: { order: 'desc', type: 'popularity' }, storeCode: '992301', storeType: 'dostavka', catalogType: '3' })
  });
  if (r.getResponseCode() !== 200) return [];
  return (JSON.parse(r.getContentText()).items || []).map(function (i) { return { name: i.name, price: i.price / 100 }; });
}
function mariaPromos() {
  var cache = CacheService.getScriptCache();
  var c = cache.get('maria-promos');
  if (c) return JSON.parse(c);
  var out = [];
  for (var page = 1; page <= 15; page++) {
    var r = UrlFetchApp.fetch('https://www.maria-ra.ru/aktsii/?PAGEN_1=' + page, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) break;
    var html = r.getContentText();
    var cards = html.split('discount-item__link').slice(1);
    if (!cards.length) break;
    var before = out.length;
    cards.forEach(function (c) {
      var t = c.match(/discount-item__title">([^<]+)</), p = c.match(/discount-item__price">(\d+)\s*<span>(\d+)/), o = c.match(/discount-item__price_old">([\d.]+)/), d = c.match(/discount-item__date">([^<]+)</);
      if (t && p) out.push({ name: t[1].replace(/&nbsp;/g, ' ').trim(), price: +(p[1] + '.' + p[2]), old: o ? +o[1] : 0, until: d ? d[1].replace(/&nbsp;/g, ' ').trim() : '' });
    });
    if (out.length === before) break;
    Utilities.sleep(300);
  }
  // убираем повторы (последняя страница сайта иногда отдаётся повторно)
  var seen = {}; out = out.filter(function (x) { var k = x.name + x.price; if (seen[k]) return false; seen[k] = 1; return true; });
  try { cache.put('maria-promos', JSON.stringify(out), 6 * 3600); } catch (e) {}
  return out;
}
function sitePrices(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ error: 'Плохой запрос' }); }
  var u = caller(req);
  if (!u) return json({ error: 'Нужно войти в дашборд через Google' });
  var lim = overLimit(u, 'prices');
  if (lim) return json({ error: lim });
  var res = { magnit: {}, promos: [] };
  (req.q || []).slice(0, 25).forEach(function (q) {
    try { res.magnit[q] = magnitSearch(q); } catch (err) { res.magnit[q] = []; }
  });
  if (req.promos) { try { res.promos = mariaPromos(); } catch (err) {} }
  return json(res);
}
