/* ============================================================
   Графики. Рисуются как SVG под ширину своего блока.
   Цвета берутся из CSS (переменные --accent, --series-1 и т.д.),
   поэтому сами подстраиваются под светлую/тёмную тему.
   ============================================================ */
(function () {
  'use strict';

  var U = window.UI;

  // «Красивые» деления оси: 0, 5 000, 10 000 …
  function niceTicks(max, count) {
    count = count || 4;
    if (!(max > 0)) max = 1000;
    var raw = max / count;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    var top = Math.ceil(max / step - 1e-9) * step;
    var ticks = [];
    for (var v = 0; v <= top + step / 2; v += step) ticks.push(U.round2(v));
    return ticks;
  }

  function tickFormatter(top) {
    return function (v) {
      if (top < 10000 || v === 0) return U.num(v);
      if (v >= 1e6) return U.num(v / 1e6) + ' млн';
      return U.num(v / 1000) + ' тыс';
    };
  }

  function frame(el, o, ticks) {
    var W = Math.max(260, Math.floor(el.clientWidth || 600));
    var H = o.height || (W < 480 ? 180 : 210);
    var fmt = tickFormatter(ticks[ticks.length - 1]);
    var longest = ticks.reduce(function (m, t) { return Math.max(m, fmt(t).length); }, 1);
    var m = { l: longest * 6.4 + 12, r: o.right || 10, t: 12, b: 24 };
    return { W: W, H: H, m: m, pw: W - m.l - m.r, ph: H - m.t - m.b, fmt: fmt };
  }

  function open(f, label) {
    return '<svg class="chart-svg" width="' + f.W + '" height="' + f.H + '" viewBox="0 0 ' + f.W + ' ' + f.H +
      '" role="img" aria-label="' + U.esc(label) + '">';
  }

  function grid(f, ticks, Y) {
    var s = '';
    ticks.forEach(function (t, i) {
      var y = Math.round(Y(t)) + 0.5;
      s += '<line class="' + (i === 0 ? 'axis' : 'grid') + '" x1="' + f.m.l + '" x2="' + (f.W - f.m.r) + '" y1="' + y + '" y2="' + y + '"/>';
      s += '<text class="tick" x="' + (f.m.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + f.fmt(t) + '</text>';
    });
    return s;
  }

  // Столбик со скруглённым верхом (4px) и прямым низом. i — номер (для анимации и подсветки).
  function bar(x, y, w, h, cls, i) {
    if (h <= 0) return '';
    var r = Math.min(4, h, w / 2);
    return '<path class="' + cls + '" data-i="' + i + '" style="--i:' + i + '" d="M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z"/>';
  }

  // Подсветка столбика под курсором: остальные чуть бледнеют.
  function wireHover(el) {
    var svg = el.querySelector('svg');
    if (!svg) return;
    svg.addEventListener('pointerover', function (e) {
      var hit = e.target.closest('.hit');
      if (!hit || hit.dataset.i === undefined) return;
      svg.classList.add('has-hot');
      svg.querySelectorAll('.bar').forEach(function (b) { b.classList.toggle('is-hot', b.dataset.i === hit.dataset.i); });
    });
    svg.addEventListener('pointerleave', function () {
      svg.classList.remove('has-hot');
      svg.querySelectorAll('.is-hot').forEach(function (b) { b.classList.remove('is-hot'); });
    });
  }

  // ---------- Столбики: одна серия ----------
  // o: { values, tips, labels, xTicks (индексы подписей), label }
  function columns(el, o) {
    var ticks = niceTicks(Math.max.apply(null, o.values.concat([0])));
    var f = frame(el, o, ticks);
    var top = ticks[ticks.length - 1];
    var Y = function (v) { return f.m.t + f.ph - (v / top) * f.ph; };
    var n = o.values.length;
    var band = f.pw / n;
    var bw = Math.min(24, Math.max(2, band - 2));
    if (band > 8) bw = Math.min(bw, band * 0.62);

    var s = open(f, o.label) + grid(f, ticks, Y);
    o.values.forEach(function (v, i) {
      var x = f.m.l + i * band + (band - bw) / 2;
      s += bar(x, Y(v), bw, Y(0) - Y(v), 'bar', i);
    });
    (o.xTicks || []).forEach(function (i) {
      s += '<text class="tick" x="' + (f.m.l + i * band + band / 2) + '" y="' + (f.H - 6) + '" text-anchor="middle">' + U.esc(o.labels[i]) + '</text>';
    });
    o.values.forEach(function (v, i) {
      s += '<rect class="hit" data-i="' + i + '" x="' + (f.m.l + i * band) + '" y="' + f.m.t + '" width="' + band + '" height="' + f.ph + '" data-tip="' + U.esc(o.tips[i]) + '"/>';
    });
    el.innerHTML = s + '</svg>';
    wireHover(el);
  }

  // ---------- Столбики: две серии рядом ----------
  // o: { labels, series: [{ name, cls, values }], tips, label }
  function grouped(el, o) {
    var all = [0];
    o.series.forEach(function (sr) { all = all.concat(sr.values); });
    var ticks = niceTicks(Math.max.apply(null, all));
    var f = frame(el, o, ticks);
    var top = ticks[ticks.length - 1];
    var Y = function (v) { return f.m.t + f.ph - (v / top) * f.ph; };
    var n = o.labels.length;
    var k = o.series.length;
    var band = f.pw / n;
    var bw = Math.max(3, Math.min(20, (band * 0.7 - 2 * (k - 1)) / k));
    var groupW = bw * k + 2 * (k - 1);

    var s = open(f, o.label) + grid(f, ticks, Y);
    for (var i = 0; i < n; i++) {
      var x0 = f.m.l + i * band + (band - groupW) / 2;
      o.series.forEach(function (sr, j) {
        var v = sr.values[i];
        s += bar(x0 + j * (bw + 2), Y(v), bw, Y(0) - Y(v), 'bar ' + sr.cls, i);
      });
      s += '<text class="tick" x="' + (f.m.l + i * band + band / 2) + '" y="' + (f.H - 6) + '" text-anchor="middle">' + U.esc(o.labels[i]) + '</text>';
    }
    for (i = 0; i < n; i++) {
      s += '<rect class="hit" data-i="' + i + '" x="' + (f.m.l + i * band) + '" y="' + f.m.t + '" width="' + band + '" height="' + f.ph + '" data-tip="' + U.esc(o.tips[i]) + '"/>';
    }
    el.innerHTML = s + '</svg>';
    wireHover(el);
  }

  // ---------- Кольцевая диаграмма: доли целого ----------
  // o: { segments: [{ label, value, cls, tip }], center: 'текст в центре', sub: 'подпись' }
  function donut(el, o) {
    var size = 180, r = 70, sw = 22, c = 2 * Math.PI * r;
    var totalV = o.segments.reduce(function (s, x) { return s + x.value; }, 0) || 1;
    var gap = o.segments.length > 1 ? 2.5 : 0;
    var acc = 0;
    var arcs = o.segments.map(function (seg, i) {
      var len = Math.max(0, seg.value / totalV * c - gap);
      var off = -acc;
      acc += seg.value / totalV * c;
      return '<circle class="donut-seg ' + seg.cls + '" data-i="' + i + '" style="--len:' + len.toFixed(2) + ';--i:' + i + '" cx="90" cy="90" r="' + r +
        '" stroke-width="' + sw + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (c - len).toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) +
        '" data-tip="' + U.esc(seg.tip) + '"/>';
    }).join('');
    el.innerHTML =
      '<svg class="donut" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + U.esc(o.label || '') + '">' +
        '<circle class="donut-track" cx="90" cy="90" r="' + r + '" stroke-width="' + sw + '"/>' +
        '<g transform="rotate(-90 90 90)">' + arcs + '</g>' +
        '<text class="donut-center" x="90" y="88" text-anchor="middle">' + U.esc(o.center || '') + '</text>' +
        '<text class="donut-sub" x="90" y="108" text-anchor="middle">' + U.esc(o.sub || '') + '</text>' +
      '</svg>';
    var svg = el.querySelector('svg');
    svg.addEventListener('pointerover', function (e) {
      var seg = e.target.closest('.donut-seg');
      svg.classList.toggle('has-hot', !!seg);
      svg.querySelectorAll('.donut-seg').forEach(function (s) { s.classList.toggle('is-hot', s === seg); });
      var legend = el.parentNode.querySelectorAll('.donut-legend li');
      legend.forEach(function (li, i) { li.classList.toggle('is-hot', seg && String(i) === seg.dataset.i); });
    });
    svg.addEventListener('pointerleave', function () {
      svg.classList.remove('has-hot');
      el.parentNode.querySelectorAll('.is-hot').forEach(function (x) { x.classList.remove('is-hot'); });
    });
  }

  // ---------- Накопленные траты против ровного темпа ----------
  // o: { n (дней), actual: [0, x1, x2 … x_last] (накопленно на конец дня),
  //      budget, tip(day), endLabel, xTicks: [дни], label }
  function pace(el, o) {
    var last = o.actual.length - 1;
    var ticks = niceTicks(Math.max(o.budget, o.actual[last] || 0));
    var f = frame(el, Object.assign({ right: 14 }, o), ticks);
    var top = ticks[ticks.length - 1];
    var n = o.n;
    var X = function (d) { return f.m.l + (d / n) * f.pw; };
    var Y = function (v) { return f.m.t + f.ph - (v / top) * f.ph; };

    var s = open(f, o.label) + grid(f, ticks, Y);

    // Ровный темп: от 0 в начале месяца до бюджета в конце.
    s += '<line class="ref-line" x1="' + X(0) + '" y1="' + Y(0) + '" x2="' + X(n) + '" y2="' + Y(o.budget) + '"/>';

    if (last > 0) {
      var pts = o.actual.map(function (v, d) { return X(d).toFixed(1) + ',' + Y(v).toFixed(1); });
      s += '<path class="area" d="M' + pts.join('L') + 'L' + X(last).toFixed(1) + ',' + Y(0) + 'L' + X(0) + ',' + Y(0) + 'Z"/>';
      s += '<polyline class="line" points="' + pts.join(' ') + '"/>';
      var ex = X(last), ey = Y(o.actual[last]);
      s += '<circle class="end-dot" cx="' + ex + '" cy="' + ey + '" r="4"/>';
      var anchorEnd = ex > f.W - 110;
      s += '<text class="end-label" x="' + (anchorEnd ? ex - 9 : ex + 9) + '" y="' + Math.max(f.m.t + 10, ey - 8) +
        '" text-anchor="' + (anchorEnd ? 'end' : 'start') + '">' + U.esc(o.endLabel) + '</text>';
    }

    (o.xTicks || []).forEach(function (d) {
      s += '<text class="tick" x="' + X(d) + '" y="' + (f.H - 6) + '" text-anchor="middle">' + d + '</text>';
    });

    s += '<line class="crosshair" x1="0" x2="0" y1="' + f.m.t + '" y2="' + (f.m.t + f.ph) + '"/>';
    s += '<circle class="cross-dot" r="4" cx="0" cy="0"/>';
    s += '<rect class="hit overlay" x="' + f.m.l + '" y="' + f.m.t + '" width="' + f.pw + '" height="' + f.ph + '" data-tip=""/>';
    el.innerHTML = s + '</svg>';

    var svg = el.querySelector('svg');
    // Линия «рисуется» слева направо.
    var line = svg.querySelector('.line');
    if (line && line.getTotalLength) line.style.setProperty('--len', Math.ceil(line.getTotalLength()));
    var ov = svg.querySelector('.overlay');
    var ch = svg.querySelector('.crosshair');
    var cd = svg.querySelector('.cross-dot');

    function move(e) {
      var r = svg.getBoundingClientRect();
      var d = Math.round(((e.clientX - r.left) - f.m.l) / f.pw * n);
      d = Math.max(1, Math.min(n, d));
      var x = X(d);
      ch.setAttribute('x1', x);
      ch.setAttribute('x2', x);
      ch.style.visibility = 'visible';
      if (d <= last) {
        cd.setAttribute('cx', x);
        cd.setAttribute('cy', Y(o.actual[d]));
        cd.style.visibility = 'visible';
      } else {
        cd.style.visibility = 'hidden';
      }
      ov.dataset.tip = o.tip(d);
    }
    function leave() {
      ch.style.visibility = 'hidden';
      cd.style.visibility = 'hidden';
    }
    ov.addEventListener('pointermove', move);
    ov.addEventListener('pointerdown', move);
    ov.addEventListener('pointerleave', leave);
  }

  window.Charts = { columns: columns, grouped: grouped, pace: pace, donut: donut };
})();
