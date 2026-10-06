import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * 04 The code: the Time Keeper's stopwatch (drawn as the app's StopwatchFace), the judges' panel
 * and the score slip. Returns a destroy() that stops the watch's loops and removes the window and
 * document listeners; GSAP itself is reverted by the page runner.
 *
 * @param {HTMLElement} page the .mk-home root
 * @param {{ mods: object[], util: object }} MK the page's module registry
 * @returns {() => void}
 */
export default function registerCode(page, MK) {
  var root = page.querySelector('#code');
  if (!root) return function destroy() {};
  var cleanups = [];
  function listen(target, type, fn, opts) { target.addEventListener(type, fn, opts); cleanups.push(function () { target.removeEventListener(type, fn, opts); }); }

  /* ============================================================
     THE FACE — StopwatchFace.jsx, number for number:
     320 viewBox, 240 quarter-second ticks (major every 5 s),
     numerals 5…60, a 120 s sub-dial at cy 102 r 40 with its
     amber / green / red arcs, ticks and 0·30·60·90 labels.
     Drawn once at parse time (no GSAP needed).
     ============================================================ */
  var C = 160, SUB = { cx: 160, cy: 102, r: 40 }, SUB_SPAN = 120;
  var MARKS = [{ at: 60, count: 1 }, { at: 90, count: 2 }]; // timeKeeper.js BEEP_MARKS
  var REST = 74, DEMO_MAX = 100;

  function polar(cx, cy, r, deg) { var a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function n2(v) { return Math.round(v * 100) / 100; }
  function arc(cx, cy, r, a, b) {
    var p = polar(cx, cy, r, a), q = polar(cx, cy, r, b);
    return 'M ' + n2(p[0]) + ' ' + n2(p[1]) + ' A ' + r + ' ' + r + ' 0 ' + (b - a > 180 ? 1 : 0) + ' 1 ' + n2(q[0]) + ' ' + n2(q[1]);
  }
  function seg(p, q, stroke, w, cap) {
    return '<line x1="' + n2(p[0]) + '" y1="' + n2(p[1]) + '" x2="' + n2(q[0]) + '" y2="' + n2(q[1]) + '" stroke="' + stroke + '" stroke-width="' + w + '"' + (cap ? ' stroke-linecap="round"' : '') + '/>';
  }
  (function drawFace() {
    var g = root.querySelector('.cd-sw__face');
    if (!g) return;
    var s = '<circle cx="160" cy="160" r="158" fill="url(#cd-sw-face)"/><circle cx="160" cy="160" r="158" fill="none" stroke="#1C1C1E" stroke-width="2"/>';
    var i, major, second, len, deg, l;
    for (i = 0; i < 240; i++) {
      deg = i * 1.5; major = i % 20 === 0; second = i % 4 === 0; len = major ? 15 : second ? 10 : 6;
      s += seg(polar(C, C, 150, deg), polar(C, C, 150 - len, deg), major ? '#FFFFFF' : second ? '#BDBDBD' : '#5A5A5A', major ? 2.2 : second ? 1.3 : 0.8, true);
    }
    for (i = 5; i <= 60; i += 5) {
      l = polar(C, C, 119, i * 6);
      s += '<text class="cd-sw__num" x="' + n2(l[0]) + '" y="' + n2(l[1]) + '" text-anchor="middle" dominant-baseline="central">' + i + '</text>';
    }
    var sd = function (sec) { return sec / SUB_SPAN * 360; };
    s += '<circle cx="' + SUB.cx + '" cy="' + SUB.cy + '" r="' + SUB.r + '" fill="#0B0B0C" stroke="#2C2C2E" stroke-width="1"/>';
    s += '<path d="' + arc(SUB.cx, SUB.cy, SUB.r - 3, 1, sd(60)) + '" stroke="#FFD60A" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.55"/>';
    s += '<path d="' + arc(SUB.cx, SUB.cy, SUB.r - 3, sd(60), sd(90)) + '" stroke="#30D158" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.95"/>';
    s += '<path d="' + arc(SUB.cx, SUB.cy, SUB.r - 3, sd(90), 359) + '" stroke="#FF453A" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.9"/>';
    for (i = 0; i < 24; i++) {
      major = i % 6 === 0;
      s += seg(polar(SUB.cx, SUB.cy, SUB.r - 7, i * 15), polar(SUB.cx, SUB.cy, SUB.r - (major ? 12 : 9), i * 15), major ? '#E5E5E7' : '#6C6C70', major ? 1.2 : 0.7, false);
    }
    [['0', 0], ['30', 90], ['60', 180], ['90', 270]].forEach(function (lab) {
      l = polar(SUB.cx, SUB.cy, SUB.r - 21, lab[1]);
      s += '<text class="cd-sw__sublab" x="' + n2(l[0]) + '" y="' + n2(l[1]) + '" text-anchor="middle" dominant-baseline="central">' + lab[0] + '</text>';
    });
    g.innerHTML = s;
  })();

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var anim = !reduceMQ.matches;               // refined by motion(c)
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  /* ============================================================
     THE WATCH — timeKeeper.js useStopwatch semantics:
     idle → running ⇄ paused → stopped → (reset) idle.
     Elapsed time comes from the clock, the readout is whole
     seconds rounded down, the hands are turned from rAF.
     While idle the demo (scroll or slider) owns the hand; Start
     hands it to the real clock; Reset / Next hands it back.
     ============================================================ */
  var Watch = (function () {
    var clockEl = root.querySelector('.cd-clock');
    var island = root.querySelector('.cd-sw');
    var svg = root.querySelector('.cd-sw__svg');
    var hand = root.querySelector('.cd-sw__hand'), subHand = root.querySelector('.cd-sw__subhand');
    var read = root.querySelector('.cd-sw__read');
    var foot = root.querySelector('.cd-sw__foot');
    var live = root.querySelector('.cd-sw__live');
    var btnL = root.querySelector('.cd-rb--l'), btnR = root.querySelector('.cd-rb--r');
    var range = root.querySelector('#cd-range'), rangeOut = root.querySelector('.cd-range__out');
    var hint = root.querySelector('.cd-hint');
    var rows = [].slice.call(root.querySelectorAll('.cd-mark'));
    var pulses = { 60: root.querySelector('.cd-pulse--60'), 90: root.querySelector('.cd-pulse--90') };

    var status = 'idle', banked = 0, runStart = null;
    var shown = REST;                // whole seconds on the readout
    var ang = { m: 84, s: 222 };     // current hand angles
    var demo = { t: REST };          // where the demo puts the hand
    var mode = 'slider';
    var raf = 0, homeRaf = 0, tick = 0, blend = null, visible = true;
    var quick = null, introTw = null;

    function elapsedMs() { return banked + (runStart === null ? 0 : Date.now() - runStart); }
    function whole(ms) { return Math.max(0, Math.floor(ms / 1000)); }

    function setAngles(m, s) {
      ang.m = m; ang.s = s;
      hand.setAttribute('transform', 'rotate(' + m.toFixed(2) + ' 160 160)');
      subHand.setAttribute('transform', 'rotate(' + s.toFixed(2) + ' 160 102)');
    }
    function anglesFor(sec) { return [(sec % 60) * 6, (sec % SUB_SPAN) * (360 / SUB_SPAN)]; }
    function paintHands(sec) { var a = anglesFor(sec); setAngles(a[0], a[1]); }

    function footText(s) {
      if (status === 'stopped') {
        if (s < 60) return [s + ' s · ' + (60 - s) + ' s short', '#FF453A'];
        if (s > 90) return [s + ' s · ' + (s - 90) + ' s over', '#FF453A'];
        return [s + ' s · in the window', '#30D158'];
      }
      if (s < 60) return ['Short whistle at 60', ''];
      if (s < 90) return ['Long whistle at 90', ''];
      return [s > 90 ? 'Past 90 · over time' : 'Long whistle · time', ''];
    }
    function whistle(m) {
      var row = rows[m.count];
      if (status === 'running') say(m.at + ' seconds: ' + (m.count === 1 ? 'short whistle.' : 'long whistle.'));
      if (!anim) return;
      var big = m.count > 1, ring = pulses[m.at];
      gsap.fromTo(ring, { attr: { r: 3 }, opacity: 1 }, { attr: { r: big ? 30 : 17 }, opacity: 0, duration: big ? 1.4 : 0.6, ease: 'power2.out', overwrite: true });
      gsap.fromTo(row, { backgroundColor: 'rgba(255,107,0,0.2)' }, { backgroundColor: 'rgba(255,107,0,0)', duration: big ? 1.4 : 0.6, ease: 'power2.out', overwrite: true, clearProps: 'backgroundColor' });
    }
    /* Readout, legend rows, footer: once per whole second (or on a state change). */
    function paintState(s, force) {
      if (s === shown && !force) return;
      var prev = shown;
      shown = s;
      read.textContent = s;
      var stopped = status === 'stopped';
      read.setAttribute('fill', (s > 90 || (stopped && s > 0 && s < 60)) ? '#FF453A' : '#FFFFFF');
      svg.setAttribute('aria-label', 'Stopwatch at ' + s + (s === 1 ? ' second' : ' seconds'));
      var passed = s >= 90 ? 2 : s >= 60 ? 1 : 0;
      rows.forEach(function (li, i) { li.classList.toggle('is-on', i <= passed); li.classList.toggle('is-now', i === passed); });
      clockEl.setAttribute('data-zone', ['early', 'window', 'time'][passed]);
      var ft = footText(s);
      foot.textContent = ft[0]; foot.style.color = ft[1];
      MARKS.forEach(function (m) { if (prev < m.at && s >= m.at) whistle(m); });
    }

    /* ---- the demo: scroll (pinned) or the slider owns the hand while idle ---- */
    function demoPaint() {
      if (status !== 'idle' || homeRaf) return;
      paintHands(demo.t);
      paintState(Math.floor(demo.t));
    }
    function syncRange(t) {
      var v = Math.floor(t + 1e-6);
      range.value = v;
      range.style.setProperty('--pct', (v / 120 * 100).toFixed(2) + '%');
      range.setAttribute('aria-valuetext', v + ' seconds');
      rangeOut.innerHTML = v + '<small>s</small>';
    }
    function killIntro() { if (introTw) { introTw.kill(); introTw = null; } }
    function toDemo(t) {
      if (status !== 'idle') return;
      killIntro();
      if (quick) quick(t, t);
      demo.t = t;
      demoPaint();
      syncRange(t);
    }
    function scrollTo(t) {
      if (status !== 'idle' || homeRaf) return;
      if (anim && quick) quick(t); else { demo.t = t; demoPaint(); }
    }
    function intro() {
      if (status !== 'idle') return;
      killIntro();
      demo.t = 0; demoPaint();
      introTw = gsap.to(demo, { t: 90, duration: 4.5, ease: 'none', onUpdate: function () { demoPaint(); syncRange(demo.t); }, onComplete: function () { introTw = null; } });
    }
    function setMode(m) {
      mode = m;
      clockEl.classList.toggle('is-pinned', m === 'scroll');
      setHint();
    }
    function setHint() {
      if (status !== 'idle') hint.textContent = mode === 'scroll' ? 'The watch is on its own clock now. Reset hands it back to your scroll.' : 'Reset the watch to move it by hand again.';
      else hint.textContent = mode === 'scroll' ? 'Keep scrolling to run the watch, or press Start and time a routine yourself.' : 'Press Start to time a routine yourself, or move the watch by hand.';
    }

    /* ---- the real clock ---- */
    function frame() {
      raf = 0;
      if (status !== 'running') return;
      var a = anglesFor(elapsedMs() / 1000);
      if (blend) {
        var k = ease(Math.min(1, (performance.now() - blend.t0) / 260));
        a[0] = blend.m + (a[0] - blend.m) * k; a[1] = blend.s + (a[1] - blend.s) * k;
        if (k >= 1) blend = null;
      }
      setAngles(a[0], a[1]);
      if (visible) raf = requestAnimationFrame(frame);
    }
    function onTick() {
      var s = whole(elapsedMs());
      if (!anim) paintHands(s);            // reduced motion: the hand jumps a second at a time
      paintState(s);
    }
    function startLoops() {
      clearInterval(tick); tick = setInterval(onTick, 100);
      if (anim && visible && !raf) raf = requestAnimationFrame(frame);
    }
    function stopLoops() { clearInterval(tick); tick = 0; if (raf) cancelAnimationFrame(raf); raf = 0; blend = null; }
    function springHome() {
      if (homeRaf) cancelAnimationFrame(homeRaf);
      if (!anim) { homeRaf = 0; setAngles(0, 0); return; }
      var fm = ang.m, fs = ang.s, t0 = performance.now();
      homeRaf = requestAnimationFrame(function step(now) {
        var t = Math.min(1, (now - t0) / 260), k = 1 - ease(t);
        setAngles(fm * k, fs * k);
        if (t < 1) homeRaf = requestAnimationFrame(step); else { homeRaf = 0; setAngles(0, 0); }
      });
    }
    function say(msg) { live.textContent = msg; }
    function setBtn(b, label, tone, disabled) { b.textContent = label; b.setAttribute('data-tone', tone); b.disabled = !!disabled; }
    function buttons() {
      var run = status === 'running', pau = status === 'paused', stp = status === 'stopped';
      if (run || pau) setBtn(btnL, 'Stop', 'red'); else setBtn(btnL, 'Reset', 'gray', !stp);
      if (run) setBtn(btnR, 'Pause', 'amber');
      else if (pau) setBtn(btnR, 'Resume', 'green');
      else if (stp) setBtn(btnR, 'Next', 'green');
      else setBtn(btnR, 'Start', 'green');
      range.disabled = status !== 'idle';
      setHint();
    }

    function start() {
      killIntro();
      var from = { m: ang.m, s: ang.s };
      if (homeRaf) { cancelAnimationFrame(homeRaf); homeRaf = 0; }
      banked = 0; runStart = Date.now(); status = 'running';
      shown = 0; paintState(0, true);
      if (anim && (from.m || from.s)) blend = { m: from.m, s: from.s, t0: performance.now() };
      else { blend = null; paintHands(0); }
      buttons(); startLoops();
      say('Started.');
    }
    function pause() {
      if (runStart === null) return;
      banked += Date.now() - runStart; runStart = null; status = 'paused';
      stopLoops();
      paintHands(anim ? banked / 1000 : whole(banked));
      paintState(whole(banked), true);
      buttons();
      say('Paused at ' + shown + (shown === 1 ? ' second.' : ' seconds.'));
    }
    function resume() {
      if (runStart !== null) return;
      runStart = Date.now(); status = 'running';
      buttons(); startLoops();
      say('Running.');
    }
    function stop() {
      if (runStart !== null) { banked += Date.now() - runStart; runStart = null; }
      status = 'stopped';
      stopLoops();
      var s = whole(banked);
      paintHands(anim ? banked / 1000 : s);
      paintState(s, true);
      buttons();
      say('Stopped at ' + s + (s === 1 ? ' second: ' : ' seconds: ') + (s < 60 ? (60 - s) + ' short of 60.' : s > 90 ? (s - 90) + ' over 90.' : 'inside the window.'));
      return s;
    }
    function reset() {
      stopLoops();
      banked = 0; runStart = null; status = 'idle';
      springHome();
      demo.t = 0;
      if (quick) quick(0, 0);
      shown = 0; paintState(0, true);
      syncRange(0);
      buttons();
      say('Reset to 0.');
    }

    function wire() {
      quick = gsap.quickTo(demo, 't', { duration: 0.35, ease: 'power3', onUpdate: demoPaint });
      btnL.addEventListener('click', function () {
        if (status === 'running' || status === 'paused') stop();
        else if (status === 'stopped') { reset(); btnR.focus(); }
      });
      btnR.addEventListener('click', function () {
        if (status === 'running') pause();
        else if (status === 'paused') resume();
        else if (status === 'stopped') reset();
        else start();
      });
      range.addEventListener('input', function () {
        if (status !== 'idle') return;
        killIntro();
        demo.t = +range.value;
        if (homeRaf) { cancelAnimationFrame(homeRaf); homeRaf = 0; }
        demoPaint(); syncRange(demo.t);
      });
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) {
          visible = es[0].isIntersecting;
          if (visible && status === 'running' && anim && !raf) raf = requestAnimationFrame(frame);
        });
        io.observe(island);
        cleanups.push(function () { io.disconnect(); });
      }
      listen(document, 'visibilitychange', function () { if (!document.hidden && status === 'running') onTick(); });
      buttons();
    }

    return {
      wire: wire, toDemo: toDemo, scrollTo: scrollTo, intro: intro, killIntro: killIntro, setMode: setMode,
      destroy: function () { stopLoops(); if (homeRaf) cancelAnimationFrame(homeRaf); homeRaf = 0; killIntro(); },
      el: clockEl, island: island,
      setAnim: function (on) { anim = on; if (status === 'running') { if (on) startLoops(); else { if (raf) cancelAnimationFrame(raf); raf = 0; blend = null; onTick(); paintHands(shown); } } }
    };
  })();

  /* ============================================================
     THE PANEL — 3, 4 or 5 judges: the Chief plus 2, 3 or 4
     evaluation judges; the Scorer and Time Keeper always sit.
     ============================================================ */
  function wirePanel() {
    var chips = [].slice.call(root.querySelectorAll('.cd-seat[data-n]'));
    var note = root.querySelector('.cd-note');
    var words = { 3: 'two', 4: 'three', 5: 'four' };
    function setPanel(n) {
      var k = 0;
      chips.forEach(function (el) {
        var on = +el.getAttribute('data-n') <= n - 1;
        gsap.killTweensOf(el);
        if (!anim) { el.hidden = !on; el.style.clipPath = ''; return; }
        if (on && el.hidden) {
          el.hidden = false;
          gsap.fromTo(el, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.42, ease: 'cut', delay: 0.07 * k++, clearProps: 'clipPath' });
        } else if (!on && !el.hidden) {
          gsap.to(el, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.3, ease: 'cut', onComplete: function () { el.hidden = true; el.style.clipPath = ''; } });
        } else if (on) { el.style.clipPath = ''; }
      });
      note.textContent = 'Panel of ' + n + ': the Chief Judge and ' + words[n] + ' evaluation judges.';
    }
    root.querySelectorAll('input[name="cd-panel"]').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) setPanel(+r.value); });
    });
  }

  /* ============================================================
     THE SLIP — four real range inputs, −/+ steps, falls, a total
     that rolls, and a saffron "Full marks" stinger at 10.00.
     ============================================================ */
  function wireSlip() {
    var slip = root.querySelector('.cd-slip');
    var rows = [].slice.call(slip.querySelectorAll('.cd-row'));
    var totalEl = slip.querySelector('.cd-total__n');
    var bars = {}; [].slice.call(slip.querySelectorAll('.cd-total__bar i')).forEach(function (i) { bars[i.getAttribute('data-k')] = i; });
    var flash = slip.querySelector('.cd-flash');
    var liveEl = slip.querySelector('.cd-slip__live');
    var fallsEl = slip.querySelector('.cd-falls');
    var exec = slip.querySelector('#cd-e');
    var falls = 0, shownTotal = { v: 8.6 }, wasFull = false, liveId, flashTl;
    function fmt(v) { return (Math.round(v * 100) / 100).toFixed(2); }
    function val(input) { return Math.round(parseFloat(input.value) * 10) / 10; }
    function syncRow(row) {
      var input = row.querySelector('input'), v = val(input), max = parseFloat(input.max);
      row.querySelector('.cd-rule').style.setProperty('--pct', (v / max * 100).toFixed(2) + '%');
      input.setAttribute('aria-valuetext', fmt(v) + ' of ' + fmt(max));
      row.querySelector('.cd-val b').textContent = fmt(v);
      bars[row.getAttribute('data-k')].style.width = (v * 10) + '%';
      return v;
    }
    function update() {
      var t = Math.round(rows.reduce(function (s, r) { return s + syncRow(r); }, 0) * 100) / 100;
      var full = t >= 10;
      if (anim) {
        gsap.to(shownTotal, { v: t, duration: 0.45, ease: 'power2.out', overwrite: true, onUpdate: function () { totalEl.textContent = fmt(shownTotal.v); } });
      } else { shownTotal.v = t; totalEl.textContent = fmt(t); }
      slip.classList.toggle('is-full', full);
      if (full && !wasFull && anim) {
        if (flashTl) flashTl.kill();
        flashTl = gsap.timeline()
          .set(flash, { visibility: 'visible', clipPath: 'inset(0% 100% 0% 0%)' })
          .to(flash, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.38, ease: 'cut' })
          .from(flash.children, { yPercent: 60, opacity: 0, duration: 0.3, stagger: 0.06, ease: 'power3.out' }, '-=0.12')
          .to(flash, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.5, ease: 'cut' }, '+=0.75')
          .set(flash, { visibility: 'hidden', clearProps: 'clipPath' });
      }
      if (!full && flashTl) { flashTl.kill(); flashTl = null; gsap.set(flash, { visibility: 'hidden', clearProps: 'clipPath' }); }
      wasFull = full;
      clearTimeout(liveId);
      liveId = setTimeout(function () { liveEl.textContent = 'Total ' + fmt(t) + ' of 10.00' + (full ? '. Full marks.' : '.'); }, 400);
    }
    rows.forEach(function (row) {
      var input = row.querySelector('input');
      input.addEventListener('input', update);
      input.addEventListener('pointerdown', function () { row.classList.add('is-active'); });
      row.querySelectorAll('.cd-step').forEach(function (b) {
        b.addEventListener('click', function () {
          var v = val(input) + 0.1 * +b.getAttribute('data-dir');
          input.value = Math.min(parseFloat(input.max), Math.max(0, Math.round(v * 10) / 10)).toString();
          update();
        });
      });
    });
    listen(window, 'pointerup', function () { rows.forEach(function (r) { r.classList.remove('is-active'); }); });
    listen(window, 'pointercancel', function () { rows.forEach(function (r) { r.classList.remove('is-active'); }); });
    function setFalls(n) {
      falls = n;
      fallsEl.textContent = n === 0 ? 'No falls recorded' : n + (n === 1 ? ' fall' : ' falls') + ' · −' + fmt(n * 0.5) + ' from Execution';
    }
    slip.querySelector('.cd-fall').addEventListener('click', function () {
      exec.value = Math.max(0, Math.round((val(exec) - 0.5) * 10) / 10).toString();
      setFalls(falls + 1); update();
    });
    slip.querySelector('.cd-clear').addEventListener('click', function () {
      rows.forEach(function (r) { r.querySelector('input').value = '0'; });
      setFalls(0); update();
    });
    rows.forEach(syncRow);
    cleanups.push(function () { clearTimeout(liveId); if (flashTl) flashTl.kill(); });
  }

  MK.mods.push({
    id: 'code',
    order: 40,
    init: function () {
      cleanups.push(Watch.destroy);
      Watch.wire();
      wirePanel();
      wireSlip();
    },
    motion: function (c) {
      Watch.setAnim(!!c.motion);
      if (c.motion && c.big) {
        // Wide screens: the clock block pins and the scroll sweeps the hand 0 → 100 s.
        Watch.setMode('scroll');
        Watch.toDemo(0);
        ScrollTrigger.create({
          trigger: Watch.el, pin: true, start: 'top top', end: '+=200%', anticipatePin: 1,
          onUpdate: function (self) { Watch.scrollTo(DEMO_MAX * Math.min(1, self.progress / 0.86)); },
          onRefresh: function (self) { Watch.scrollTo(DEMO_MAX * Math.min(1, self.progress / 0.86)); }
        });
        return function () { Watch.setMode('slider'); Watch.toDemo(REST); };
      }
      Watch.setMode('slider');
      if (c.motion) {
        // Smaller screens: one sweep through both whistles, then the slider takes over.
        Watch.toDemo(0);
        ScrollTrigger.create({ trigger: Watch.island, start: 'top 70%', once: true, onEnter: Watch.intro });
        return function () { Watch.killIntro(); Watch.toDemo(REST); };
      }
      Watch.toDemo(REST); // reduced motion: a still watch at 74 s, inside the window
    }
  });

  return function destroy() { cleanups.splice(0).forEach(function (f) { f(); }); };
}
