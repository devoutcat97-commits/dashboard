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
    base = {};
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
      if (!ready) { ready = true; firstSync(); watchInbox(); }
      else if (changed.length) applyRemote(changed);
      if (!pushing && state !== 'synced') setState('synced');
    }, function (e) {
      setState('error', e);
      if (/permission/i.test(e.message)) U.toast('Облако не пустило: проверь правила базы в Firebase');
    });
  }
  // ---------- Входящие: операции из уведомлений банка ----------
  // Сервер кладёт сырой текст уведомления в users/<id>/inbox. Забираем каждое ровно один раз
  // (через транзакцию — даже если дашборд открыт на двух устройствах сразу) и превращаем в запись.
  var unsubInbox = null, inboxBusy = false, inboxAgain = false;
  function watchInbox() {
    if (unsubInbox) unsubInbox();
    var ref = db.collection('users').doc(user.uid).collection('inbox');
    unsubInbox = ref.onSnapshot(function (snap) {
      if (!snap.empty) drainInbox(snap.docs.map(function (d) { return d.ref; }));
    }, function () {});
  }
  function drainInbox(refs) {
    if (!ready || !window.Tabs || !Tabs.money || !Tabs.money.processInbox) { setTimeout(function () { drainInbox(refs); }, 1500); return; }
    if (inboxBusy) { inboxAgain = true; return; }
    inboxBusy = true;
    var got = [];
    Promise.all(refs.map(function (ref) {
      return db.runTransaction(function (tx) {
        return tx.get(ref).then(function (d) {
          if (!d.exists) return null;
          tx.delete(ref);
          return d.data();
        });
      }).then(function (data) { if (data) got.push(data); }).catch(function () {});
    })).then(function () {
      got.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
      if (got.length) Tabs.money.processInbox(got.map(function (g) { return { text: (g.title ? g.title + '. ' : '') + (g.text || ''), at: g.at }; }));
      inboxBusy = false;
      if (inboxAgain) {
        inboxAgain = false;
        db.collection('users').doc(user.uid).collection('inbox').get().then(function (q) {
          if (!q.empty) drainInbox(q.docs.map(function (d) { return d.ref; }));
        });
      }
    });
  }

  function stop() {
    if (unsubInbox) { unsubInbox(); unsubInbox = null; }
    if (unsub) { unsub(); unsub = null; }
    user = null;
    ready = false;
    clearTimeout(pushTimer);
  }

  // ---------- Слияние двух версий одной части ----------
  // Сравниваем записи по id: что изменили здесь — берём отсюда, что там — оттуда.
  // Если одну и ту же запись поменяли в двух местах — берём более позднюю правку.
  // b — общая версия до изменений (может быть неизвестна), l — здесь, r — в облаке.
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function stamp(x) { return (x && (x.updatedAt || x.createdAt)) || ''; }
  function pick3(inB, B, inL, L, inR, R) {
    if (inL && inR) {
      if (same(L, R)) return { keep: true, v: L };
      if (inB && same(L, B)) return { keep: true, v: R };
      if (inB && same(R, B)) return { keep: true, v: L };
      return { keep: true, v: stamp(R) > stamp(L) ? R : L };
    }
    if (inL) return { keep: !inB || !same(L, B), v: L };    // в облаке удалили: оставляем, только если здесь меняли
    if (inR) return { keep: !inB || !same(R, B), v: R };    // здесь удалили: аналогично
    return { keep: false };
  }
  function parse(j) { try { return j == null ? null : JSON.parse(j); } catch (e) { return null; } }
  function merge3(key, b, l, r) {
    if (l === r) return l;
    var B = parse(b), L = parse(l), R = parse(r);
    if (key.indexOf('c~') === 0) {
      var mB = {}, mL = {}, mR = {}, order = [], seen = {}, loose = [];
      (B || []).forEach(function (x) { if (x && x.id) mB[x.id] = x; });
      [[R || [], mR], [L || [], mL]].forEach(function (pair) {
        pair[0].forEach(function (x) {
          if (!x || !x.id) { if (!loose.some(function (y) { return same(x, y); })) loose.push(x); return; }
          pair[1][x.id] = x;
          if (!seen[x.id]) { seen[x.id] = true; order.push(x.id); }
        });
      });
      Object.keys(mB).forEach(function (id) { if (!seen[id]) { seen[id] = true; order.push(id); } });
      var out = [];
      order.forEach(function (id) {
        var r3 = pick3(id in mB, mB[id], id in mL, mL[id], id in mR, mR[id]);
        if (r3.keep) out.push(r3.v);
      });
      out = out.concat(loose);
      return out.length ? JSON.stringify(out) : null;
    }
    if (key === 'o~settings') {
      B = B || {}; L = L || {}; R = R || {};
      var res = {};
      Object.keys(Object.assign({}, B, L, R)).forEach(function (k2) {
        var r4 = pick3(k2 in B, B[k2], k2 in L, L[k2], k2 in R, R[k2]);
        if (r4.keep) res[k2] = r4.v;
      });
      return JSON.stringify(res);
    }
    return l != null ? l : r;
  }

  var base = {};   // часть → последняя общая версия (здесь и в облаке одинаковая)

  // Первая сверка после входа или после того, как устройство было без связи.
  function firstSync() {
    var local = partsOf(Store._raw());
    var known = Object.keys(synced).length > 0;
    if (!known) {
      if (!Object.keys(remote).length) { push(); return; }
      if (isEmpty(local)) { takeAll(); return; }
    }
    var final = Object.assign({}, local);
    var changedHere = false, merged = 0;
    Object.keys(Object.assign({}, local, remote)).forEach(function (k) {
      var hl = hash(local[k]), hr = hash(remote[k]), s = synced[k] || '';
      if (hl === hr) { if (hl) { synced[k] = hl; base[k] = remote[k]; } else { delete synced[k]; delete base[k]; } return; }
      if (known && hl === s) {               // поменялось только в облаке — берём оттуда
        if (remote[k] == null) delete final[k]; else final[k] = remote[k];
        if (hr) { synced[k] = hr; base[k] = remote[k]; } else { delete synced[k]; delete base[k]; }
        changedHere = true;
        return;
      }
      if (known && hr === s) { base[k] = remote[k]; return; }   // поменялось только здесь — отправит push
      // Поменялось и там, и здесь (или устройство подключается впервые) — объединяем по записям.
      var m = merge3(k, null, local[k], remote[k]);
      if (m == null) delete final[k]; else final[k] = m;
      if (hr) { synced[k] = hr; base[k] = remote[k]; } else { delete synced[k]; delete base[k]; }
      changedHere = true;
      merged++;
    });
    saveSynced();
    if (changedHere) Store._replace(fromParts(final));
    if (!known && merged) U.toast('Данные этого устройства объединены с облаком ☁️');
    push();
  }

  function takeAll() {
    try { localStorage.setItem('dash:data:before-cloud', JSON.stringify(Store._raw())); } catch (e) {}
    Object.keys(remote).forEach(function (k) { synced[k] = hash(remote[k]); base[k] = remote[k]; });
    saveSynced();
    Store._replace(fromParts(remote));
    U.toast('Данные загружены из облака ☁️');
  }

  // Изменения из облака, пришедшие во время работы.
  function applyRemote(keys) {
    var local = partsOf(Store._raw());
    var final = Object.assign({}, local);
    var took = false, needPush = false;
    keys.forEach(function (k) {
      var hl = hash(local[k]), hr = hash(remote[k]);
      if (hl === hr) { if (hr) { synced[k] = hr; base[k] = remote[k]; } else { delete synced[k]; delete base[k]; } return; }
      if (hl === (synced[k] || '')) {
        if (remote[k] == null) delete final[k]; else final[k] = remote[k];
      } else {                                // здесь есть свои неотправленные правки — объединяем
        var m = merge3(k, base[k], local[k], remote[k]);
        if (m == null) delete final[k]; else final[k] = m;
        needPush = true;
      }
      if (hr) { synced[k] = hr; base[k] = remote[k]; } else { delete synced[k]; delete base[k]; }
      took = true;
    });
    saveSynced();
    if (took) Store._replace(fromParts(final));
    if (needPush) schedulePush();
  }

  // Отправить в облако части, которые поменялись на этом устройстве.
  // Пишем через транзакцию: если за это время часть поменяли на другом устройстве,
  // сначала объединяем, чтобы ничьи записи не потерялись.
  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(push, 800); }
  function push() {
    clearTimeout(pushTimer);
    pushTimer = null;
    if (!user || !ready || !db) return;
    if (pushing) { pushAgain = true; return; }
    var local = partsOf(Store._raw());
    var ops = [];
    Object.keys(local).forEach(function (k) { if (hash(local[k]) !== (synced[k] || '')) ops.push({ key: k, local: local[k] }); });
    Object.keys(synced).forEach(function (k) { if (!(k in local)) ops.push({ key: k, local: null }); });
    if (!ops.length) return;
    var big = ops.find(function (o) { return o.local && o.local.length > 900000; });
    if (big) { U.toast('Часть данных слишком большая для облака: ' + big.key); setState('error', 'Слишком большая часть данных'); return; }
    if (!navigator.onLine) { setState('offline'); return; }

    pushing = true;
    setState('connecting');
    var ts = firebase.firestore.FieldValue.serverTimestamp();
    var chunks = [];
    for (var i = 0; i < ops.length; i += 200) chunks.push(ops.slice(i, i + 200));
    var anyMerged = false;
    chunks.reduce(function (prev, group) {
      return prev.then(function () {
        return db.runTransaction(function (tx) {
          var refs = group.map(function (o) { return partsRef().doc(o.key); });
          return Promise.all(refs.map(function (r) { return tx.get(r); })).then(function (docs) {
            docs.forEach(function (d, j) {
              var o = group[j];
              var rj = d.exists ? d.data().json : null;
              o.merged = hash(rj) !== (synced[o.key] || '');
              o.final = o.merged ? merge3(o.key, base[o.key], o.local, rj) : o.local;
              if (o.final == null) tx.delete(refs[j]);
              else tx.set(refs[j], { json: o.final, at: ts });
            });
          });
        }).then(function () {
          group.forEach(function (o) {
            if (o.final == null) { delete remote[o.key]; delete synced[o.key]; delete base[o.key]; }
            else { remote[o.key] = o.final; synced[o.key] = hash(o.final); base[o.key] = o.final; }
            if (o.merged) anyMerged = true;
          });
        });
      });
    }, Promise.resolve()).then(function () {
      saveSynced();
      if (anyMerged) {
        // Подтягиваем объединённое к себе (учитывая правки, сделанные, пока шла отправка).
        var cur = partsOf(Store._raw());
        ops.forEach(function (o) {
          if (!o.merged) return;
          var m = merge3(o.key, o.local, cur[o.key], o.final);
          if (m == null) delete cur[o.key]; else cur[o.key] = m;
        });
        Store._replace(fromParts(cur));
      }
      pushing = false;
      setState('synced');
      if (pushAgain || anyMerged) { pushAgain = false; schedulePush(); }
    }).catch(function (e) {
      pushing = false;
      var offline = !navigator.onLine || /unavailable|offline|network/i.test(String(e.code || e.message));
      setState(offline ? 'offline' : 'error', e);
      if (!offline) U.toast('Не получилось сохранить в облако: ' + e.message);
      setTimeout(schedulePush, offline ? 30000 : 15000);
    });
  }

  Store._onSave(function () {
    if (!user || !ready) return;
    schedulePush();
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
    syncNow: function () { if (user && ready) { push(); U.toast('Отправляю в облако…'); } },
    onChange: function (fn) { listeners.push(fn); },
    _partsOf: partsOf, _fromParts: fromParts, _merge3: merge3,   // для проверки
    _db: function () { return db; },
    _uid: function () { return user && ready ? user.uid : ''; }
  };

  init();
})();
