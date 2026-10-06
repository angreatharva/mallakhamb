import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { CustomEase } from 'gsap/CustomEase';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import registerName from './name';
import registerApparatus from './apparatus';
import registerCode from './code';

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase, ScrambleTextPlugin);
// "cut": a broadcast graphics wipe. Slow off the mark, hard landing.
CustomEase.create('cut', 'M0,0 C0.62,0 0.12,1 1,1');

/**
 * The landing page's motion runtime.
 *
 * This chunk (GSAP and the section scripts) is imported only after the first screen has painted,
 * and the first screen never depends on it: the portal is plain markup. three.js is a further chunk
 * that the apparatus section fetches when it comes near.
 *
 * Each section registers `{ id, order, init, motion }` in MK.mods: `init` once, for interactions that
 * must work with reduced motion; `motion(c)` inside one gsap.matchMedia for every branch
 * (c = { motion, reduce, md, big }), returning its own undo.
 *
 * @param {HTMLElement} page the .mk-home root
 * @returns {() => void} destroy: reverts every animation, pin and listener, stops every loop
 */
export function bootHome(page) {
  const clamp = (a, b, v) => Math.min(b, Math.max(a, v));
  const decimals = (s) => { const p = String(s).split('.'); return p[1] ? p[1].length : 0; };
  const countUp = (el, dur) => {
    const to = parseFloat(el.getAttribute('data-count'));
    const d = decimals(el.getAttribute('data-count'));
    const o = { v: 0 };
    if (el._tw) el._tw.kill();
    el._tw = gsap.to(o, { v: to, duration: dur || 1.1, ease: 'power3.out', onUpdate: () => { el.textContent = o.v.toFixed(d); } });
  };
  const fireCounters = (scope) => scope.querySelectorAll('[data-count]').forEach((el) => countUp(el));
  let refreshId;
  const refreshSoon = () => { clearTimeout(refreshId); refreshId = setTimeout(() => ScrollTrigger.refresh(), 300); };

  const MK = { mods: [], util: { clamp, countUp, fireCounters, refreshSoon } };
  // e2e/home-device-audit.mjs reads the page's ScrollTrigger from here (GSAP is a bundled module).
  page.__home = { ScrollTrigger };
  const destroyers = [registerName(page, MK), registerApparatus(page, MK), registerCode(page, MK)];

  ScrollTrigger.config({ ignoreMobileResize: true });
  let mm = null, started = false, dead = false;
  const startTimer = setTimeout(start, 2500);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);

  function start() {
    if (started || dead) return;
    started = true;
    const mods = MK.mods.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    mods.forEach((m) => { if (m.init) { try { m.init(); } catch (e) { console.error(`[home:${m.id}] init`, e); } } });

    mm = gsap.matchMedia();
    mm.add({
      motion: '(prefers-reduced-motion: no-preference)',
      reduce: '(prefers-reduced-motion: reduce)',
      md: '(min-width: 768px)',
      big: '(min-width: 1024px) and (min-height: 560px)',
    }, (ctx) => {
      const c = ctx.conditions, undo = [];
      // Sections get every branch: they also need to know when motion is OFF.
      mods.forEach((m) => {
        if (!m.motion) return;
        try { const u = m.motion(c); if (typeof u === 'function') undo.push(u); } catch (e) { console.error(`[home:${m.id}] motion`, e); }
      });
      if (c.motion) {
        page.querySelectorAll('[data-sting]').forEach((h) => undo.push(sting(h)));
        ticker();
        liveParallax();
      }
      return () => undo.forEach((f) => f());
    });

    channelBug();
    page.querySelectorAll('img[loading="lazy"]').forEach((img) => { if (!img.complete) img.addEventListener('load', refreshSoon, { once: true }); });
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
  }

  /* ---------- segment title stinger: a saffron bar wipes on, the title is behind it ---------- */
  function sting(h) {
    const orig = h.innerHTML;
    h.innerHTML = `<span class="sting__txt" style="display:block">${orig}</span><span class="sting__bar" aria-hidden="true"></span>`;
    h.style.position = 'relative';
    const txt = h.firstChild, bar = h.lastChild;
    gsap.set(txt, { clipPath: 'inset(-20% 100% -20% 0%)' });
    gsap.set(bar, { scaleX: 0, transformOrigin: '0% 50%' });
    gsap.timeline({ scrollTrigger: { trigger: h, start: 'top 88%', once: true } })
      .to(bar, { scaleX: 1, duration: 0.34, ease: 'power3.in' })
      .set(txt, { clipPath: 'inset(-20% 0% -20% 0%)' })
      .set(bar, { transformOrigin: '100% 50%' })
      .to(bar, { scaleX: 0, duration: 0.5, ease: 'power3.out' });
    return () => { h.innerHTML = orig; h.style.position = ''; };
  }

  /* ---------- ticker: drifts on its own, leans and speeds up with scroll velocity ---------- */
  function ticker() {
    const tracks = gsap.utils.toArray('.ticker__track', page);
    if (!tracks.length) return;
    const tws = tracks.map((tr, i) => gsap.fromTo(tr, { xPercent: i ? -50 : 0 }, { xPercent: i ? 0 : -50, duration: i ? 46 : 38, ease: 'none', repeat: -1, paused: true }));
    const skew = gsap.quickSetter(tracks, 'skewX', 'deg');
    const proxy = { s: 0, b: 0 };
    ScrollTrigger.create({
      trigger: page.querySelector('.ticker'), start: 'top bottom', end: 'bottom top',
      onToggle: (self) => tws.forEach((t) => (self.isActive ? t.play() : t.pause())),
      onUpdate: (self) => {
        const v = self.getVelocity(), s = clamp(-14, 14, v / -240), b = Math.min(Math.abs(v) / 320, 6);
        if (Math.abs(s) > Math.abs(proxy.s) || b > proxy.b) {
          proxy.s = s; proxy.b = b;
          gsap.to(proxy, { s: 0, b: 0, duration: 0.9, ease: 'power3', overwrite: true, onUpdate: () => {
            skew(proxy.s); tws.forEach((t) => t.timeScale(1 + proxy.b));
          } });
        }
      },
    });
  }

  /* ---------- live: slow parallax on the photograph ---------- */
  function liveParallax() {
    const img = page.querySelector('.live__media img');
    if (img) gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: page.querySelector('.live'), start: 'top bottom', end: 'bottom top', scrub: true } });
  }

  /* ---------- the channel bug: running order of the programme ----------
     Read live from the sections' positions on every scroll, not from trigger ranges worked out at
     refresh: pinned sections add scroll length, and a range measured before that is added switches
     the bug off half-way down the page. */
  function channelBug() {
    const bug = page.querySelector('.bug');
    if (!bug) return;
    const seg = bug.querySelector('.bug__seg');
    const segs = [...page.querySelectorAll('main [data-seg]')];
    if (!segs.length) return;
    let cur = null, on = null;
    const update = () => {
      const line = innerHeight * 0.55;
      let active = null;
      for (const s of segs) if (s.getBoundingClientRect().top <= line) active = s;
      const show = segs[0].getBoundingClientRect().top <= innerHeight * 0.7;
      if (show !== on) { on = show; bug.classList.toggle('is-on', show); }
      if (active && active !== cur) { cur = active; seg.textContent = active.getAttribute('data-seg'); }
    };
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update, onRefresh: update });
    update();
  }

  return function destroy() {
    dead = true;
    clearTimeout(startTimer);
    clearTimeout(refreshId);
    if (mm) mm.revert();
    // Nothing else in the app uses GSAP, so everything still alive is this page's.
    ScrollTrigger.getAll().forEach((t) => t.kill(true));
    gsap.globalTimeline.getChildren(true, true, true).forEach((t) => t.kill());
    destroyers.forEach((d) => { try { d(); } catch (e) { console.error('[home] destroy', e); } });
    page.classList.remove('ap3-gl', 'ap3-3d');
    delete page.__home;
  };
}
