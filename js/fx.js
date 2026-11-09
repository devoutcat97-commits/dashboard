/* ============================================================
   Анимации и «живость»:
   - появление карточек по очереди при открытии вкладки;
   - цифры «набегают», полоски плавно растут;
   - конфетти за важные моменты, искорки при отметке галочки;
   - лёгкая вибрация на телефоне;
   - свайпы на телефоне (задачи, переключение месяцев и недель).
   Всё отключается, если в системе включено «Уменьшить движение».
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  function calm() { return reduced.matches; }

  // ---------- Появление вкладки ----------
  function enter(root) {
    if (calm() || !root) return;
    var wrap = root.firstElementChild;
    if (!wrap) return;
    var blocks = Array.prototype.slice.call(wrap.children);
    blocks.forEach(function (el, i) {
      el.classList.remove('fx-in');
      el.style.setProperty('--fx-i', Math.min(i, 10));
      void el.offsetWidth; // перезапуск анимации
      el.classList.add('fx-in');
    });
    countUp(root);
    growBars(root);
  }

  // ---------- Цифры набегают ----------
  // Берём число из текста («18 475,50 ₽», «15 ч», «4,50», «65%») и анимируем от 0.
  function countUp(root) {
    var els = root.querySelectorAll('.hero-value, .tile-value, .hero-stat-value, .goal-saved');
    els.forEach(function (el) {
      var text = el.textContent;
      var m = text.match(/^([^\d−-]*)([−-]?)([\d   ]+)(?:,(\d+))?(.*)$/);
      if (!m) return;
      var target = parseFloat(m[3].replace(/[\s  ]/g, '') + (m[4] ? '.' + m[4] : ''));
      if (!(target > 0) || target > 1e9) return;
      var decimals = m[4] ? m[4].length : 0;
      var nf = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      var start = performance.now(), dur = 700;
      function frame(now) {
        var t = Math.min(1, (now - start) / dur);
        var e = 1 - Math.pow(1 - t, 3);
        el.textContent = m[1] + m[2] + nf.format(target * e) + m[5];
        if (t < 1) requestAnimationFrame(frame);
        else el.textContent = text;
      }
      requestAnimationFrame(frame);
    });
  }

  // ---------- Полоски растут ----------
  function growBars(root) {
    var bars = root.querySelectorAll('.meter > span, .cat-bar > span');
    bars.forEach(function (b) {
      var w = b.style.width;
      if (!w) return;
      b.style.transition = 'none';
      b.style.width = '0%';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          b.style.transition = '';
          b.style.width = w;
        });
      });
    });
  }

  // ---------- Вибрация ----------
  function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) {} }

  // ---------- Звуки ----------
  // Синтезируются прямо в браузере (без файлов): тихий щелчок и короткая «фанфара».
  var audio = null;
  function soundOn() { try { return localStorage.getItem('dash:sound') !== '0'; } catch (e) { return true; } }
  function setSound(on) { try { localStorage.setItem('dash:sound', on ? '1' : '0'); } catch (e) {} }
  function tone(freq, start, dur, vol, type) {
    if (!audio) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio = new Ctx();
    }
    if (audio.state === 'suspended') audio.resume();
    var t0 = audio.currentTime + start;
    var o = audio.createOscillator(), g = audio.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(audio.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function click() { if (soundOn()) { tone(1200, 0, 0.07, 0.05); tone(1800, 0.03, 0.06, 0.03); } }
  function fanfare() {
    if (!soundOn()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, i * 0.09, 0.32, 0.06, 'triangle'); });
    tone(1318.5, 0.38, 0.5, 0.045, 'triangle');
  }

  // ---------- Конфетти ----------
  var canvas = null, ctx = null, parts = [], running = false;
  function colors() {
    var cs = getComputedStyle(document.documentElement);
    return [cs.getPropertyValue('--accent').trim() || '#2f6f62', '#f5b041', '#e66767', '#6ea8fe', '#a99bf5', '#5fd0a8'];
  }
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'fx-canvas';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    var resize = function () {
      var dpr = window.devicePixelRatio || 1;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
  }
  function loop() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(function (p) { return p.life > 0; });
    parts.forEach(function (p) {
      p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 30));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    });
    if (parts.length) requestAnimationFrame(loop);
    else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function burst(x, y, n, spread, opts) {
    if (calm()) return;
    ensureCanvas();
    var cols = colors();
    for (var i = 0; i < n; i++) {
      var a = (opts && opts.up ? -Math.PI / 2 : 0) + (Math.random() - 0.5) * spread;
      var v = (opts && opts.speed || 6) * (0.5 + Math.random());
      parts.push({
        x: x, y: y, vx: Math.cos(a) * v * (opts && opts.up ? 1 : 1), vy: Math.sin(a) * v - (opts && opts.up ? 0 : 0),
        g: opts && opts.g || 0.18, s: opts && opts.size || (6 + Math.random() * 6), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        c: cols[i % cols.length], life: opts && opts.life || (70 + Math.random() * 40), round: Math.random() < 0.3
      });
    }
    if (!running) { running = true; requestAnimationFrame(loop); }
  }
  // Большое конфетти — за важные моменты.
  function confetti() {
    haptic([15, 40, 15]);
    fanfare();
    burst(innerWidth * 0.2, innerHeight * 0.7, 70, 1.4, { up: true, speed: 13, life: 120 });
    burst(innerWidth * 0.8, innerHeight * 0.7, 70, 1.4, { up: true, speed: 13, life: 120 });
  }
  // Искорки у галочки.
  function sparkle(el) {
    haptic(10);
    click();
    if (!el || calm()) return;
    var r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 14, Math.PI * 2, { speed: 3.2, size: 5, g: 0.06, life: 40 });
  }

  // Искорки при любой отметке галочки «готово».
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.type === 'checkbox' && t.checked && /done|ag-done/.test(t.dataset.role || '')) sparkle(t);
  }, true);

  // ---------- Свайпы на телефоне ----------
  // Элемент с data-swipe="id": вправо — «готово», влево — «удалить».
  // Обработчик решает вкладка: событие 'fx:swipe' с detail { dir, el }.
  // Свайп по свободному месту листает месяц/неделю (жмёт кнопку ‹ или ›).
  var sx = 0, sy = 0, st = 0, item = null, moving = false, locked = null;
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    var t = e.touches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now(); moving = false; locked = null;
    item = e.target.closest('[data-swipe]');
    if (e.target.closest('input, textarea, select, .segmented, .chart, dialog, .table-scroll')) { item = null; locked = 'skip'; }
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (locked === 'skip') return;
    var t = e.touches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (!locked) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) locked = 'x';
      else if (Math.abs(dy) > 12) locked = 'y';
    }
    if (locked === 'x' && item) {
      moving = true;
      var body = item.querySelector('.swipe-body') || item;
      body.classList.add('is-swiping');
      body.style.transform = 'translateX(' + Math.max(-140, Math.min(140, dx)) + 'px)';
      item.dataset.swipeDir = dx > 0 ? 'right' : 'left';
    }
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    var t = e.changedTouches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (item && moving) {
      var el = item;
      var body = el.querySelector('.swipe-body') || el;
      body.classList.remove('is-swiping');
      if (Math.abs(dx) > 90) {
        body.style.transform = 'translateX(' + (dx > 0 ? '110%' : '-110%') + ')';
        haptic(15);
        setTimeout(function () {
          el.dispatchEvent(new CustomEvent('fx:swipe', { bubbles: true, detail: { dir: dx > 0 ? 'right' : 'left', id: el.dataset.swipe } }));
        }, 160);
      } else {
        body.style.transform = '';
        delete el.dataset.swipeDir;
      }
    } else if (locked === 'x' && !item && Math.abs(dx) > 80 && Math.abs(dy) < 50 && Date.now() - st < 600) {
      // Свайп по шапке вкладки (заголовок, переключатель месяца) листает месяц/неделю,
      // по остальному экрану — переключает вкладки.
      if (startedOnHead) {
        var btn = document.querySelector('.view [data-step="' + (dx < 0 ? 1 : -1) + '"]:not([disabled])');
        if (btn) { btn.click(); haptic(8); }
      } else if (window.App && App.step) {
        App.step(dx < 0 ? 1 : -1);
        haptic(8);
      }
    }
    item = null; moving = false; locked = null;
  }, { passive: true });

  var startedOnHead = false;
  document.addEventListener('touchstart', function (e) {
    startedOnHead = !!(e.target.closest && e.target.closest('.toolbar, .page-head, .section-row, .month-switch, .cal-head'));
  }, { passive: true, capture: true });

  // ---------- Переход между вкладками ----------
  // dir: 1 — вкладка правее (въезжает справа), -1 — левее.
  function slide(root, dir) {
    if (calm() || !root) return;
    root.classList.remove('fx-slide-l', 'fx-slide-r');
    void root.offsetWidth;
    root.classList.add(dir > 0 ? 'fx-slide-r' : 'fx-slide-l');
  }

  // ---------- Ползунок активной вкладки в меню ----------
  function moveIndicator(nav) {
    if (!nav) return;
    var active = nav.querySelector('[aria-current="page"]');
    var ind = nav.querySelector('.nav-ind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'nav-ind'; nav.appendChild(ind); }
    if (!active) { ind.style.opacity = 0; return; }
    ind.style.opacity = 1;
    ind.style.transform = 'translate(' + active.offsetLeft + 'px,' + active.offsetTop + 'px)';
    ind.style.width = active.offsetWidth + 'px';
    ind.style.height = active.offsetHeight + 'px';
  }

  window.FX = {
    enter: enter, confetti: confetti, sparkle: sparkle, haptic: haptic, countUp: countUp,
    click: click, fanfare: fanfare, soundOn: soundOn, setSound: setSound, slide: slide, moveIndicator: moveIndicator
  };
})();
