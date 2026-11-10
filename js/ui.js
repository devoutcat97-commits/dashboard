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
  function empty(o) {
    return (
      '<div class="card empty-state">' +
        '<div class="empty-emoji" aria-hidden="true">' + o.emoji + '</div>' +
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
    empty: empty, ring: ring,
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
