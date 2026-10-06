import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * 03 The apparatus: one WebGL stage (three.js, loaded on demand) driven by the scroll.
 * Desktop: a pinned frame whose single scrubbed timeline swaps text, photo and object together and
 * snaps to each apparatus. Phones/tablets: a sticky band (or, sideways, the left half) with the text
 * scrolling beside it. No WebGL or reduced motion: the static photo + spec-sheet layout.
 *
 * Returns destroy(): stops the render loop, frees the GPU context and removes listeners.
 *
 * @param {HTMLElement} page the .mk-home root
 * @param {{ mods: object[], util: object }} MK the page's module registry
 * @returns {() => void}
 */
export default function registerApparatus(page, MK) {
  var D = document, H = page; // the layout classes (ap3-gl / ap3-3d) live on the page root
  var sec = page.querySelector('#apparatus');
  if (!sec) return function destroy() {};
  var cleanups = [], destroyed = false;
  function listen(target, type, fn, opts) { target.addEventListener(type, fn, opts); cleanups.push(function () { target.removeEventListener(type, fn, opts); }); }

  // Can this device run the 3D stage at all? (ap3-gl = WebGL exists, ap3-3d = WebGL and motion allowed.)
  (function detectGL() {
    try {
      if (!window.WebGLRenderingContext) return;
      var c = D.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl');
      if (!g) return;
      H.classList.add('ap3-gl');
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) H.classList.add('ap3-3d');
      var x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
    } catch { /* no WebGL: the static photo + spec layout stays */ }
  })();

  var band = sec.querySelector('.ap3-band');
  var viewer = sec.querySelector('.ap3-viewer');
  var panels = [].slice.call(sec.querySelectorAll('.ap3-panel'));
  var ticks = [].slice.call(sec.querySelectorAll('.ap3-ticks i'));
  var wideQ = matchMedia('(min-width: 1024px) and (min-height: 560px)'); // = the shell's `big`: the pinned frame
  var sideQ = matchMedia('(orientation: landscape) and (max-height: 559px)'); // object left, text right
  var canGL = H.classList.contains('ap3-gl');
  var failed = false;

  var S = { rise: 0, cam: 0, cPole: 0, morph: 0, beam: 0, chain: 0, swing: 0, cHang: 0, dissolve: 0, ropeBar: 0, rope: 0, cRope: 0 };
  var tl = null;
  var V = { yaw: -0.35, vel: 0, drag: false, lastX: 0, touched: -1e9, px: 0, py: 0 };
  var stage = null, building = false, allow = false, inView = false, running = false;
  var now = function () { return performance.now(); };

  /* ---------- the score: stage k is fully set at time k (0 intro · 1 pole · 2 hanging · 3 rope) ---------- */
  function buildTimeline() {
    tl = gsap.timeline({ paused: true, defaults: { ease: 'none' }, onUpdate: hud });
    tl.to(S, { rise: 1, ease: 'power2.out', duration: 0.42 }, 0.47)
      .to(S, { cam: 1, ease: 'power1.inOut', duration: 0.5 }, 0.45)
      .to(S, { cPole: 1, duration: 0.08 }, 0.88)
      .to(S, { cPole: 0, duration: 0.1 }, 1.36)
      .to(S, { morph: 1, ease: 'power2.inOut', duration: 0.42 }, 1.45)
      .to(S, { beam: 1, ease: 'power2.out', duration: 0.34 }, 1.45)
      .to(S, { chain: 1, duration: 0.28 }, 1.6)
      .to(S, { swing: 1, ease: 'power1.in', duration: 0.3 }, 1.72)
      .to(S, { cam: 2, ease: 'power1.inOut', duration: 0.55 }, 1.4)
      .to(S, { cHang: 1, duration: 0.12 }, 1.84)
      .to(S, { cHang: 0, duration: 0.1 }, 2.36)
      .to(S, { dissolve: 1, ease: 'power1.in', duration: 0.34 }, 2.44)
      .to(S, { ropeBar: 1, ease: 'power2.inOut', duration: 0.3 }, 2.5)
      .to(S, { rope: 1, ease: 'power2.out', duration: 0.34 }, 2.62)
      .to(S, { cam: 3, ease: 'power1.inOut', duration: 0.52 }, 2.42)
      .to(S, { cRope: 1, duration: 0.12 }, 2.84)
      .to({}, { duration: 0.01 }, 2.99);
  }
  var hudIdx = 0;
  function hud() {
    var t = tl.time(), i = t < 1.6 ? 0 : t < 2.6 ? 1 : 2;
    if (i === hudIdx) return;
    hudIdx = i;
    ticks.forEach(function (el, k) { el.classList.toggle('is-on', k === i); });
  }

  /* ---------- scroll -> time, piecewise from measured text positions ----------
     The object always shows the apparatus whose text you are reading.
     Desktop: stage k starts to morph as panel k's text comes in at the bottom of the screen
     (the last stage's callouts are already gone by then) and is fully set by the time that
     text has climbed to the upper third; it then holds while the text is read.
     Phones: the object lives in a band at the top; stage k morphs in while panel k's text
     climbs from the bottom of the screen to the band, and holds while it is read. */
  var pts = [[0, 0], [1, 3]];
  function measure() {
    var base = sec.getBoundingClientRect().top, vh = innerHeight, k;
    if (wideQ.matches) {
      var x = panels.map(function (p) { return p.querySelector('.ap3-text').getBoundingClientRect().top - base; });
      pts = [[x[0] - vh * 0.75, 0]];
      for (k = 1; k < 4; k++) pts.push([x[k] - vh * 0.9, k - 0.55], [x[k] - vh * 0.3, k - 0.02]);
      pts.push([x[3] - vh * 0.05, 3]);
    } else {
      // sideways phone: the object is on the left half, so a panel is "in place" at a third of the screen
      var line = sideQ.matches ? vh * 0.3 : (band.offsetHeight || vh * 0.52);
      var t = panels.map(function (p) { return p.querySelector('.ap3-text').getBoundingClientRect().top - base; });
      pts = [[t[0] - line - vh * 0.3, 0], [t[0] - line, 0.3]];
      for (k = 1; k < 4; k++) pts.push([t[k] - vh, k - 0.55], [t[k] - line, k - 0.04]);
      pts.push([t[3] - line + vh * 0.3, 3]);
    }
    for (k = 1; k < pts.length; k++) if (pts[k][0] <= pts[k - 1][0]) pts[k][0] = pts[k - 1][0] + 1;
  }
  function timeAt(s) {
    if (s <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      if (s < pts[i][0]) { var a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (s - a[0]) / (b[0] - a[0]); }
    }
    return pts[pts.length - 1][1];
  }
  function drive(instant) {
    var t = timeAt(-sec.getBoundingClientRect().top);
    if (instant) { gsap.killTweensOf(tl); tl.time(t); }
    else gsap.to(tl, { time: t, duration: 0.3, ease: 'power2.out', overwrite: true }); // a touch of smoothing, never a visible lag
  }

  /* ---------- turntable: drag (pointer + touch), arrow keys, buttons, parallax ---------- */
  function wire() {
    viewer.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      V.drag = true; V.lastX = e.clientX; V.touched = now(); viewer.classList.add('is-drag');
      try { viewer.setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
    });
    viewer.addEventListener('pointermove', function (e) {
      if (!V.drag) return;
      var d = (e.clientX - V.lastX) * 0.009; V.lastX = e.clientX; V.yaw += d; V.vel = d * 0.6; V.touched = now();
    });
    var end = function () { V.drag = false; viewer.classList.remove('is-drag'); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { viewer.addEventListener(t, end); });
    var nudge = function (dir) { V.vel += dir * 0.05; V.touched = now(); };
    viewer.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { nudge(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { nudge(1); e.preventDefault(); }
    });
    sec.querySelectorAll('.ap3-rot button').forEach(function (b) {
      b.addEventListener('click', function () { nudge(+b.getAttribute('data-dir')); });
    });
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      listen(window, 'pointermove', function (e) { V.px = e.clientX / innerWidth - 0.5; V.py = e.clientY / innerHeight - 0.5; }, { passive: true });
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) { inView = ents[0].isIntersecting; sync(); }, { rootMargin: '80px 0px' });
      io.observe(sec);
      cleanups.push(function () { io.disconnect(); });
    } else inView = true;
    listen(D, 'visibilitychange', sync);
  }

  /* render only while the stage is allowed, on screen, and the tab is visible */
  function sync() {
    var want = !!(stage && allow && inView && !D.hidden);
    if (want === running) return;
    running = want;
    stage.loop(want);
  }

  /* three.js (~150 kB) is only fetched once the section is within a screen and a half */
  var nearIO = null;
  function buildWhenNear() {
    if (stage || building || nearIO) return;
    if (!('IntersectionObserver' in window)) { build(); return; }
    nearIO = new IntersectionObserver(function (es) {
      if (!es.some(function (e) { return e.isIntersecting; })) return;
      nearIO.disconnect(); nearIO = null;
      if (allow && !stage && !building) build();
    }, { rootMargin: '150% 0px' });
    nearIO.observe(sec);
    cleanups.push(function () { if (nearIO) { nearIO.disconnect(); nearIO = null; } });
  }
  function build() {
    building = true;
    buildStage().then(function (st) {
      if (destroyed) { st.dispose(); return; }
      stage = st; building = false;
      sec.classList.add('is-ready');
      sync();
      MK.util.refreshSoon();
    }).catch(function (err) {
      building = false; failed = true; allow = false;
      console.warn('[apparatus] 3D stage unavailable, showing the static layout.', err);
      if (unpin) { unpin(); unpin = null; }
      H.classList.remove('ap3-3d');
      MK.util.refreshSoon();
    });
  }

  /* ---------- broadcast cues: graphics play in on entry, they are not scrubbed ---------- */
  function reveals() {
    panels.forEach(function (p, i) {
      if (i === 0) {
        var list = p.querySelector('.ap3-order');
        var st = { trigger: list, start: 'top 90%', once: true };
        gsap.from(list.children, { y: 18, autoAlpha: 0, duration: 0.55, stagger: 0.08, ease: 'power3.out', scrollTrigger: st });
        gsap.fromTo(list.querySelectorAll('.ap3-order__n'), { clipPath: 'inset(-12% 100% -12% 0%)' },
          { clipPath: 'inset(-12% 0% -12% 0%)', clearProps: 'clipPath', duration: 0.6, stagger: 0.08, delay: 0.15, ease: 'cut', scrollTrigger: { trigger: list, start: 'top 90%', once: true } });
        return;
      }
      var text = p.querySelector('.ap3-text'), spec = text.querySelector('.ap3-spec');
      gsap.timeline({ scrollTrigger: { trigger: text, start: 'top 82%', once: true } })
        .fromTo(text.querySelector('.ap3-num'), { clipPath: 'inset(-12% 100% -12% 0%)' }, { clipPath: 'inset(-12% 0% -12% 0%)', clearProps: 'clipPath', duration: 0.7, ease: 'cut' })
        .fromTo(text.querySelector('.ap3-name'), { clipPath: 'inset(-25% 100% -25% 0%)' }, { clipPath: 'inset(-25% 0% -25% 0%)', clearProps: 'clipPath', duration: 0.8, ease: 'cut' }, 0.1)
        .from(text.querySelectorAll('.ap3-lede, .ap3-spec > div, .ap3-note'), { y: 16, autoAlpha: 0, duration: 0.55, stagger: 0.06, ease: 'power3.out' }, 0.35)
        .add(function () { MK.util.fireCounters(spec); }, 0.45);
      var fig = p.querySelector('.ap3-fig');
      if (!fig) return;
      gsap.timeline({ scrollTrigger: { trigger: fig, start: 'top 88%', once: true } })
        .fromTo(fig.querySelector('.ap3-frame'), { clipPath: 'inset(0% 0% 0% 100%)' }, { clipPath: 'inset(0% 0% 0% 0%)', clearProps: 'clipPath', duration: 1, ease: 'cut' })
        .fromTo(fig.querySelector('img'), { scale: 1.2 }, { scale: 1, duration: 1.4, ease: 'power2.out' }, 0)
        .from(fig.querySelector('figcaption'), { autoAlpha: 0, y: 8, duration: 0.4, ease: 'power3.out' }, 0.6);
    });
  }

  /* ---------- desktop: ONE pinned frame, ONE scrubbed timeline ----------
     Text, photo and object change together, at the same scroll position, and the scroll
     snaps to each apparatus so the frame never rests half-way between two of them.
       intro 0 · pole 1.5 · hanging 3.2 · rope 4.9 · release 5.4                     */
  var unpin = null;
  function pinScene() {
    var intro = panels[0], introText = intro.querySelector('.ap3-text'), order = intro.querySelector('.ap3-orderwrap');
    var rot = sec.querySelector('.ap3-rot');
    var apps = panels.slice(1).map(function (p) {
      var tx = p.querySelector('.ap3-text'), fig = p.querySelector('.ap3-fig');
      return { p: p, tx: tx, num: tx.querySelector('.ap3-num'), name: tx.querySelector('.ap3-name'),
        rest: tx.querySelectorAll('.ap3-lede, .ap3-spec > div, .ap3-note'),
        fig: fig, frame: fig.querySelector('.ap3-frame'), img: fig.querySelector('img'), cap: fig.querySelector('figcaption') };
    });
    gsap.killTweensOf(tl); tl.pause();
    for (var k in S) S[k] = 0;

    function textIn(M, a, t) {
      M.set(a.p, { visibility: 'visible' }, t)
        .fromTo(a.tx, { autoAlpha: 0, y: 0 }, { autoAlpha: 1, duration: 0.01 }, t)
        .fromTo(a.num, { clipPath: 'inset(-12% 100% -12% 0%)' }, { clipPath: 'inset(-12% 0% -12% 0%)', duration: 0.3, ease: 'cut' }, t)
        .fromTo(a.name, { clipPath: 'inset(-25% 100% -25% 0%)' }, { clipPath: 'inset(-25% 0% -25% 0%)', duration: 0.34, ease: 'cut' }, t + 0.05)
        .fromTo(a.rest, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.035, ease: 'power3.out' }, t + 0.14)
        .fromTo(a.fig, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, t + 0.08)
        .fromTo(a.frame, { clipPath: 'inset(0% 0% 0% 100%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.38, ease: 'cut' }, t + 0.08)
        .fromTo(a.img, { scale: 1.18 }, { scale: 1, duration: 0.55, ease: 'power2.out' }, t + 0.08)
        .fromTo(a.cap, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.2, ease: 'power3.out' }, t + 0.3);
    }
    function textOut(M, a, t) {
      M.to(a.tx, { autoAlpha: 0, y: -28, duration: 0.24, ease: 'power2.in' }, t)
        .to(a.frame, { clipPath: 'inset(0% 100% 0% 0%)', duration: 0.24, ease: 'power2.in' }, t)
        .to(a.cap, { autoAlpha: 0, duration: 0.12 }, t)
        .set(a.p, { visibility: 'hidden' }, t + 0.26);
    }

    var M = gsap.timeline({ paused: true, defaults: { ease: 'none' }, onUpdate: function () {
      var t = M.time(), i = t < 2.4 ? 0 : t < 4.1 ? 1 : 2;
      ticks.forEach(function (el, j) { el.classList.toggle('is-on', j === i); });
    } });
    M.addLabel('intro', 0)
      // intro -> pole: the camera swings round to face the pole, its text and photo come in, then its labels
      .to(introText, { autoAlpha: 0, y: -28, duration: 0.26, ease: 'power2.in' }, 0.5)
      .to(order, { autoAlpha: 0, x: 24, duration: 0.26, ease: 'power2.in' }, 0.5)
      .to(S, { cam: 1, duration: 0.9, ease: 'power1.inOut' }, 0.5)
      // the stage is empty on the intro: the pole rises out of the floor as POLE comes in
      .to(S, { rise: 1, duration: 0.7, ease: 'power2.out' }, 0.55)
      .fromTo(rot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }, 1.0);
    textIn(M, apps[0], 0.86);
    M.to(S, { cPole: 1, duration: 0.14 }, 1.3)
      .addLabel('pole', 1.5)
      // pole -> hanging: labels off, text out, the pole shortens and is hung, the new text comes in
      .to(S, { cPole: 0, duration: 0.1 }, 2.1);
    textOut(M, apps[0], 2.1);
    M.to(S, { cam: 2, duration: 0.65, ease: 'power1.inOut' }, 2.15)
      .to(S, { morph: 1, duration: 0.5, ease: 'power2.inOut' }, 2.2)
      .to(S, { beam: 1, duration: 0.4, ease: 'power2.out' }, 2.2)
      .to(S, { chain: 1, duration: 0.3 }, 2.35)
      .to(S, { swing: 1, duration: 0.35, ease: 'power1.in' }, 2.5);
    textIn(M, apps[1], 2.56);
    M.to(S, { cHang: 1, duration: 0.14 }, 3.0)
      .addLabel('hanging', 3.2)
      // hanging -> rope: labels off, text out, the pole burns away and the rope comes down
      .to(S, { cHang: 0, duration: 0.1 }, 3.8);
    textOut(M, apps[1], 3.8);
    M.to(S, { cam: 3, duration: 0.6, ease: 'power1.inOut' }, 3.85)
      .to(S, { dissolve: 1, duration: 0.4, ease: 'power1.in' }, 3.9)
      .to(S, { ropeBar: 1, duration: 0.35, ease: 'power2.inOut' }, 3.95)
      .to(S, { rope: 1, duration: 0.4, ease: 'power2.out' }, 4.15);
    textIn(M, apps[2], 4.26);
    M.to(S, { cRope: 1, duration: 0.14 }, 4.7)
      .addLabel('rope', 4.9)
      .addLabel('release', 5.4)
      .to({}, { duration: 0.5 }, 4.9);

    // Snap to the next stage in the direction of travel. A position already on a stage (within a
    // few px) stays there, and nothing snaps while a running-order link is scrolling the page.
    var stops = ['intro', 'pole', 'hanging', 'rope', 'release'].map(function (l) { return M.labels[l] / M.duration(); });
    var jumping = false, EPS = 0.004;
    function snapTo(v, self) {
      if (jumping) return v;
      var dir = self && self.direction, i;
      if (dir > 0) { for (i = 0; i < stops.length; i++) if (stops[i] >= v - EPS) return stops[i]; return stops[stops.length - 1]; }
      if (dir < 0) { for (i = stops.length - 1; i >= 0; i--) if (stops[i] <= v + EPS) return stops[i]; return stops[0]; }
      return gsap.utils.snap(stops, v);
    }
    var st = ScrollTrigger.create({
      trigger: sec, start: 'top top', end: function () { return '+=' + Math.round(innerHeight * 4.2); },
      pin: true, anticipatePin: 1, scrub: 0.5, invalidateOnRefresh: true, animation: M,
      // inertia off: snap from where the scroll stopped, never from a momentum projection (a flick
      // would otherwise skip a whole apparatus)
      snap: { snapTo: snapTo, inertia: false, duration: { min: 0.3, max: 0.8 }, delay: 0.12, ease: 'power2.inOut' }
    });

    // the running-order links jump to their stage of the scene
    var stageOf = { '#ap3-pole': 'pole', '#ap3-hanging': 'hanging', '#ap3-rope': 'rope' };
    var links = [].slice.call(order.querySelectorAll('a'));
    var jumpEnd = null;
    function go(e) {
      var lab = stageOf[this.getAttribute('href')];
      if (!lab) return;
      e.preventDefault();
      var to = Math.round(st.labelToScroll(lab)), from = window.scrollY;
      jumping = true;
      if (jumpEnd) jumpEnd.kill();
      var o = { y: from };
      jumpEnd = gsap.to(o, { y: to, duration: Math.min(1.6, 0.5 + Math.abs(to - from) / 2600), ease: 'power2.inOut',
        onUpdate: function () { window.scrollTo(0, o.y); },
        onComplete: function () { gsap.delayedCall(0.3, function () { jumping = false; }); } });
    }
    links.forEach(function (a) { a.addEventListener('click', go); });

    return function () {
      links.forEach(function (a) { a.removeEventListener('click', go); });
      if (jumpEnd) jumpEnd.kill();
      st.kill(); M.kill();
      var all = [introText, order, rot];
      apps.forEach(function (a) { all.push(a.p, a.tx, a.num, a.name, a.fig, a.frame, a.img, a.cap); all.push.apply(all, a.rest); });
      gsap.set(all, { clearProps: 'all' });
    };
  }

  MK.mods.push({
    id: 'apparatus',
    order: 30,
    init: function () { buildTimeline(); wire(); },
    motion: function (c) {
      allow = !!(c.motion && canGL && !failed);
      H.classList.toggle('ap3-3d', allow);
      var pinned = allow && c.big;
      if (pinned) unpin = pinScene();
      else if (allow) {
        ScrollTrigger.create({
          trigger: sec, start: 'top bottom', end: 'bottom top',
          onRefresh: function () { measure(); requestAnimationFrame(function () { drive(true); }); },
          onUpdate: function () { drive(false); }
        });
      }
      if (allow && !stage && !building) buildWhenNear();
      if (c.motion && !pinned) reveals();
      sync();
      MK.util.refreshSoon();
      return function () { allow = false; if (unpin) { unpin(); unpin = null; } sync(); };
    }
  });

  /* ============================================================
     The scene (three.js, loaded on demand)
     ============================================================ */
  async function buildStage() {
    const THREE = await import('three');
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    const view = sec.querySelector('.ap3-view');
    const canvas = sec.querySelector('.ap3-canvas');
    const small = !wideQ.matches || matchMedia('(pointer: coarse)').matches;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.localClippingEnabled = true;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environmentIntensity = 0.3;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 80);

    /* procedural textures */
    const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const mkCanvas = (w, h) => { const c = D.createElement('canvas'); c.width = w; c.height = h; return c; };
    function woodCanvas(W, Hh, seed) {
      const c = mkCanvas(W, Hh), g = c.getContext('2d'), R = rng(seed);
      const base = g.createLinearGradient(0, 0, 0, Hh); base.addColorStop(0, '#7d4220'); base.addColorStop(1, '#5c2c14');
      g.fillStyle = base; g.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 18; i++) {
        const x = R() * W, bw = 10 + R() * 70, dark = R() < .6;
        g.fillStyle = dark ? `rgba(36,12,3,${.08 + R() * .16})` : `rgba(196,116,58,${.05 + R() * .1})`;
        for (const o of [-W, 0, W]) g.fillRect(x + o, 0, bw, Hh);
      }
      g.lineCap = 'round';
      for (let i = 0; i < 320; i++) {
        const x0 = R() * W, amp = 1 + R() * 7, f = .5 + R() * 2.5, ph = R() * 6.283, dark = R() < .78;
        g.strokeStyle = dark ? `rgba(28,9,2,${.12 + R() * .32})` : `rgba(238,164,98,${.05 + R() * .12})`;
        g.lineWidth = .4 + R() * 1.8;
        for (const o of [-W, 0, W]) {
          g.beginPath();
          for (let y = -8; y <= Hh + 8; y += 24) { const x = x0 + o + Math.sin(y / Hh * 6.283 * f + ph) * amp; if (y === -8) g.moveTo(x, y); else g.lineTo(x, y); }
          g.stroke();
        }
      }
      for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(20,6,1,${.15 + R() * .3})`; g.fillRect(R() * W, R() * Hh, 1, 2 + R() * 5); }
      return c;
    }
    const woodTex = new THREE.CanvasTexture(woodCanvas(small ? 256 : 512, small ? 512 : 1024, 7));
    woodTex.colorSpace = THREE.SRGBColorSpace; woodTex.wrapS = THREE.RepeatWrapping; woodTex.anisotropy = 4;
    const beamTex = woodTex.clone(); beamTex.center.set(.5, .5); beamTex.rotation = Math.PI / 2; beamTex.repeat.set(.35, 2.5); beamTex.wrapT = THREE.RepeatWrapping; beamTex.needsUpdate = true;

    const ropeC = mkCanvas(64, 64), rg = ropeC.getContext('2d');
    rg.fillStyle = '#efe4cf'; rg.fillRect(0, 0, 64, 64);
    rg.strokeStyle = 'rgba(122,92,60,.42)'; rg.lineWidth = 6;
    for (let k = -2; k < 4; k++) { rg.beginPath(); rg.moveTo(k * 32, 0); rg.lineTo(k * 32 + 64, 64); rg.stroke(); }
    const ropeTex = new THREE.CanvasTexture(ropeC); ropeTex.colorSpace = THREE.SRGBColorSpace; ropeTex.wrapS = ropeTex.wrapT = THREE.RepeatWrapping; ropeTex.repeat.set(80, 1);

    // studio floor: broadcast black with faint lathe rings in chalk
    const floorC = mkCanvas(1024, 1024), fg = floorC.getContext('2d'), FR = rng(3);
    fg.fillStyle = '#151413'; fg.fillRect(0, 0, 1024, 1024);
    for (let r = 5; r < 720; r += 3 + FR() * 5) { fg.strokeStyle = `rgba(243,238,230,${.012 + FR() * .03})`; fg.lineWidth = .6 + FR() * 1.2; fg.beginPath(); fg.arc(512, 512, r, 0, 6.2832); fg.stroke(); }
    const floorTex = new THREE.CanvasTexture(floorC); floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.anisotropy = 4;
    const alphaC = mkCanvas(256, 256), ag = alphaC.getContext('2d'), agr = ag.createRadialGradient(128, 128, 0, 128, 128, 128);
    agr.addColorStop(0, '#fff'); agr.addColorStop(.24, '#fff'); agr.addColorStop(.66, '#2e2e2e'); agr.addColorStop(1, '#000');
    ag.fillStyle = agr; ag.fillRect(0, 0, 256, 256);
    const floorAlpha = new THREE.CanvasTexture(alphaC);

    const radial = (stops) => { const c = mkCanvas(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); stops.forEach(([o, s]) => gr.addColorStop(o, s)); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const blobTex = radial([[0, 'rgba(0,0,0,0.85)'], [1, 'rgba(0,0,0,0)']]);
    const dotTex = radial([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    const glowTex = radial([[0, 'rgba(255,107,0,0.9)'], [.32, 'rgba(255,107,0,0.32)'], [1, 'rgba(255,107,0,0)']]);

    /* dissolve: shared uniform; the pole burns away with a saffron ember edge */
    const dissolveU = { value: 0 };
    function addDissolve(mat) {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uDissolve = dissolveU;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vDPos;')
          .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvDPos = transformed;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform float uDissolve; varying vec3 vDPos;
float dHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (uDissolve > 0.0) {
  float dn = dNoise(vDPos * 24.0) * 0.6 + dNoise(vDPos * 64.0) * 0.4;
  float e = dn - uDissolve * 1.12 + 0.04;
  if (e < 0.0) discard;
  float rim = 1.0 - smoothstep(0.0, 0.05, e);
  vec3 ember = mix(vec3(1.0, 0.56, 0.12), vec3(1.0, 0.15, 0.0), smoothstep(0.0, 0.05, e));
  totalEmissiveRadiance += ember * rim * 4.2;
  diffuseColor.rgb *= 1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.14, e));
}`);
      };
      mat.customProgramCacheKey = () => 'ap3-dissolve-1';
      return mat;
    }

    /* the pole: one LatheGeometry; the standing profile morphs into the hanging profile.
       Base radius .086 m = 54 cm around; top .056 m = 35 cm around; 2.72 m above ground. */
    function profile(hang) {
      const y0 = hang ? .68 : 0, yTop = hang ? 2.48 : 2.72;
      const rB = hang ? .078 : .086, rT = .056, rN = .031, rH = .066;
      const headH = .1, neckH = .1, shH = .075, cr = .024;
      const yHB = yTop - headH, yNB = yHB - neckH, yS = yNB - shH;
      const P = [[0, y0], [rB * .9, y0], [rB, y0 + .014]];
      const NB = 24;
      for (let i = 1; i <= NB; i++) { const t = i / NB; P.push([rB + (rT - rB) * Math.pow(t, 1.1), y0 + .014 + (yS - y0 - .014) * t]); }
      for (let i = 1; i <= 6; i++) { const a = i / 6 * Math.PI / 2; P.push([rN + (rT - rN) * Math.cos(a), yS + shH * Math.sin(a)]); }
      P.push([rN, yNB + neckH * .5], [rN, yHB - .006]);
      P.push([rN + .006, yHB], [rH - cr, yHB]);
      for (let i = 1; i <= 4; i++) { const a = -Math.PI / 2 + i / 4 * Math.PI / 2; P.push([rH - cr + cr * Math.cos(a), yHB + cr + cr * Math.sin(a)]); }
      P.push([rH, yTop - cr]);
      for (let i = 1; i <= 4; i++) { const a = i / 4 * Math.PI / 2; P.push([rH - cr + cr * Math.cos(a), yTop - cr + cr * Math.sin(a)]); }
      P.push([rH * .45, yTop + .003], [0, yTop + .004]);
      return P.map(([r, y]) => new THREE.Vector2(r, y));
    }
    function lengthUV(geo, pts) {
      const n = pts.length, cum = [0];
      for (let j = 1; j < n; j++) cum[j] = cum[j - 1] + pts[j].distanceTo(pts[j - 1]);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setY(k, cum[k % n] / cum[n - 1]);
      uv.needsUpdate = true;
    }
    const SEG = small ? 36 : 72;
    const pStand = profile(false), pHang = profile(true);
    const gStand = new THREE.LatheGeometry(pStand, SEG), gHang = new THREE.LatheGeometry(pHang, SEG);
    lengthUV(gStand, pStand);
    gStand.morphAttributes.position = [gHang.attributes.position];
    gStand.morphAttributes.normal = [gHang.attributes.normal];

    const floorClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const poleMat = addDissolve(new THREE.MeshPhysicalMaterial({
      map: woodTex, roughness: .46, metalness: 0, clearcoat: 1, clearcoatRoughness: .13, specularIntensity: .7, clippingPlanes: [floorClip],
    }));
    const pole = new THREE.Mesh(gStand, poleMat);

    const PIVOT = 3.46;
    const turntable = new THREE.Group(); scene.add(turntable);
    const swing = new THREE.Group(); swing.position.y = PIVOT; turntable.add(swing);
    const inner = new THREE.Group(); inner.position.y = -PIVOT; swing.add(inner);
    const riser = new THREE.Group(); inner.add(riser); riser.add(pole);

    /* chain, hook and beam for the hanging pole */
    const metal = addDissolve(new THREE.MeshStandardMaterial({ color: 0x6f6458, metalness: 1, roughness: .34 }));
    const chain = new THREE.Group(); inner.add(chain);
    const linkGeo = new THREE.TorusGeometry(.026, .0062, small ? 6 : 8, small ? 12 : 18);
    const links = [];
    const cTop = PIVOT - .02, cBot = 2.53, NL = 12, step = (cTop - cBot) / NL;
    for (let i = 0; i < NL; i++) {
      const l = new THREE.Mesh(linkGeo, metal);
      l.position.y = cBot + (i + .5) * step; l.scale.set(1, 1.55, 1); l.rotation.y = i % 2 ? Math.PI / 2 : 0;
      chain.add(l); links.push(l);
    }
    const eye = new THREE.Mesh(new THREE.TorusGeometry(.02, .0065, 8, 16), metal); eye.position.y = 2.505; eye.rotation.y = Math.PI / 4; chain.add(eye);

    const rig = new THREE.Group(); scene.add(rig);
    const rigMetal = new THREE.MeshStandardMaterial({ color: 0x5a5148, metalness: 1, roughness: .4 });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.5, .15, .17), new THREE.MeshStandardMaterial({ map: beamTex, color: 0x2a1f19, roughness: .62, metalness: .2, envMapIntensity: .4 }));
    beam.position.y = PIVOT + .13; rig.add(beam);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(.034, .008, 8, 20, Math.PI * 1.45), rigMetal);
    hook.position.y = PIVOT + .012; hook.rotation.z = -Math.PI * .2; rig.add(hook);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(.09, .012, .09), rigMetal); plate.position.y = PIVOT + .05; rig.add(plate);

    /* the rope: built once, swayed in the vertex shader (drawn ~2x its 18-20 mm so it reads). It hangs
       from the hanging pole's beam, lifted to the rope's height, and lowers out of the hook. */
    const RTOP = 6.35, RBOT = .1, ROPE_LIFT = RTOP - PIVOT;
    const rpts = []; for (let i = 0; i <= 12; i++) rpts.push(new THREE.Vector3(0, RTOP - (RTOP - RBOT) * i / 12, 0));
    const ropeU = { time: { value: 0 }, sway: { value: 0 } };
    const ropeClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), RTOP + .005); // nothing shows above the hook
    const ropeMat = new THREE.MeshPhysicalMaterial({ map: ropeTex, roughness: .9, sheen: 1, sheenRoughness: .55, sheenColor: new THREE.Color(0xffe6c4), clippingPlanes: [ropeClip] });
    ropeMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = ropeU.time; sh.uniforms.uSway = ropeU.sway;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uSway;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float rk = clamp((${RTOP.toFixed(2)} - position.y) / ${(RTOP - RBOT).toFixed(2)}, 0.0, 1.0); rk *= rk;
transformed.x += uSway * rk * (0.07 * sin(uTime * 0.9 + position.y * 0.35) + 0.02 * sin(uTime * 2.1 + position.y * 1.7));
transformed.z += uSway * rk * 0.04 * sin(uTime * 0.7 + 1.3 + position.y * 0.5);`);
    };
    ropeMat.customProgramCacheKey = () => 'ap3-rope-1';
    const rope = new THREE.Group(); turntable.add(rope);
    rope.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rpts), small ? 80 : 180, .02, small ? 6 : 10, false), ropeMat));
    function ropeSway(y, out) {
      let k = Math.min(1, Math.max(0, (RTOP - y) / (RTOP - RBOT))); k *= k;
      const s = ropeU.sway.value, t = ropeU.time.value;
      out.x = s * k * (.07 * Math.sin(t * .9 + y * .35) + .02 * Math.sin(t * 2.1 + y * 1.7));
      out.z = s * k * .04 * Math.sin(t * .7 + 1.3 + y * .5);
    }

    /* studio: black floor, contact shadow, saffron floor mark + glow, emerging ring, light cone, dust */
    const flat = (mesh, y, order) => { mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; mesh.renderOrder = order; scene.add(mesh); return mesh; };
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
    // matte (no specular sheen): the pool of light stays neutral, the stage stays black
    flat(new THREE.Mesh(new THREE.CircleGeometry(6, small ? 48 : 96), new THREE.MeshLambertMaterial({ map: floorTex, alphaMap: floorAlpha, transparent: true, depthWrite: false })), 0, 0);
    const glow = flat(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: glowTex, opacity: 0, ...add })), .003, 1);
    const mark = flat(new THREE.Mesh(new THREE.RingGeometry(1.16, 1.172, small ? 96 : 160), new THREE.MeshBasicMaterial({ color: 0xff6b00, opacity: 0, ...add })), .004, 1);
    const blob = flat(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })), .005, 2);
    const ropeBlob = blob.clone(); ropeBlob.material = blob.material.clone(); scene.add(ropeBlob);
    const ring = flat(new THREE.Mesh(new THREE.RingGeometry(.1, .17, 64), new THREE.MeshBasicMaterial({ color: 0xff6b00, opacity: 0, ...add })), .006, 3);

    const coneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xfff0e0) }, uI: { value: .06 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 2.0); float a = uI * f * smoothstep(0.0, 0.3, vY) * (0.3 + 0.7 * vY); gl_FragColor = vec4(uColor * a, a); }',
    });
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(.12, 1.5, 6.6, 40, 1, true), coneMat);
    cone.position.y = 3.3; scene.add(cone);

    const NDUST = small ? 50 : 120, dust = new Float32Array(NDUST * 3), dSpeed = new Float32Array(NDUST), DR = rng(11);
    for (let i = 0; i < NDUST; i++) { const a = DR() * 6.283, r = Math.sqrt(DR()) * 1.1; dust[i * 3] = Math.cos(a) * r; dust[i * 3 + 1] = .1 + DR() * 4.6; dust[i * 3 + 2] = Math.sin(a) * r; dSpeed[i] = .02 + DR() * .05; }
    const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
    scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: .015, map: dotTex, color: 0xffd9b0, transparent: true, opacity: .4, depthWrite: false, blending: THREE.AdditiveBlending })));

    /* light: warm key and top, a chalk rim on the left, a saffron rim on the right */
    const key = new THREE.SpotLight(0xffe8d6, 90, 0, .44, .85, 2); key.position.set(2.3, 4.8, 3.5); key.target.position.set(0, 1.2, 0); scene.add(key, key.target);
    const top = new THREE.SpotLight(0xfff0e2, 60, 0, .24, 1, 2); top.position.set(0, 6.8, .3); top.target.position.set(0, 0, 0); scene.add(top, top.target);
    const rimL = new THREE.DirectionalLight(0xffe8cc, 2.6); rimL.position.set(-3, 3.2, -3.4); scene.add(rimL);
    const rimR = new THREE.DirectionalLight(0xff6b00, 2.6); rimR.position.set(3.4, 2.2, -2.6); scene.add(rimR);
    scene.add(new THREE.HemisphereLight(0x2e2823, 0x000000, .5));

    /* camera stops: intro (low, on the floor), pole, hanging, rope */
    const Vc = (x, y, z) => new THREE.Vector3(x, y, z);
    const K = [
      { p: Vc(1.7, 1.35, 6.6), t: Vc(0, 1.18, 0), fov: 34 },
      { p: Vc(0, 1.62, 7.0), t: Vc(0, 1.0, 0), fov: 32 },
      { p: Vc(.35, 2.0, 8.6), t: Vc(0, 1.6, 0), fov: 32 },
      { p: Vc(0, 3.4, 13.4), t: Vc(0, 3.1, 0), fov: 34 },
    ].map((k) => ({ ...k, off: k.p.clone().sub(k.t) }));

    /* size: the band is the canvas; on desktop the object sits in the middle column (55%) */
    let W = 1, Hh = 1, distScale = 1;
    function resize() {
      W = view.clientWidth || innerWidth; Hh = view.clientHeight || innerHeight;
      renderer.setSize(W, Hh, false);
      camera.aspect = W / Hh;
      const a = W / Hh;
      distScale = a < 1 ? Math.min(1.45, 1 + (1 - a) * 1.2) : 1;
      if (wideQ.matches) camera.setViewOffset(W, Hh, -0.05 * W, 0, W, Hh); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize); ro.observe(view); resize();

    /* overlay: project 3D anchors to the screen each frame */
    const el = {}; sec.querySelectorAll('.ap3-callouts [data-k]').forEach((n) => { el[n.dataset.k] = n; });
    const groups = {}; sec.querySelectorAll('.ap3-cg').forEach((g) => { groups[g.dataset.g] = g; });
    const gLast = {};
    const setG = (k, a) => { const v = a.toFixed(2); if (gLast[k] === v) return; gLast[k] = v; groups[k].style.opacity = v; groups[k].style.visibility = a > .01 ? 'visible' : 'hidden'; };
    const camRight = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3(), sw = new THREE.Vector3();
    const scr = (v) => { P.copy(v).project(camera); return [(P.x * .5 + .5) * W, (-P.y * .5 + .5) * Hh]; };
    const onPole = (y, off, out) => { out.set(0, y, 0); riser.localToWorld(out); if (off) out.addScaledVector(camRight, off); return out; };
    const onChain = (y, off, out) => { out.set(0, y, 0); inner.localToWorld(out); if (off) out.addScaledVector(camRight, off); return out; };
    const onRope = (y, off, out) => { ropeSway(y, sw); out.set(sw.x, y, sw.z); rope.localToWorld(out); if (off) out.addScaledVector(camRight, off); return out; };
    const put = (n, v) => { const [x, y] = scr(v); n.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; };
    const span = (n, a, b) => { const [x1, y1] = scr(a), [x2, y2] = scr(b); n.style.transform = `translate3d(${((x1 + x2) / 2).toFixed(1)}px,${Math.min(y1, y2).toFixed(1)}px,0)`; n.style.height = `${Math.abs(y2 - y1).toFixed(1)}px`; };
    function overlay() {
      camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      setG('pole', S.cPole); setG('hang', S.cHang); setG('rope', S.cRope);
      if (S.cPole > .01) {
        span(el.pH, onPole(0, -.34, A), onPole(2.72, -.34, B));
        span(el.pB, onPole(-.85, -.34, A), onPole(0, -.34, B));
        put(el.pHead, onPole(2.62, .072, A)); put(el.pTop, onPole(2.3, .062, A));
        put(el.pWood, onPole(1.45, .076, A)); put(el.pBase, onPole(.22, .09, A));
      }
      if (S.cHang > .01) {
        span(el.hL, onPole(.68, -.3, A), onPole(2.48, -.3, B));
        onPole(.68, -.3, A); B.copy(A); B.y = 0; span(el.hG, B, A);
        put(el.hChain, onChain(3.0, .035, A)); put(el.hSwing, onPole(1.5, .078, A));
      }
      if (S.cRope > .01) {
        span(el.rL, onRope(RBOT, -.3, A), onRope(RTOP, -.3, B));
        put(el.r4, onRope(4, 0, A)); put(el.rThick, onRope(1.3, .016, A)); put(el.rKnot, onRope(2.6, .016, A));
      }
    }

    /* frame */
    const tgt = new THREE.Vector3(), off = new THREE.Vector3(), tmp = new THREE.Vector3();
    const sm = (x) => x * x * (3 - 2 * x), clamp01 = (x) => Math.min(1, Math.max(0, x));
    const par = { x: 0, y: 0 };
    let T = 0, last = now();
    function update(dt) {
      T += dt;
      if (!V.drag) {
        V.yaw += V.vel; V.vel *= Math.pow(.9, dt * 60);
        if (now() - V.touched > 2600) V.yaw += dt * .16;
      }
      turntable.rotation.y = V.yaw;

      riser.position.y = (S.rise - 1) * 2.9;
      pole.morphTargetInfluences[0] = S.morph;
      const w = 6.2832 / 2.6;
      swing.rotation.z = S.swing * .075 * Math.sin(T * w);
      swing.rotation.x = S.swing * .03 * Math.sin(T * w * .5 + 1.1);
      dissolveU.value = S.dissolve;
      pole.visible = S.rise > .002 && S.dissolve < .995;
      chain.visible = S.chain > .001 && S.dissolve < .995;
      links.forEach((l, i) => { l.visible = S.chain > (NL - 1 - i) / NL; });
      eye.visible = S.chain > .95;
      rig.position.y = (1 - S.beam) * 1.8 + S.ropeBar * ROPE_LIFT; rig.visible = S.beam > .001;

      rope.visible = S.rope > .001; rope.position.y = (1 - S.rope) * 6.6;
      ropeU.time.value = T; ropeU.sway.value = .5 + .5 * S.rope;
      key.target.position.y = 1.2 + 1.2 * S.rope;

      // contact shadows, the saffron floor mark, the glow pool, and the ring the pole rises through
      onPole(S.morph * .68, 0, tmp);
      blob.position.x = tmp.x; blob.position.z = tmp.z;
      blob.scale.setScalar(.5 + S.morph * .55);
      blob.material.opacity = (1 - .62 * S.morph) * (1 - S.dissolve) * clamp01(S.rise * 3);
      ropeBlob.position.set(rope.position.x, .005, 0);
      ropeBlob.scale.setScalar(.26); ropeBlob.material.opacity = .7 * S.rope;
      mark.material.opacity = .42;
      glow.material.opacity = .36 + .14 * Math.sin(Math.PI * S.rise) + .5 * Math.sin(Math.PI * S.dissolve);
      ring.material.opacity = Math.sin(Math.PI * S.rise) * .9 * (1 - S.morph);
      ring.scale.setScalar(1 + S.rise * .5);

      for (let i = 0; i < NDUST; i++) {
        let y = dust[i * 3 + 1] + dSpeed[i] * dt; if (y > 4.8) y = .1;
        dust[i * 3 + 1] = y; dust[i * 3] += Math.sin(T * .3 + i) * .0004;
      }
      dustGeo.attributes.position.needsUpdate = true;

      // camera along its stops, with a little pointer parallax
      const c = Math.min(3, Math.max(0, S.cam)), i0 = Math.min(2, Math.floor(c)), f = sm(c - i0), a = K[i0], b = K[i0 + 1];
      tgt.lerpVectors(a.t, b.t, f); off.lerpVectors(a.off, b.off, f).multiplyScalar(distScale);
      par.x += (V.px - par.x) * .05; par.y += (V.py - par.y) * .05;
      camera.position.copy(tgt).add(off); camera.position.x += par.x * .4; camera.position.y -= par.y * .2;
      camera.lookAt(tgt);
      camera.fov = a.fov + (b.fov - a.fov) * f;
      camera.updateProjectionMatrix();
    }
    function frame(t) {
      const tt = t || now(), dt = Math.min(.05, Math.max(0, (tt - last) / 1000)); last = tt;
      update(dt); renderer.render(scene, camera); overlay();
    }

    frame(now());
    return {
      loop: (on) => { last = now(); renderer.setAnimationLoop(on ? frame : null); },
      dispose: () => {
        renderer.setAnimationLoop(null);
        ro.disconnect();
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
          mats.forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
        });
        if (scene.environment) scene.environment.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      },
    };
  }

  return function destroy() {
    destroyed = true;
    allow = false;
    cleanups.splice(0).forEach(function (f) { f(); });
    if (stage) { stage.dispose(); stage = null; }
    running = false;
  };
}
