/* ============================================================
   Хранилище данных.

   Все вкладки читают и сохраняют данные только через Store,
   а не напрямую. Пока данные лежат в памяти браузера (localStorage).
   Когда подключим облачную базу, поменяется только этот файл,
   а вкладки трогать не придётся.

   Данные разложены по «коллекциям»: например, 'money', 'deadlines',
   'work.tasks', 'study.homework'. Каждая запись получает уникальный id.
   ============================================================ */
(function () {
  'use strict';

  var KEY = window.DASH_KEY ? DASH_KEY('dash:data:v1') : 'dash:data:v1';
  var listeners = new Set();
  var saveHooks = new Set();   // кто хочет знать о сохранениях на этом устройстве (облако)
  var data = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeLocal() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Не удалось сохранить данные:', e);
    }
  }

  function save() {
    writeLocal();
    notify();
    saveHooks.forEach(function (fn) { try { fn(); } catch (e) { console.warn(e); } });
  }

  function notify() {
    listeners.forEach(function (fn) { fn(); });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function collection(name) {
    if (!Array.isArray(data[name])) data[name] = [];
    return data[name];
  }

  window.Store = {
    // Где сейчас хранятся данные: 'local' (это устройство) или 'cloud'.
    mode: 'local',

    list: function (name) {
      return collection(name).map(function (r) { return Object.assign({}, r); });
    },

    add: function (name, fields) {
      var record = Object.assign({ id: uid(), createdAt: new Date().toISOString() }, fields);
      collection(name).push(record);
      save();
      return record;
    },

    // Добавить сразу много записей (например, из выписки) — с одним сохранением.
    addMany: function (name, list) {
      var now = new Date().toISOString();
      var out = list.map(function (f) { return Object.assign({ id: uid(), createdAt: now }, f); });
      Array.prototype.push.apply(collection(name), out);
      save();
      return out;
    },

    // Вернуть удалённую запись как была (для кнопки «Отменить»).
    restore: function (name, record) {
      collection(name).push(Object.assign({}, record));
      save();
    },

    update: function (name, id, patch) {
      var rec = collection(name).find(function (r) { return r.id === id; });
      if (!rec) return null;
      Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
      save();
      return rec;
    },

    remove: function (name, id) {
      var list = collection(name);
      var i = list.findIndex(function (r) { return r.id === id; });
      if (i !== -1) { list.splice(i, 1); save(); }
    },

    // Настройки (бюджет, категории и т.п.)
    getSetting: function (key, fallback) {
      var s = data.settings || {};
      return key in s ? s[key] : fallback;
    },
    setSetting: function (key, value) {
      data.settings = data.settings || {};
      data.settings[key] = value;
      save();
    },

    // Подписка на изменения: вкладка перерисуется, когда данные поменяются.
    subscribe: function (fn) {
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    },

    // Резервная копия: весь набор данных одной строкой JSON.
    exportJSON: function () {
      return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: data }, null, 2);
    },
    importJSON: function (text) {
      var parsed = JSON.parse(text);
      if (!parsed || typeof parsed.data !== 'object') throw new Error('Это не файл копии дашборда');
      data = parsed.data;
      save();
    },

    // ---- Для облака (js/cloud.js) ----
    _raw: function () { return data; },
    // Заменить данные пришедшими из облака: сохраняем на устройстве и перерисовываем,
    // но обратно в облако не отправляем.
    _replace: function (next) {
      data = next && typeof next === 'object' ? next : {};
      writeLocal();
      notify();
    },
    _onSave: function (fn) { saveHooks.add(fn); return function () { saveHooks.delete(fn); }; }
  };

  // Если дашборд открыт в двух вкладках браузера, держим их в согласии.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { data = load(); notify(); }
  });
})();
