import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

/**
 * 01 The name and 02 Origins: the pole-climbing letters, the statements across the pole and the
 * milestones. Everything here runs inside the page's gsap.matchMedia, so the runner's revert
 * undoes it all; nothing outside GSAP needs tearing down.
 *
 * @param {HTMLElement} page the .mk-home root
 * @param {{ mods: object[], util: object }} MK the page's module registry
 */
export default function registerName(page, MK) {
  /* 01 The name: MALLAKHAMB lies on the ground, curves onto the pole, stacks
     into a column, then splits into MALLA + KHAMB. Start and column positions
     come from two hidden layouts (ghosts), re-measured on every refresh. */
  MK.mods.push({
    id: 'name',
    order: 10,
    motion: function (c) {
      if (!c.motion) return;
      var sec = page.querySelector('#name');
      if (!sec) return;
      var stage = sec.querySelector('.nm__stage');
      var chars = gsap.utils.toArray('.nm__dl .nm__ch', sec);
      var fillA = sec.querySelector('.nm__fill--a'), fillB = sec.querySelector('.nm__fill--b');
      var plus = sec.querySelector('.nm__plus'), para = sec.querySelector('.nm__p');
      var glossL = sec.querySelector('.nm__term--l .nm__gloss'), glossR = sec.querySelector('.nm__term--r .nm__gloss');

      /* ---- phones, tablets, short screens: no pin. The fill tracks the reader;
         the letters climb out of a floor mask once. ---- */
      if (!c.big) {
        gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top center', end: 'bottom center', scrub: 0.3 } })
          .fromTo(fillA, { scaleY: 0 }, { scaleY: 1, ease: 'none' })
          .fromTo(fillB, { scaleY: 0 }, { scaleY: 1, ease: 'none' });
        gsap.set(sec.querySelectorAll('.nm__word'), { clipPath: 'inset(-15% -6% 0% -6%)' });
        gsap.timeline({ scrollTrigger: { trigger: sec.querySelector('.nm__dl'), start: 'top 82%', once: true } })
          .fromTo(chars, { yPercent: 100 }, { yPercent: 0, duration: 0.8, ease: 'cut', stagger: { each: 0.05, from: 'end' } })
          .fromTo(plus, { scale: 0 }, { scale: 1, duration: 0.45, ease: 'cut' }, '-=0.35')
          .fromTo([glossL, glossR], { clipPath: function (i) { return i === 0 && c.md ? 'inset(-10% 0% -10% 100%)' : 'inset(-10% 100% -10% 0%)'; } },
            { clipPath: 'inset(-10% 0% -10% 0%)', duration: 0.6, ease: 'cut', stagger: 0.1, clearProps: 'clipPath' }, '-=0.25')
          .fromTo(para, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, '-=0.3');
        return;
      }

      /* ---- wide screens: the pinned climb ---- */
      sec.classList.add('nm--pin');
      var h2 = sec.querySelector('.nm__h');
      var gaBox = sec.querySelector('.nm__ghost--a'), gbBox = sec.querySelector('.nm__ghost--b');
      var ga = gsap.utils.toArray('b', gaBox), gb = gsap.utils.toArray('b', gbBox);
      if (chars.length !== ga.length || chars.length !== gb.length) return function () { sec.classList.remove('nm--pin'); };
      var M = null;
      function lay(el) { // layout centre, ignoring transforms, relative to the stage
        var x = 0, y = 0, e = el;
        while (e && e !== stage) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
        return { cx: x + el.offsetWidth / 2, cy: y + el.offsetHeight / 2 };
      }
      function vis(el, sr) { var r = el.getBoundingClientRect(); return { cx: r.left - sr.left + r.width / 2, cy: r.top - sr.top + r.height / 2 }; }
      function fs(el) { return parseFloat(getComputedStyle(el).fontSize); }
      function measure() {
        var sr = stage.getBoundingClientRect();
        // the column stands on the ground and reaches up to just under the heading
        var top = h2.getBoundingClientRect().bottom - sr.top + 28;
        var bottom = gaBox.getBoundingClientRect().bottom - sr.top;
        var h = Math.max(160, bottom - top);
        gbBox.style.top = top + 'px';
        gbBox.style.height = h + 'px';
        gbBox.style.fontSize = Math.min(h / 7.4, innerWidth * 0.1) + 'px';
        var base = fs(chars[0]);
        var out = { sa: fs(ga[0]) / base, sb: fs(gb[0]) / base, a: [], b: [] };
        chars.forEach(function (ch, i) {
          var p = lay(ch), qa = vis(ga[i], sr), qb = vis(gb[i], sr);
          out.a.push({ x: qa.cx - p.cx, y: qa.cy - p.cy });
          out.b.push({ x: qb.cx - p.cx, y: qb.cy - p.cy });
        });
        return out;
      }
      function m() { return M || (M = measure()); }
      function reset() { M = null; }
      ScrollTrigger.addEventListener('refreshInit', reset);

      // the top half of the pole fills while the stage slides in under the read head
      gsap.fromTo(fillA, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: sec, start: 'top center', end: 'top top', scrub: 0.3 } });

      var tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: { trigger: sec, start: 'top top', end: function () { return '+=' + Math.round(innerHeight * 2.6); }, pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1 }
      });
      // y eases out while x eases in: each letter lifts to its own height first, then
      // swings onto the pole there. Every letter travels at a different height, and the
      // ones beside the pole (A | K) leave first, so no letter ever passes over another.
      tl.fromTo(chars,
          { x: function (i) { return m().a[i].x; }, scale: function () { return m().sa; } },
          { x: function (i) { return m().b[i].x; }, scale: function () { return m().sb; }, duration: 0.9, ease: 'power2.in', stagger: { each: 0.12, from: 'center' } }, 0.2)
        .fromTo(chars,
          { y: function (i) { return m().a[i].y; } },
          { y: function (i) { return m().b[i].y; }, duration: 0.9, ease: 'power3.out', stagger: { each: 0.12, from: 'center' } }, 0.2)
        .to({}, { duration: 0.4 })
        .to(chars, { x: 0, y: 0, scale: 1, duration: 1, ease: 'power3.inOut', stagger: { each: 0.04, from: 'center' } })
        .fromTo(plus, { scale: 0 }, { scale: 1, duration: 0.35, ease: 'cut' }, '-=0.3')
        .fromTo(glossL, { clipPath: 'inset(-10% 0% -10% 100%)' }, { clipPath: 'inset(-10% 0% -10% 0%)', duration: 0.45, ease: 'cut' }, '-=0.15')
        .fromTo(glossR, { clipPath: 'inset(-10% 100% -10% 0%)' }, { clipPath: 'inset(-10% 0% -10% 0%)', duration: 0.45, ease: 'cut' }, '<')
        .fromTo(para, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.15')
        .to({}, { duration: 0.8 }); // hold the resolved name before the pin lets go
      // the bottom half fills over the whole climb: saffron runs down as the letters go up
      tl.fromTo(fillB, { scaleY: 0 }, { scaleY: 1, ease: 'none', duration: tl.duration() }, 0);

      return function () {
        ScrollTrigger.removeEventListener('refreshInit', reset);
        sec.classList.remove('nm--pin');
        gbBox.removeAttribute('style');
      };
    }
  });

  /* 02 Origins: three statements slide across the pole and lean with scroll
     speed; the milestones wipe in from the pole and their years scramble. */
  MK.mods.push({
    id: 'origins',
    order: 20,
    motion: function (c) {
      if (!c.motion) return;
      var sec = page.querySelector('#origins');
      if (!sec) return;
      var rows = gsap.utils.toArray('.og__row', sec);

      // the pole keeps filling under the read head and lands on the floor
      gsap.fromTo(sec.querySelector('.og__fill'), { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: sec, start: 'top center', end: 'bottom center', scrub: 0.3 } });
      ScrollTrigger.create({ trigger: sec, start: 'bottom center',
        onEnter: function () { sec.classList.add('og--grounded'); }, onLeaveBack: function () { sec.classList.remove('og--grounded'); } });

      // archive photo drops in from its saffron rule; the copy rises out of line masks
      gsap.fromTo(sec.querySelector('.og__photo'), { clipPath: 'inset(0% 0% 100% 0%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: 'cut', clearProps: 'clipPath',
        scrollTrigger: { trigger: sec.querySelector('.og__fig'), start: 'top 82%', once: true }
      });
      SplitText.create(sec.querySelector('.og__lead'), {
        type: 'lines', mask: 'lines', autoSplit: true,
        onSplit: function (self) {
          return gsap.from(self.lines, { yPercent: 100, duration: 0.8, ease: 'cut', stagger: 0.08,
            scrollTrigger: { trigger: sec.querySelector('.og__copy'), start: 'top 86%', once: true } });
        }
      });

      // milestones: wipe out from the pole, scramble the year like a scoreboard
      rows.forEach(function (row) {
        var yr = row.querySelector('.og__yr'), num = row.querySelector('.og__num'), fact = row.querySelector('.og__fact'), tick = row.querySelector('.og__tick');
        var txt = num.textContent;
        gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 86%', once: true } })
          .fromTo(yr, { clipPath: c.md ? 'inset(-20% 0% -20% 100%)' : 'inset(-20% 100% -20% 0%)' }, { clipPath: 'inset(-20% 0% -20% 0%)', duration: 0.6, ease: 'cut', clearProps: 'clipPath' })
          .to(num, { duration: 0.9, scrambleText: { text: txt, chars: '0123456789', speed: 0.6, revealDelay: 0.2 } }, 0)
          .fromTo(fact, { clipPath: 'inset(-10% 100% -10% 0%)' }, { clipPath: 'inset(-10% 0% -10% 0%)', duration: 0.7, ease: 'cut', clearProps: 'clipPath' }, 0.12);
        // the tick lights when the saffron fill (the read head at mid-screen) reaches it
        ScrollTrigger.create({ trigger: tick, start: 'center center',
          onEnter: function () { row.classList.add('is-on'); }, onLeaveBack: function () { row.classList.remove('is-on'); } });
      });

      // The statements live inside the h2, and the shell's stinger rebuilds that h2
      // right after this function returns, so wire them one microtask later.
      var ctx = null, dead = false;
      Promise.resolve().then(function () {
        if (dead) return;
        ctx = gsap.context(function () {
          var lines = gsap.utils.toArray('.og__line', sec);
          lines.forEach(function (line) {
            var dir = line.classList.contains('og__line--r') ? -1 : 1;
            // phones and portrait tablets: every line comes in 28px from the left, which never pushes
            // any of it past the edge of the screen; the wide sweep across the pole is for desktops
            var small = function () { return innerWidth < 768; };
            gsap.fromTo(line, { x: function () { return small() ? -28 : dir * innerWidth * 0.42; } }, {
              x: 0, ease: 'none',
              scrollTrigger: { trigger: line, start: 'top bottom', end: function () { return small() ? 'top 72%' : 'top 40%'; }, scrub: 0.5, invalidateOnRefresh: true }
            });
          });
          var skew = gsap.quickSetter(lines, 'skewX', 'deg'), proxy = { s: 0 };
          ScrollTrigger.create({
            trigger: sec, start: 'top bottom', end: 'bottom top',
            onUpdate: function (self) {
              var s = MK.util.clamp(-9, 9, self.getVelocity() / -260);
              if (Math.abs(s) > Math.abs(proxy.s)) {
                proxy.s = s;
                gsap.to(proxy, { s: 0, duration: 0.8, ease: 'power3', overwrite: true, onUpdate: function () { skew(proxy.s); } });
              }
            }
          });
        });
      });

      return function () {
        dead = true;
        if (ctx) ctx.revert();
        sec.classList.remove('og--grounded');
        rows.forEach(function (r) { r.classList.remove('is-on'); });
      };
    }
  });
  return function destroy() {};
}
