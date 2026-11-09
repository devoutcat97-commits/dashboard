/* ============================================================
   Облако: синхронизация данных между устройствами через Firebase.

   Как это устроено простыми словами:
   - Данные как и раньше живут в браузере (Store), дашборд работает без интернета.
   - После входа через Google копия данных лежит в облаке в твоей личной папке.
   - Данные разложены на «части»: каждая коллекция — отдельная часть,
     а операции по деньгам — по одной части на месяц. Меняется трата за ноябрь —
     в облако уходит только ноябрь.
   - Изменения с другого устройства приходят сами за пару секунд.
   - Если устройство было без интернета, при подключении оно сравнит, что
     поменялось у него и что в облаке, и досинхронизирует.
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var CFG = window.CLOUD_CONFIG;
  var SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  var CHUNKED = { transactions: true, 'time.entries': true };   // большие коллекции — по месяцам

  var auth = null, db = null, user = null, unsub = null;
  var state = CFG ? 'loading' : 'off';   // off | loading | signed-out | connecting | synced | offline | error
  var errorText = '';
  var remote = {};       // часть → JSON-строка, как сейчас в облаке
  var synced = {};       // часть → отпечаток последней синхронизированной версии
  var ready = false;     // первая сверка с облаком прошла
  var pushTimer = null, pushing = false, pushAgain = false;
  var listeners = [];

  // ---------- Вспомогательное ----------
  function hash(s) {
    if (s == null) return '';
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ':' + s.length;
  }
  function monthOf(item) {
    var d = item && typeof item.date === 'string' ? item.date : '';
    return /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : 'x';
  }
  function partsOf(data) {
    var out = {};
    Object.keys(data || {}).forEach(function (name) {
      var v = data[name];
      if (Array.isArray(v)) {
        if (CHUNKED[name]) {
          var by = {};
          v.forEach(function (it) { var m = monthOf(it); (by[m] = by[m] || []).push(it); });
          Object.keys(by).forEach(function (m) { out['c~' + name + '~' + m] = JSON.stringify(by[m]); });
        } else if (v.length) {
          out['c~' + name] = JSON.stringify(v);
        }
      } else if (v != null) {
        out['o~' + name] = JSON.stringify(v);
      }
    });
    return out;
  }
  function fromParts(map) {
    var data = {};
    Object.keys(map).sort().forEach(function (key) {
      var bits = key.split('~');
      var val;
      try { val = JSON.parse(map[key]); } catch (e) { return; }
      if (bits[0] === 'c') data[bits[1]] = (data[bits[1]] || []).concat(val);
      else if (bits[0] === 'o') data[bits[1]] = val;
    });
    return data;
  }
  function isEmpty(parts) {
    return !Object.keys(parts).some(function (k) { return k.indexOf('c~') === 0; });
  }
  function syncedKey() { return 'dash:cloud:synced:' + (user ? user.uid : ''); }
  function loadSynced() {
    try { return JSON.parse(localStorage.getItem(syncedKey()) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveSynced() {
    try { localStorage.setItem(syncedKey(), JSON.stringify(synced)); } catch (e) {}
  }
  function partsRef() { return db.collection('users').doc(user.uid).collection('parts'); }

  function setState(s, err) {
    state = s;
    errorText = err ? String(err.message || err) : '';
    listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
    paintChip();
  }

  // ---------- Загрузка Firebase ----------
  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = function () { fail(new Error('Не загрузилась библиотека облака — проверь интернет')); };
      document.head.appendChild(s);
    });
  }
  function init() {
    if (!CFG) { paintChip(); return; }
    loadScript(SDK + 'firebase-app-compat.js')
      .then(function () { return loadScript(SDK + 'firebase-auth-compat.js'); })
      .then(function () { return loadScript(SDK + 'firebase-firestore-compat.js'); })
      .then(function () {
        firebase.initializeApp(CFG);
        auth = firebase.auth();
        db = firebase.firestore();
        auth.getRedirectResult().catch(function (e) { U.toast('Не получилось войти: ' + e.message); });
        auth.onAuthStateChanged(function (u) {
          if (u) start(u);
          else { stop(); setState('signed-out'); remindSignIn(); }
        });
      })
      .catch(function (e) { setState(navigator.onLine ? 'error' : 'offline', e); });
  }

  // ---------- Вход и выход ----------
  function signIn() {
    if (!auth) { U.toast(CFG ? 'Облако ещё загружается…' : 'Облако пока не подключено'); return; }
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    auth.signInWithPopup(provider).catch(function (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment' || e.code === 'auth/cancelled-popup-request') {
        auth.signInWithRedirect(provider);
      } else if (e.code !== 'auth/popup-closed-by-user') {
        U.toast('Не получилось войти: ' + e.message);
      }
    });
  }
  function signOut() {
    if (!auth) return;
    if (!confirm('Выйти из облака? Данные останутся на этом устройстве, но перестанут синхронизироваться.')) return;
    auth.signOut();
  }
  var reminded = false;
  function remindSignIn() {
    if (reminded) return;
    reminded = true;
    setTimeout(function () {
      if (state === 'signed-out') U.toast('Войди через Google, чтобы данные были на всех устройствах', { action: 'Войти', onAction: signIn });
    }, 2500);
  }

  // ---------- Синхронизация ----------
  function start(u) {
    if (user && user.uid === u.uid && unsub) return;
    stop();
    user = u;
    synced = loadSynced();
    remote = {};
    ready = false;
    setState('connecting');
    unsub = partsRef().onSnapshot({ includeMetadataChanges: true }, function (snap) {
      var changed = [];
      snap.docChanges().forEach(function (ch) {
        if (ch.doc.metadata.hasPendingWrites) return;      // это наша же запись, ещё не дошедшая до сервера
        var key = ch.doc.id;
        if (ch.type === 'removed') delete remote[key];
        else remote[key] = ch.doc.data().json;
        changed.push(key);
      });
      if (snap.metadata.fromCache) { if (!ready) setState('offline'); return; }
      if (!ready) { ready = true; firstSync(); }
      else if (changed.length) applyRemote(changed);
      if (!pushing && state !== 'synced') setState('synced');
    }, function (e) {
      setState('error', e);
      if (/permission/i.test(e.message)) U.toast('Облако не пустило: проверь правила базы в Firebase');
    });
  }
  function stop() {
    if (unsub) { unsub(); unsub = null; }
    user = null;
    ready = false;
    clearTimeout(pushTimer);
  }

  // Первая сверка после входа или после того, как устройство было без связи.
  function firstSync() {
    var local = partsOf(Store._raw());
    var known = Object.keys(synced).length > 0;
    if (!known) {
      var remoteEmpty = !Object.keys(remote).length;
      if (remoteEmpty) { push(); return; }
      if (isEmpty(local)) { takeAll(); return; }
      var same = Object.keys(local).length === Object.keys(remote).length &&
        Object.keys(local).every(function (k) { return remote[k] === local[k]; });
      if (same) { Object.keys(local).forEach(function (k) { synced[k] = hash(local[k]); }); saveSynced(); return; }
      askWhichCopy();
      return;
    }
    // Обычный случай: сравниваем каждую часть с тем, что было при прошлой синхронизации.
    var final = Object.assign({}, local);
    var tookRemote = false;
    Object.keys(Object.assign({}, local, remote)).forEach(function (k) {
      var hl = hash(local[k]), hr = hash(remote[k]), s = synced[k] || '';
      if (hl === hr) { if (hl) synced[k] = hl; else delete synced[k]; return; }
      if (hl === s) {                         // поменялось только в облаке — берём оттуда
        if (remote[k] == null) delete final[k]; else final[k] = remote[k];
        if (hr) synced[k] = hr; else delete synced[k];
        tookRemote = true;
      }
      // иначе поменялось здесь (или и там, и здесь) — оставляем версию этого устройства, push отправит её
    });
    saveSynced();
    if (tookRemote) Store._replace(fromParts(final));
    push();
  }

  function takeAll() {
    try { localStorage.setItem('dash:data:before-cloud', JSON.stringify(Store._raw())); } catch (e) {}
    Object.keys(remote).forEach(function (k) { synced[k] = hash(remote[k]); });
    saveSynced();
    Store._replace(fromParts(remote));
    U.toast('Данные загружены из облака ☁️');
  }

  function askWhichCopy() {
    var nLocal = (Store._raw().transactions || []).length;
    var nRemote = fromParts(remote).transactions ? fromParts(remote).transactions.length : 0;
    U.formDialog({
      title: 'В облаке уже есть данные',
      submitLabel: 'Продолжить',
      values: { pick: 'cloud' },
      fields: [
        { type: 'hint', text: 'На этом устройстве и в облаке разные данные. Какие оставить? Вторая версия будет заменена.' },
        { name: 'pick', type: 'seg', label: 'Оставить', options: [
          { value: 'cloud', label: '☁️ Из облака (' + nRemote + ' опер.)' },
          { value: 'local', label: '💻 С этого устройства (' + nLocal + ' опер.)' }] },
        { type: 'hint', text: 'На всякий случай сначала скачай резервную копию в настройках. Копия данных этого устройства также сохранится в браузере.' }
      ],
      onSubmit: function (v) {
        if (v.pick === 'cloud') { takeAll(); return; }
        synced = {};
        Object.keys(remote).forEach(function (k) { synced[k] = hash(remote[k]); });   // чтобы лишние части в облаке удалились
        push(true);
      }
    });
  }

  // Изменения из облака, пришедшие во время работы.
  function applyRemote(keys) {
    var local = partsOf(Store._raw());
    var final = Object.assign({}, local);
    var took = false;
    keys.forEach(function (k) {
      var hl = hash(local[k]), hr = hash(remote[k]);
      if (hl === hr) { if (hr) synced[k] = hr; else delete synced[k]; return; }
      if (hl !== (synced[k] || '') && pushTimer) return;   // здесь есть свежая неотправленная правка — она важнее
      if (remote[k] == null) delete final[k]; else final[k] = remote[k];
      if (hr) synced[k] = hr; else delete synced[k];
      took = true;
    });
    saveSynced();
    if (took) Store._replace(fromParts(final));
  }

  // Отправить в облако части, которые поменялись на этом устройстве.
  function push(force) {
    clearTimeout(pushTimer);
    pushTimer = null;
    if (!user || !ready || !db) return;
    if (pushing) { pushAgain = true; return; }
    var local = partsOf(Store._raw());
    var ops = [];
    Object.keys(local).forEach(function (k) {
      var h = hash(local[k]);
      if (h !== synced[k] || (force && remote[k] !== local[k])) ops.push({ key: k, json: local[k], h: h });
    });
    Object.keys(synced).forEach(function (k) { if (!(k in local)) ops.push({ key: k, del: true }); });
    if (!ops.length) return;
    var big = ops.find(function (o) { return o.json && o.json.length > 900000; });
    if (big) { U.toast('Часть данных слишком большая для облака: ' + big.key); setState('error', 'Слишком большая часть данных'); return; }

    pushing = true;
    setState(navigator.onLine ? 'connecting' : 'offline');
    var batches = [];
    for (var i = 0; i < ops.length; i += 400) batches.push(ops.slice(i, i + 400));
    var ts = firebase.firestore.FieldValue.serverTimestamp();
    Promise.all(batches.map(function (group) {
      var b = db.batch();
      group.forEach(function (o) {
        var ref = partsRef().doc(o.key);
        if (o.del) { b.delete(ref); delete remote[o.key]; }
        else { b.set(ref, { json: o.json, at: ts }); remote[o.key] = o.json; }
      });
      return b.commit();
    })).then(function () {
      ops.forEach(function (o) { if (o.del) delete synced[o.key]; else synced[o.key] = o.h; });
      saveSynced();
      pushing = false;
      setState('synced');
      if (pushAgain) { pushAgain = false; push(); }
    }).catch(function (e) {
      pushing = false;
      setState('error', e);
      U.toast('Не получилось сохранить в облако: ' + e.message);
    });
  }

  Store._onSave(function () {
    if (!user || !ready) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 800);
  });
  window.addEventListener('online', function () { if (user && ready) push(); });
  window.addEventListener('offline', function () { if (user) setState('offline'); });

  // ---------- Значок состояния ----------
  var LABEL = {
    off: 'Данные на этом устройстве',
    loading: 'Подключаю облако…',
    'signed-out': 'Войти в облако',
    connecting: 'Синхронизация…',
    synced: 'Синхронизировано',
    offline: 'Нет связи — сохраню позже',
    error: 'Ошибка облака'
  };
  function paintChip() {
    var chip = document.getElementById('sync-chip');
    if (chip) {
      chip.dataset.state = state;
      var t = chip.querySelector('.sync-text');
      if (t) t.textContent = LABEL[state] || '';
      chip.title = errorText || (user ? 'Вошёл как ' + (user.email || user.displayName || '') : '');
    }
    var btn = document.getElementById('cloud-btn');
    if (btn) {
      btn.hidden = state === 'off';
      btn.dataset.state = state;
      btn.setAttribute('aria-label', LABEL[state] || 'Облако');
      btn.setAttribute('data-tip', LABEL[state] + (user && user.email ? '\n' + user.email : ''));
    }
  }
  function onChipClick() {
    if (state === 'signed-out') signIn();
    else if (state !== 'off') document.getElementById('settings-btn').click();
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('#sync-chip, #cloud-btn')) onChipClick();
  });

  window.Cloud = {
    configured: !!CFG,
    state: function () { return state; },
    error: function () { return errorText; },
    user: function () { return user ? { email: user.email, name: user.displayName } : null; },
    label: function () { return LABEL[state] || ''; },
    signIn: signIn,
    signOut: signOut,
    syncNow: function () { if (user && ready) { push(true); U.toast('Отправляю в облако…'); } },
    onChange: function (fn) { listeners.push(fn); },
    _partsOf: partsOf, _fromParts: fromParts   // для проверки
  };

  init();
})();
