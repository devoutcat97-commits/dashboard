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
  var url = ScriptApp.getService().getUrl() || '(сначала разверни веб-приложение: Начать развёртывание → Веб-приложение)';
  return url + '?k=' + props().getProperty('HOOK_KEY');
}
// Положить ссылку в облако, чтобы её было видно в настройках дашборда.
function publishWebhook() {
  setJson('meta/hook', { url: webhookUrl(), at: new Date().toISOString() });
  console.log('Ссылка сохранена в дашборд: ' + webhookUrl());
}
