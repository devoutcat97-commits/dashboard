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
function userPath(p) { return FS + 'users/' + uid() + '/' + p; }
function getJson(p) {
  var d = api('get', userPath(p));
  return d && d.fields && d.fields.json ? JSON.parse(d.fields.json.stringValue) : null;
}
function setJson(p, obj) { api('patch', userPath(p), { fields: { json: { stringValue: JSON.stringify(obj) } } }); }
function del(p) { api('delete', userPath(p)); }

// ---------- 1. Уведомления банка с телефона ----------
function doPost(e) {
  if (e && e.parameter && e.parameter.a === 'ai') return aiChat(e);
  var key = (e && e.parameter && e.parameter.k) || '';
  if (!key || key !== props().getProperty('HOOK_KEY')) return text('forbidden');
  var body = (e.postData && e.postData.contents) || (e.parameter && e.parameter.text) || '';
  body = String(body).replace(/\s+/g, ' ').trim().slice(0, 1000);
  // Коды подтверждения и пароли никогда не сохраняем.
  if (!/\d/.test(body) || /код|пароль|никому не сообщ/i.test(body)) return text('skip');
  api('post', userPath('inbox'), { fields: {
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
// Проверяем, что пишет именно владелец, и спрашиваем Gemini от имени этого Google-аккаунта —
// ключ не нужен, VPN не нужен: запрос идёт с серверов Google.
var API_KEY = 'AIzaSyBpboHWJ6WXQi9bu1RHphYv5lpcmJmFHVo';   // публичный ключ Firebase (только для проверки входа)
var MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];

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
  if (!req.idToken || whoIs(req.idToken) !== uid()) return json({ error: 'Нужно войти в дашборд через Google' });
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
    var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
    });
    var code = res.getResponseCode(), out = res.getContentText();
    if (code === 200) {
      var d = JSON.parse(out);
      var parts = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts || [];
      return json({ text: parts.map(function (p) { return p.text || ''; }).join(''), model: models[i] });
    }
    last = code + ' ' + out.slice(0, 300);
    if (code !== 404) break;   // модель не найдена — пробуем следующую; иначе сразу сообщаем
  }
  console.warn('Gemini ' + last);
  return json({ error: /429|RESOURCE_EXHAUSTED/.test(last) ? 'Лимит запросов к ИИ на сегодня исчерпан, попробуй позже' : 'ИИ не ответил: ' + last.slice(0, 160) });
}

// Проверка из редактора: «aiPing» → в журнале должен появиться ответ модели.
function aiPing() {
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODELS[0] + ':generateContent', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Ответь одним словом: работает?' }] }] })
  });
  console.log(res.getResponseCode() + ' ' + res.getContentText().slice(0, 400));
}
function text(s) { return ContentService.createTextOutput(s); }

// ---------- 2. Push-уведомления ----------
function sendDue() {
  var push = getJson('meta/push');
  var tokens = push && push.tokens ? Object.keys(push.tokens) : [];
  if (!tokens.length) return;
  var plan = getJson('meta/plan');
  var test = getJson('meta/test');
  var now = Date.now();
  var sent = JSON.parse(props().getProperty('SENT') || '{}');
  var items = (plan && plan.items) || [];
  if (test) items = items.concat([test]);
  var due = items.filter(function (it) {
    var t = Date.parse(it.at);
    return t <= now + 30e3 && t > now - 20 * 60e3 && !sent[it.id];
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
    sent[it.id] = now;
  });
  Object.keys(sent).forEach(function (k) { if (sent[k] < now - 4 * 864e5) delete sent[k]; });
  props().setProperty('SENT', JSON.stringify(sent));
  if (test && (sent[test.id] || Date.parse(test.at) < now - 20 * 60e3)) del('meta/test');
  var deadList = Object.keys(dead);
  if (deadList.length) {
    deadList.forEach(function (t) { delete push.tokens[t]; });
    setJson('meta/push', push);
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
