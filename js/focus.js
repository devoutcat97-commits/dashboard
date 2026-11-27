/* ============================================================
   Таймер фокуса.

   Выбираешь, чем занимаешься (ВКР, самоподготовка…) и на сколько минут.
   Большой таймер считает время, по окончании — звук и предложение перерыва.
   Потраченное время само записывается во вкладку «Время».
   Таймер переживает перезагрузку страницы: конец хранится в браузере.
   Если окно свернуть, внизу остаётся маленькая плашка с оставшимся временем.
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;
  var esc = U.esc;
  var KEY = window.DASH_KEY ? DASH_KEY('dash:focus') : 'dash:focus';
  var LAST = 'dash:focus:last';
  var SKIP = { sleep: 1, road: 1, fun: 1, classes: 1 };   // для фокуса не подходят
  var dlg = null, pill = null, timer = null;

  // ---------- Состояние ----------
  // { mode: 'work'|'break', cat, total (мс), endsAt (мс) или null на паузе, left (мс на паузе), startedAt (мс) }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {} }
  function leftMs(s) { return s.endsAt ? Math.max(0, s.endsAt - Date.now()) : s.left; }
  function mmss(ms) { var t = Math.ceil(ms / 1000); return U.pad(Math.floor(t / 60)) + ':' + U.pad(t % 60); }
  function hm(ms) { var d = new Date(ms); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); }
  function cats() {
    var T = window.Tabs && Tabs.time;
    return (T ? T.cats() : []).filter(function (c) { return !SKIP[c.id]; });
  }
  function catName(id) { return window.Tabs && Tabs.time ? Tabs.time.catName(id) : id; }

  // Записать отработанное во «Время» (без пауз).
  function record(s, workedMs) {
    var min = Math.round(workedMs / 60000);
    if (min < 1) return 0;
    Store.add('time.entries', { category: s.cat, date: U.iso(new Date(s.startedAt)), minutes: min, start: hm(s.startedAt), end: hm(Date.now()), note: 'Фокус' });
    return min;
  }

  function start(mode, cat, minutes) {
    var now = Date.now();
    var s = { mode: mode, cat: cat, total: minutes * 60000, endsAt: now + minutes * 60000, left: 0, startedAt: now };
    save(s);
    if (mode === 'work') { try { localStorage.setItem(LAST, cat); } catch (e) {} }
    run();
  }

  // ---------- Тик раз в секунду ----------
  function run() {
    clearInterval(timer);
    timer = setInterval(update, 1000);
    update();
  }
  function update() {
    var s = load();
    if (!s) { clearInterval(timer); paintPill(null); return; }
    if (s.endsAt && Date.now() >= s.endsAt) { finish(s); return; }
    paintPill(s);
    if (dlg) paintRunning(s);
  }

  function finish(s) {
    clearInterval(timer);
    save(null);
    paintPill(null);
    if (window.FX) { FX.fanfare(); FX.haptic(200); }
    if (s.mode === 'work') {
      var min = record(s, s.total);
      notify('Фокус окончен', 'Записано: ' + catName(s.cat) + ' · ' + fmt(min) + '. Время перерыва!');
      openDone(s, min);
    } else {
      notify('Перерыв окончен', 'Можно продолжать');
      if (dlg) dlg.close();
      U.toast('Перерыв окончен — можно продолжать');
    }
  }
  function fmt(min) { return window.Tabs && Tabs.time ? Tabs.time.fmtDur(min) : min + ' мин'; }

  // Уведомление, если дашборд свёрнут (только когда уведомления уже разрешены).
  function notify(title, body) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      navigator.serviceWorker.getRegistration().then(function (r) {
        if (r) r.showNotification(title, { body: body, icon: 'icons/icon-192.png', tag: 'focus' });
      });
    } catch (e) {}
  }

  // ---------- Окно ----------
  function openDialog(html, onClick) {
    if (dlg) dlg.close();
    var d = dlg = document.createElement('dialog');
    dlg.className = 'sheet focus-sheet';
    dlg.innerHTML = '<div class="sheet-form">' +
      '<div class="sheet-head"><h2>⏳ Фокус</h2><button type="button" class="icon-x" data-f="close" aria-label="Свернуть окно таймера">' +
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>' +   // стрелка вниз: свернуть, таймер идёт дальше
      '<div class="focus-body">' + html + '</div></div>';
    d.addEventListener('click', function (e) {
      if (e.target === d) { d.close(); return; }
      var b = e.target.closest('[data-f]');
      if (!b) return;
      if (b.dataset.f === 'close') { d.close(); return; }
      onClick(b);
    });
    // Событие close приходит позже — к этому времени может быть открыто уже следующее окно.
    d.addEventListener('close', function () { d.remove(); if (dlg === d) dlg = null; });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  function openSetup() {
    var list = cats();
    var last = '';
    try { last = localStorage.getItem(LAST) || ''; } catch (e) {}
    if (!list.some(function (c) { return c.id === last; })) last = (list[0] || {}).id || '';
    var html =
      '<p class="field-label">Чем занимаешься?</p>' +
      '<div class="chips focus-cats" role="radiogroup" aria-label="Чем занимаешься">' + list.map(function (c) {
        return '<label class="chip"><input type="radio" name="fcat" value="' + esc(c.id) + '"' + (c.id === last ? ' checked' : '') + '><span>' + esc(c.name) + '</span></label>';
      }).join('') + '</div>' +
      '<p class="field-label">Сколько минут?</p>' +
      '<div class="focus-durs">' + [25, 50, 90].map(function (m) {
        return '<button type="button" class="btn' + (m === 25 ? ' btn-primary' : '') + '" data-f="go" data-min="' + m + '">' + m + ' мин</button>';
      }).join('') + '</div>' +
      '<p class="field-hint">Время само запишется во вкладку «Время». Окно можно закрыть — таймер продолжит идти.</p>';
    openDialog(html, function (b) {
      if (b.dataset.f !== 'go') return;
      var c = dlg.querySelector('input[name="fcat"]:checked');
      if (!c) { U.toast('Выбери, чем занимаешься'); return; }
      start('work', c.value, +b.dataset.min);
      openRunning();
    });
  }

  function openRunning() {
    var s = load();
    if (!s) { openSetup(); return; }
    var html =
      '<div class="focus-ring" role="timer" aria-live="off">' +
        '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="focus-track" cx="60" cy="60" r="54"/><circle class="focus-bar" cx="60" cy="60" r="54" pathLength="100"/></svg>' +
        '<div class="focus-time"></div><div class="focus-what"></div>' +
      '</div>' +
      '<div class="focus-actions">' +
        '<button type="button" class="btn" data-f="pause"></button>' +
        '<button type="button" class="btn" data-f="stop"></button>' +
      '</div>';
    openDialog(html, function (b) {
      var st = load();
      if (!st) return;
      if (b.dataset.f === 'pause') {
        if (st.endsAt) { st.left = leftMs(st); st.endsAt = null; }
        else { st.endsAt = Date.now() + st.left; }
        save(st);
        update();
      } else if (b.dataset.f === 'stop') {
        save(null);
        clearInterval(timer);
        paintPill(null);
        if (st.mode === 'work') {
          var min = record(st, st.total - leftMs(st));
          U.toast(min ? 'Записано: ' + catName(st.cat) + ' · ' + fmt(min) : 'Меньше минуты — не записано');
        }
        dlg.close();
      }
    });
    paintRunning(s);
  }

  function paintRunning(s) {
    if (!dlg) return;
    var t = dlg.querySelector('.focus-time');
    if (!t) return;
    var left = leftMs(s);
    t.textContent = mmss(left);
    dlg.querySelector('.focus-what').textContent = s.mode === 'work' ? catName(s.cat) : 'Перерыв';
    dlg.querySelector('.focus-bar').style.strokeDashoffset = String(100 * left / s.total);
    dlg.querySelector('.focus-ring').classList.toggle('is-break', s.mode === 'break');
    dlg.querySelector('.focus-ring').classList.toggle('is-paused', !s.endsAt);
    dlg.querySelector('[data-f="pause"]').textContent = s.endsAt ? 'Пауза' : 'Продолжить';
    dlg.querySelector('[data-f="stop"]').textContent = s.mode === 'work' ? 'Закончить и записать' : 'Закончить перерыв';
  }

  function openDone(s, min) {
    var html =
      '<p class="focus-done">🎉 ' + esc(catName(s.cat)) + ' · ' + esc(fmt(min)) + ' записано во «Время».</p>' +
      '<div class="focus-durs">' +
        '<button type="button" class="btn btn-primary" data-f="break">Перерыв 5 мин</button>' +
        '<button type="button" class="btn" data-f="again">Ещё раунд</button>' +
        '<button type="button" class="btn" data-f="close">Готово</button>' +
      '</div>';
    openDialog(html, function (b) {
      if (b.dataset.f === 'break') { start('break', s.cat, 5); openRunning(); }
      else if (b.dataset.f === 'again') { start('work', s.cat, Math.round(s.total / 60000)); openRunning(); }
    });
  }

  // ---------- Плашка внизу, пока окно закрыто ----------
  function paintPill(s) {
    if (!s || dlg) { if (pill) { pill.remove(); pill = null; } return; }
    if (!pill) {
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'focus-pill';
      pill.addEventListener('click', openRunning);
      document.body.appendChild(pill);
    }
    var txt = (s.mode === 'work' ? '⏳ ' + catName(s.cat) : '☕ Перерыв') + ' · ' + mmss(leftMs(s)) + (s.endsAt ? '' : ' · пауза');
    pill.textContent = txt;
    pill.setAttribute('aria-label', 'Таймер фокуса: ' + txt + '. Открыть');
  }

  window.Focus = {
    open: function () { if (load()) openRunning(); else openSetup(); },
    running: function () { return !!load(); }
  };

  // Таймер шёл до перезагрузки — продолжаем (или засчитываем, если уже кончился).
  if (load()) run();
  // Окно закрыли — показать плашку.
  document.addEventListener('close', function () { setTimeout(update, 0); }, true);
})();
