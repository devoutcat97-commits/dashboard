/* ============================================================
   Главный файл: меню, переключение вкладок, тема, общие настройки,
   работа без интернета.
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;

  // ---------- Иконки (простые линейные SVG) ----------
  var ICONS = {
    summary: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M10 17V7.5h3.2a2.4 2.4 0 0 1 0 4.8H8.5M8.5 14.8h5"/>',
    work: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M3 12.5h18"/>',
    study: '<path d="M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5Zm0 0A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20 14.6A8 8 0 1 1 9.4 4a6.5 6.5 0 0 0 10.6 10.6Z"/>',
    auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'
  };

  function icon(name) {
    return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  // ---------- Вкладки ----------
  // Каждая вкладка — отдельный файл, который регистрирует себя в window.Tabs.
  var TABS = [
    { id: 'summary', title: 'Сводка' },
    { id: 'money', title: 'Деньги' },
    { id: 'work', title: 'Работа' },
    { id: 'study', title: 'Учёба' },
    { id: 'time', title: 'Время' }
  ];
  var Tabs = window.Tabs || {};

  var nav = document.getElementById('nav');
  var view = document.getElementById('view');

  nav.innerHTML = TABS.map(function (t) {
    return '<a href="#' + t.id + '" data-tab="' + t.id + '">' + icon(t.id) + '<span>' + t.title + '</span></a>';
  }).join('');

  // ---------- Переключение вкладок ----------
  // Адрес вкладки хранится после # (например, …/#money),
  // поэтому работают кнопка «Назад» и закладки на конкретную вкладку.
  var firstRender = true;
  var prevIndex = -1;

  // soft = true — тихая перерисовка (поменялись данные): без анимации и прокрутки.
  function render(soft) {
    var id = location.hash.replace('#', '');
    var tab = TABS.find(function (t) { return t.id === id; }) || TABS[0];
    var index = TABS.indexOf(tab);

    nav.querySelectorAll('a').forEach(function (a) {
      if (a.dataset.tab === tab.id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (window.FX) FX.moveIndicator(nav);

    if (Tabs[tab.id]) Tabs[tab.id].render(view);
    document.title = tab.id === 'summary' ? 'Мой дашборд' : tab.title + ' · Мой дашборд';

    if (soft !== true) {
      if (!firstRender) {
        window.scrollTo(0, 0);
        view.focus({ preventScroll: true });
        if (window.FX && prevIndex !== -1 && prevIndex !== index) FX.slide(view, index > prevIndex ? 1 : -1);
      }
      if (window.FX) FX.enter(view);
    }
    prevIndex = index;
    firstRender = false;
  }

  window.addEventListener('hashchange', function () { render(false); });
  window.addEventListener('resize', function () { if (window.FX) FX.moveIndicator(nav); });

  // Перерисовать текущую вкладку без прокрутки наверх (например, когда догрузилось расписание).
  window.App = {
    softRefresh: function () {
      var y = window.scrollY;
      render(true);
      window.scrollTo(0, y);
    },
    go: function (tab) { location.hash = '#' + tab; },
    // Соседняя вкладка (для свайпа на телефоне).
    step: function (d) {
      var i = Math.max(0, TABS.findIndex(function (t) { return '#' + t.id === location.hash; }));
      var next = TABS[i + d];
      if (next) location.hash = '#' + next.id;
    }
  };
  Store.subscribe(function () { window.App.softRefresh(); });

  // ---------- Тема: авто → светлая → тёмная ----------
  var THEMES = ['auto', 'light', 'dark'];
  var THEME_LABEL = { auto: 'Авто', light: 'Светлая', dark: 'Тёмная' };
  var THEME_ICON = { auto: 'auto', light: 'sun', dark: 'moon' };
  var themeBtn = document.getElementById('theme-btn');
  var metaTheme = document.querySelector('meta[name="theme-color"]');
  var root = document.documentElement;

  function currentTheme() {
    var t = root.dataset.theme;
    return t === 'light' || t === 'dark' ? t : 'auto';
  }

  function applyTheme(t) {
    if (t === 'auto') delete root.dataset.theme;
    else root.dataset.theme = t;
    try { localStorage.setItem('dash:theme', t); } catch (e) {}
    syncThemeUI();
  }

  function syncThemeUI() {
    var t = currentTheme();
    themeBtn.innerHTML = icon(THEME_ICON[t]);
    themeBtn.setAttribute('aria-label', 'Тема: ' + THEME_LABEL[t] + '. Нажмите, чтобы сменить');
    themeBtn.setAttribute('data-tip', 'Тема: ' + THEME_LABEL[t]);
    // Цвет строки состояния на телефоне подстраиваем под фон.
    metaTheme.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
  }

  themeBtn.addEventListener('click', function () {
    applyTheme(THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeUI);

  // ---------- Цвет акцента ----------
  var ACCENTS = [
    { id: 'emerald', name: 'Изумруд', color: '#2f6f62' },
    { id: 'blue', name: 'Синий', color: '#2563eb' },
    { id: 'violet', name: 'Фиолетовый', color: '#6d4fd8' },
    { id: 'rose', name: 'Малиновый', color: '#c2416b' },
    { id: 'amber', name: 'Янтарный', color: '#b45309' },
    { id: 'graphite', name: 'Графит', color: '#3f4a5a' }
  ];
  function currentAccent() { return root.dataset.accent || 'emerald'; }
  function applyAccent(id) {
    if (id === 'emerald') delete root.dataset.accent;
    else root.dataset.accent = id;
    try { localStorage.setItem('dash:accent', id); } catch (e) {}
    syncThemeUI();
  }

  // ---------- Общие настройки ----------
  var settingsBtn = document.getElementById('settings-btn');
  settingsBtn.innerHTML = icon('gear');

  var installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installPrompt = e; });

  function openSettings() {
    var info = Tabs.study && Tabs.study.scheduleInfo ? Tabs.study.scheduleInfo() : null;
    var upd = info && info.updatedAt ? new Date(info.updatedAt) : null;
    var updText = upd ? upd.getDate() + ' ' + U.monthGen(U.iso(upd)) + ' в ' + U.pad(upd.getHours()) + ':' + U.pad(upd.getMinutes()) : '—';
    var t = currentTheme();
    var dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML =
      '<div class="sheet-form">' +
        '<div class="sheet-head"><h2>Настройки</h2><button type="button" class="icon-x" data-close aria-label="Закрыть">' +
          '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
        '<div class="sheet-body settings-body">' +
          '<div class="field"><span class="field-label">Тема</span><div class="seg" role="radiogroup" aria-label="Тема">' +
            THEMES.map(function (k) {
              return '<label class="seg-item"><input type="radio" name="theme" value="' + k + '"' + (k === t ? ' checked' : '') + '><span>' + THEME_LABEL[k] + '</span></label>';
            }).join('') + '</div></div>' +

          '<div class="field"><span class="field-label">Цвет акцента</span><div class="swatches">' +
            ACCENTS.map(function (a) {
              return '<label class="swatch" style="--sw:' + a.color + '"><input type="radio" name="accent" value="' + a.id + '"' +
                (a.id === currentAccent() ? ' checked' : '') + '><span class="swatch-dot"></span><span class="swatch-name">' + a.name + '</span></label>';
            }).join('') + '</div></div>' +

          '<div class="field"><span class="field-label">Звуки</span><div class="seg" role="radiogroup" aria-label="Звуки">' +
            '<label class="seg-item"><input type="radio" name="sound" value="1"' + (window.FX && FX.soundOn() ? ' checked' : '') + '><span>Включены</span></label>' +
            '<label class="seg-item"><input type="radio" name="sound" value="0"' + (window.FX && !FX.soundOn() ? ' checked' : '') + '><span>Выключены</span></label>' +
          '</div><p class="field-hint">Тихий щелчок при отметке галочки и фанфара за важные моменты.</p></div>' +

          '<div class="field"><span class="field-label">Город для погоды на Сводке</span>' +
            '<div class="quick-row"><input type="text" name="city" maxlength="60" placeholder="Например, Новосибирск" value="' +
              U.esc(window.Weather ? Weather.cityName() : '') + '"><button type="button" class="btn" data-act="city">Сохранить</button></div>' +
            '<p class="field-hint" data-hint="city">Погода берётся с сервиса Open-Meteo, бесплатно и без регистрации.</p></div>' +

          '<div class="field"><span class="field-label">Напоминания</span>' +
            '<p class="field-hint" data-hint="remind">' + (window.Reminders ? Reminders.statusText() : '') + '</p>' +
            '<div class="btn-row"><button type="button" class="btn" data-act="remind">' +
              (window.Reminders && Reminders.enabled() ? 'Выключить напоминания' : 'Включить напоминания') + '</button></div></div>' +

          '<div class="field"><span class="field-label">Резервная копия всех данных</span>' +
            '<p class="field-hint">Пока данные хранятся только в этом браузере. Время от времени скачивай копию — так ничего не потеряется. ' +
              'Из копии можно перенести данные на другое устройство.</p>' +
            '<div class="btn-row"><button type="button" class="btn" data-act="export">Скачать копию</button>' +
            '<button type="button" class="btn" data-act="import">Загрузить из копии</button></div></div>' +

          '<div class="field"><span class="field-label">Расписание пар</span>' +
            '<p class="field-hint">' + (info ? 'Группа ' + U.esc(info.group) + ' · обновлено ' + U.esc(updText) + '. ' : '') +
              'Расписание берётся с сайта alt.ranepa.ru. После выкладки на GitHub оно будет обновляться само раз в день.</p></div>' +

          '<div class="field"><span class="field-label">На экран телефона</span>' +
            '<p class="field-hint">iPhone: открой дашборд в Safari → кнопка «Поделиться» → «На экран „Домой“». ' +
              'Android: в Chrome меню ⋮ → «Добавить на главный экран» или «Установить приложение». После этого дашборд открывается как приложение и работает без интернета.</p>' +
            (installPrompt ? '<div class="btn-row"><button type="button" class="btn btn-primary" data-act="install">Установить</button></div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="sheet-foot"><span class="spacer"></span><button type="button" class="btn" data-close>Готово</button></div>' +
      '</div>';

    dlg.addEventListener('change', function (e) {
      if (e.target.name === 'theme') applyTheme(e.target.value);
      if (e.target.name === 'accent') { applyAccent(e.target.value); if (window.FX) FX.sparkle(e.target.parentNode); }
      if (e.target.name === 'sound' && window.FX) { FX.setSound(e.target.value === '1'); if (e.target.value === '1') FX.fanfare(); }
    });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
      var act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'export') U.download('dashboard-backup-' + U.today() + '.json', Store.exportJSON());
      if (act.dataset.act === 'import') {
        U.pickFile('.json,application/json', function (text) {
          if (!confirm('Заменить все текущие данные данными из файла? Текущие записи будут потеряны.')) return;
          try { Store.importJSON(text); U.toast('Данные загружены из копии'); dlg.close(); }
          catch (err) { alert('Не получилось загрузить файл: ' + err.message); }
        });
      }
      if (act.dataset.act === 'city' && window.Weather) {
        var hint = dlg.querySelector('[data-hint="city"]');
        var name = dlg.querySelector('input[name="city"]').value.trim();
        hint.textContent = 'Ищу город…';
        Weather.setCity(name).then(function (label) {
          hint.textContent = label ? 'Сохранено: ' + label + '.' : 'Погода выключена.';
          window.App.softRefresh();
        }).catch(function (err) { hint.textContent = err.message; });
      }
      if (act.dataset.act === 'remind' && window.Reminders) {
        Reminders.toggle().then(function () {
          dlg.querySelector('[data-hint="remind"]').textContent = Reminders.statusText();
          act.textContent = Reminders.enabled() ? 'Выключить напоминания' : 'Включить напоминания';
        });
      }
      if (act.dataset.act === 'install' && installPrompt) {
        installPrompt.prompt();
        installPrompt = null;
        dlg.close();
      }
    });
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }
  settingsBtn.addEventListener('click', openSettings);

  // ---------- Где хранятся данные ----------
  var chip = document.getElementById('sync-chip');
  chip.dataset.state = Store.mode;
  chip.querySelector('.sync-text').textContent =
    Store.mode === 'cloud' ? 'Синхронизировано' : 'Данные на этом устройстве';

  // ---------- Работа без интернета ----------
  // Служебный файл sw.js сохраняет копию страниц и расписания: дашборд открывается и без связи.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  syncThemeUI();
  render();
})();
