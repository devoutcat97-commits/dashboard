/* ============================================================
   Общие помощники для всех вкладок:
   формат денег и дат, всплывающие подсказки, окна-формы,
   уведомления, скачивание и загрузка файлов.
   ============================================================ */
(function () {
  'use strict';

  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONTHS_DAT = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];
  var MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  var WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  // ---------- Текст ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function plural(n, one, few, many) {
    n = Math.abs(n) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  // ---------- Деньги ----------
  var nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function round2(n) { return Math.round(n * 100) / 100; }
  // Целые — без копеек («1 250»), дробные — с двумя знаками («1 250,50»).
  function num(n) {
    n = round2(n);
    return n === Math.round(n) ? nf.format(n) : nf2.format(n);
  }
  function money(n) { return num(n) + ' ₽'; }
  function signed(n) {
    n = round2(n);
    return (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
  }

  // Понимает «1 250,50», «1250.5», «−300» (минус — только если allowNegative).
  function parseMoney(s, allowNegative) {
    var str = String(s == null ? '' : s).replace(/[\s  ₽]/g, '').replace(',', '.').replace('−', '-');
    var neg = false;
    if (str.charAt(0) === '-') {
      if (!allowNegative) return NaN;
      neg = true;
      str = str.slice(1);
    }
    if (!/^\d+(\.\d{0,2})?$/.test(str)) return NaN;
    var v = round2(parseFloat(str));
    return neg ? -v : v;
  }

  // Число для поля ввода: 1250.5 → «1250,5»
  function moneyInput(n) {
    return n || n === 0 ? String(n).replace('.', ',') : '';
  }

  // ---------- Даты (строки вида «2026-11-08», всегда по местному времени) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return iso(new Date()); }
  function toDate(s) {
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +(p[2] || 1));
  }
  function monthKey(s) { return s.slice(0, 7); }
  function addMonths(key, k) {
    var d = toDate(key + '-01');
    d.setMonth(d.getMonth() + k);
    return iso(d).slice(0, 7);
  }
  function daysIn(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1], 0).getDate();
  }
  function monthTitle(key) {
    var p = key.split('-');
    return MONTHS[+p[1] - 1] + ' ' + p[0];
  }
  function monthShort(key) { return MONTHS_SHORT[+key.split('-')[1] - 1]; }
  function monthGen(key) { return MONTHS_GEN[+key.split('-')[1] - 1]; }
  function monthDat(key) { return MONTHS_DAT[+key.split('-')[1] - 1]; }
  function dayShort(s) {
    var d = toDate(s);
    return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ', ' + WEEKDAYS_SHORT[d.getDay()];
  }
  function dayLabel(s) {
    if (s === today()) return 'Сегодня';
    var y = new Date();
    y.setDate(y.getDate() - 1);
    if (s === iso(y)) return 'Вчера';
    var d = toDate(s);
    var label = d.getDate() + ' ' + MONTHS_GEN[d.getMonth()];
    if (d.getFullYear() !== new Date().getFullYear()) label += ' ' + d.getFullYear();
    return label + ', ' + WEEKDAYS[d.getDay()];
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- Всплывающая подсказка ----------
  // Любой элемент с атрибутом data-tip показывает подсказку при наведении
  // (на телефоне — при касании). Перенос строки — символ \n.
  var tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.hidden = true;
  document.body.appendChild(tip);

  function showTip(text, x, y) {
    tip.innerHTML = esc(text).replace(/\n/g, '<br>');
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
    var top = y - h - 14;
    if (top < 8) top = y + 18;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip() { tip.hidden = true; }

  function onPointer(e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t && t.dataset.tip) showTip(t.dataset.tip, e.clientX, e.clientY);
    else hideTip();
  }
  document.addEventListener('pointermove', onPointer);
  document.addEventListener('pointerdown', onPointer);
  window.addEventListener('scroll', hideTip, { passive: true });

  // ---------- Уведомление внизу экрана ----------
  var toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);
  var toastTimer;
  // opts: { action: 'Отменить', onAction: fn } — кнопка в уведомлении (например, отмена удаления).
  function toast(text, opts) {
    toastEl.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = text;
    toastEl.appendChild(span);
    if (opts && opts.action) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-action';
      b.textContent = opts.action;
      b.addEventListener('click', function () {
        toastEl.classList.remove('is-on');
        opts.onAction();
      });
      toastEl.appendChild(b);
    }
    toastEl.classList.toggle('has-action', !!(opts && opts.action));
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, opts && opts.action ? 5000 : 2200);
  }

  // ---------- Окно с формой ----------
  // fields — список полей или функция (values) → список,
  // если набор полей зависит от выбранного (например, «Расход / Доход»).
  function fieldHtml(f, values) {
    var v = values[f.name] == null ? '' : values[f.name];
    var half = f.half ? ' half' : '';
    var rr = f.rerender ? ' data-rerender' : '';
    var af = f.autofocus ? ' autofocus' : '';
    var label = '<span class="field-label">' + esc(f.label) + '</span>';

    function opts(list) {
      return list.map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(v) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('');
    }
    function radios(cls) {
      return f.options.map(function (o) {
        return '<label class="' + cls + '"><input type="radio" name="' + f.name + '" value="' + esc(o.value) + '"' +
          (String(o.value) === String(v) ? ' checked' : '') + rr + '><span>' + esc(o.label) + '</span></label>';
      }).join('');
    }

    switch (f.type) {
      case 'seg':
        return '<div class="field' + half + '"><div class="seg" role="radiogroup" aria-label="' + esc(f.label) + '">' + radios('seg-item') + '</div></div>';
      case 'chips':
        return '<fieldset class="field' + half + '"><legend class="field-label">' + esc(f.label) + '</legend><div class="chips">' + radios('chip') + '</div></fieldset>';
      case 'money':
        return '<label class="field' + half + '">' + label + '<span class="money-input"><input name="' + f.name + '" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(v) + '"' + af + '><span class="suffix">₽</span></span></label>';
      case 'select':
        return '<label class="field' + half + '">' + label + '<select name="' + f.name + '"' + rr + '>' + opts(f.options) + '</select></label>';
      case 'date':
        return '<label class="field' + half + '">' + label + '<input type="date" name="' + f.name + '" value="' + esc(v) + '"></label>';
      case 'number':
        return '<label class="field' + half + '">' + label + '<input type="number" inputmode="numeric" autocomplete="off" name="' + f.name + '" value="' + esc(v) + '"' +
          (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + af + '></label>';
      case 'textarea':
        return '<label class="field' + half + '">' + label + '<textarea autocomplete="off" name="' + f.name + '" rows="' + (f.rows || 3) + '" maxlength="' + (f.maxlength || 500) + '"' +
          (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>' + esc(v) + '</textarea></label>';
      case 'hint':
        return '<p class="field field-hint">' + esc(f.text) + '</p>';
      default:
        return '<label class="field' + half + '">' + label + '<input type="text" autocomplete="off" name="' + f.name + '" value="' + esc(v) + '"' +
          (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + ' maxlength="' + (f.maxlength || 80) + '"' + af + '></label>';
    }
  }

  function formDialog(o) {
    var values = Object.assign({}, o.values || {});
    var dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML =
      '<form class="sheet-form" novalidate autocomplete="off">' +
        '<div class="sheet-head"><h2>' + esc(o.title) + '</h2>' +
          '<button type="button" class="icon-x" data-close aria-label="Закрыть">' +
            '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
        '<div class="sheet-body"></div>' +
        '<p class="form-error" role="alert" hidden></p>' +
        '<div class="sheet-foot">' +
          (o.onDelete ? '<button type="button" class="btn btn-danger" data-delete>' + esc(o.deleteLabel || 'Удалить') + '</button>' : '') +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn" data-close>Отмена</button>' +
          '<button type="submit" class="btn btn-primary">' + esc(o.submitLabel || 'Сохранить') + '</button>' +
        '</div>' +
      '</form>';

    var form = dlg.querySelector('form');
    var body = dlg.querySelector('.sheet-body');
    var err = dlg.querySelector('.form-error');

    function fieldList() { return typeof o.fields === 'function' ? o.fields(values) : o.fields; }
    function draw() {
      body.innerHTML = fieldList().map(function (f) { return fieldHtml(f, values); }).join('');
    }
    function collect() {
      fieldList().forEach(function (f) {
        if (f.type === 'hint') return;
        if (f.type === 'seg' || f.type === 'chips') {
          var c = form.querySelector('input[name="' + f.name + '"]:checked');
          values[f.name] = c ? c.value : '';
        } else if (form.elements[f.name]) {
          values[f.name] = form.elements[f.name].value;
        }
      });
    }

    draw();

    form.addEventListener('change', function (e) {
      if (e.target.hasAttribute('data-rerender')) {
        collect();
        draw();
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      collect();
      var problem = o.onSubmit(Object.assign({}, values));
      if (problem) {
        err.textContent = problem;
        err.hidden = false;
      } else {
        dlg.close();
      }
    });

    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
      else if (e.target.closest('[data-delete]') && o.onDelete() !== false) dlg.close();
    });
    dlg.addEventListener('close', function () { dlg.remove(); });

    document.body.appendChild(dlg);
    dlg.showModal();
    var first = body.querySelector('[autofocus]');
    if (first) first.focus();
  }

  // ---------- Файлы ----------
  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // asBuffer = true — отдаём сырые байты (нужно, чтобы самим определить кодировку файла).
  function pickFile(accept, onResult, asBuffer) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { onResult(asBuffer ? reader.result : String(reader.result), file); };
      if (asBuffer) reader.readAsArrayBuffer(file);
      else reader.readAsText(file);
    });
    input.click();
  }

  // Текст из байтов: сначала пробуем UTF-8, если не вышло — Windows-1251 (так часто сохраняют банки).
  function decodeText(buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (e) {
      return new TextDecoder('windows-1251').decode(buffer);
    }
  }

  // ---------- Кольцо прогресса ----------
  // pct 0..1; opts: { size, stroke, text (в центре), cls (цвет: '', 'is-warn', 'is-bad', 'is-good') }
  function ring(pct, opts) {
    opts = opts || {};
    var size = opts.size || 64, sw = opts.stroke || 7;
    var r = (size - sw) / 2, c = 2 * Math.PI * r;
    var p = Math.max(0, Math.min(1, pct || 0));
    var text = opts.text != null ? opts.text : Math.round(p * 100) + '%';
    return (
      '<svg class="ring ' + (opts.cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + esc(text) + '">' +
        '<circle class="ring-track" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + sw + '"/>' +
        '<circle class="ring-bar" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + sw + '" stroke-dasharray="' + c.toFixed(2) +
          '" stroke-dashoffset="' + (c * (1 - p)).toFixed(2) + '" style="--c:' + c.toFixed(2) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
        '<text class="ring-text" x="50%" y="50%" dominant-baseline="central" text-anchor="middle" style="font-size:' + Math.round(size * 0.24) + 'px">' + esc(text) + '</text>' +
      '</svg>'
    );
  }

  // ---------- Пустой экран ----------
  // { emoji, title, text, action: 'Добавить', attr: 'data-action="add-tx"' }
  // ---------- Линейные значки ----------
  // Один набор на весь интерфейс (тонкая линия, цвет текста). Эмодзи в кнопках, заголовках и подсказках
  // заменены ими; эмодзи остаются только в содержимом: особые даты, категории трат, погода, праздники 🎉.
  var ICONS = {
    wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3h-4a2 2 0 0 0 0 4h4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/>',
    check: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8.5 12 2.5 2.5 5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 5-5"/>',
    hourglass: '<path d="M6 3h12M6 21h12M7.5 3v3.5a4.5 4.5 0 0 0 9 0V3M7.5 21v-3.5a4.5 4.5 0 0 1 9 0V21"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    book: '<path d="M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5Zm0 0A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    moon: '<path d="M20 14.6A8 8 0 1 1 9.4 4a6.5 6.5 0 0 0 10.6 10.6Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    cart: '<path d="M3 4h2.2l2.2 11h11l2-8H7"/><circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
    receipt: '<path d="M5 3v18l2.3-1.5L9.7 21l2.3-1.5 2.3 1.5 2.4-1.5L19 21V3l-2.3 1.5L14.3 3 12 4.5 9.7 3 7.3 4.5z"/><path d="M9 9h6M9 13h6"/>',
    gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21 8 9l4-6 4 6z"/>',
    piggy: '<path d="M5 11a7 6 0 0 1 12-3h2v3l-1.5 1.5V16H15v2h-2.5v-2h-3v2H7v-2.5A6 6 0 0 1 5 11Z"/><path d="M14.5 10.5v.01"/>',
    plane: '<path d="M10.5 13.5 3 11l1.5-1.5 8 .5 4.5-5a2.1 2.1 0 0 1 3 3l-5 4.5.5 8L14 22l-2.5-7.5L8 18v3l-1.5 1-1-3.5L2 17.5l1-1.5h3z"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    camera: '<path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>',
    dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    trendUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    trendDown: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
    stop: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    work: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M3 12.5h18"/>',
    chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    sprout: '<path d="M7 21h10M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 12c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5z"/>',
    flame: '<path d="M12 22c4 0 7-2.7 7-7 0-4-3-6-4-10-1.5 2-2 3.5-2 5-1-1-2-2-2.5-3.5C8 9 5 11.5 5 15c0 4.3 3 7 7 7z"/>',
    bag: '<path d="M5.5 7h13l1 14h-15z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    cook: '<path d="M5 3v8a2 2 0 0 0 2 2v8M9 3v8a2 2 0 0 1-2 2M7 3v6M18 21V3c-2 1-3.5 3.5-3.5 7v3H18"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    grad: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 2.5 9 2.5 12 0v-5"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'
  };
  var EMO = {
    '💸': 'wallet', '💰': 'wallet', '✅': 'check', '☑️': 'checkCircle', '⏳': 'hourglass', '🎤': 'mic', '📚': 'book', '📖': 'book',
    '⏱️': 'clock', '📄': 'file', '🌙': 'moon', '🔍': 'search', '🔎': 'search', '🛒': 'cart', '📊': 'chart', '🗓️': 'calendar',
    '💳': 'card', '🧾': 'receipt', '💎': 'gem', '🐷': 'piggy', '✈️': 'plane', '🧳': 'plane', '🏷️': 'tag', '📷': 'camera',
    '🎲': 'dice', '🤝': 'users', '📈': 'trendUp', '📉': 'trendDown', '⚠️': 'alert', '⛔': 'stop', '💼': 'work', '✨': 'chat',
    '🧐': 'eye', '🌱': 'sprout', '🔥': 'flame', '🛍️': 'bag', '🎯': 'target', '🏠': 'home', '🍳': 'cook', '☁️': 'cloud',
    '🔔': 'bell', '🎓': 'grad', '📝': 'pen', '🗂️': 'folder', '🏖️': 'sun', '🎁': 'gift', '🎉': 'checkCircle', '🔁': 'repeat'
  };
  function icon(name, cls) {
    return ICONS[name] ? '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>' : '';
  }
  // Эмодзи из интерфейса → линейный значок; неизвестное (содержимое) остаётся как есть.
  function emo(e, cls) { return EMO[e] ? icon(EMO[e], cls) : esc(e || ''); }

  function empty(o) {
    return (
      '<div class="card empty-state">' +
        '<div class="empty-emoji" aria-hidden="true">' + emo(o.emoji) + '</div>' +
        '<div class="empty-title">' + esc(o.title) + '</div>' +
        (o.text ? '<p class="empty-text">' + esc(o.text) + '</p>' : '') +
        (o.action ? '<button type="button" class="btn btn-primary btn-small" ' + (o.attr || '') + '>' + esc(o.action) + '</button>' : '') +
      '</div>'
    );
  }

  // Кнопка с data-focus="селектор" ставит курсор в нужное поле (например, в быструю строку).
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-focus]');
    if (!b) return;
    var el = document.querySelector(b.dataset.focus);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
  });

  window.UI = {
    empty: empty, ring: ring, icon: icon, emo: emo,
    esc: esc, plural: plural,
    round2: round2, num: num, money: money, signed: signed, parseMoney: parseMoney, moneyInput: moneyInput,
    pad: pad, iso: iso, today: today, toDate: toDate, monthKey: monthKey, addMonths: addMonths, daysIn: daysIn,
    monthTitle: monthTitle, monthShort: monthShort, monthGen: monthGen, monthDat: monthDat, dayShort: dayShort, dayLabel: dayLabel,
    uid: uid, showTip: showTip, hideTip: hideTip, toast: toast, formDialog: formDialog,
    download: download, pickFile: pickFile, decodeText: decodeText
  };
})();

// autocomplete-guard: браузер не должен подсовывать ранее введённые тексты (дни рождения, заметки и т.п.)
document.addEventListener('focusin', function (e) {
  var el = e.target;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
}, true);
