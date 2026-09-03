/**
 * The measuring tape for the mobile adaptation work.
 *
 * The in-app preview browser cannot be trusted for this: it emulates a 375px
 * body while `window.innerWidth` still reports the pane's real width, so every
 * `position: fixed` overlay — the modals and drawers this work is mostly about
 * — lays out against the wrong number and reads as broken when it is fine.
 * Playwright sets a real viewport, so `fixed` and `100vw` resolve honestly.
 *
 * Diagnostic only. Unlike the rest of `e2e/`, nothing here writes to the
 * database; it navigates, measures and reports.
 */

/** The phone widths named in the brief, plus the desktop baselines to protect. */
export const MOBILE_WIDTHS = [320, 360, 375, 390, 414, 430];
export const DESKTOP_WIDTHS = [1366, 1440, 1920];

/**
 * Heights are incidental to overflow, but a realistic one keeps sticky bars
 * honest.
 *
 * `AUDIT_HEIGHT` forces one, which is how the landscape pass is run: a phone
 * turned sideways is ~812x375, and at that height a sticky header plus a
 * sticky action bar can leave almost nothing between them. Passing the width
 * alone would be measured as a small desktop and miss it entirely.
 */
export const heightFor = (width) =>
  (process.env.AUDIT_HEIGHT ? Number(process.env.AUDIT_HEIGHT) : (width < 768 ? 812 : 900));

/**
 * Elements the audit should not scold.
 *
 * A horizontally scrolling strip is a legitimate mobile pattern when it is
 * DELIBERATE (a chip row, a scoring keypad) — the brief only forbids it as a
 * lazy substitute for layout. Marking the container opts it out, so the report
 * stays a list of real defects instead of a list to remember to ignore.
 */
const OPT_OUT_ATTR = 'data-allow-overflow';

/**
 * Measure one rendered page.
 *
 * Runs in the browser. Returns plain data so the caller can aggregate across
 * viewports without holding handles.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{checkTouchTargets?: boolean}} [options]
 */
export const measurePage = async (page, { checkTouchTargets = true } = {}) =>
  page.evaluate(
    ({ optOutAttr, wantTouch }) => {
      const de = document.documentElement;
      const vw = window.innerWidth;

      const describe = (el) => {
        const cls = (el.className && el.className.baseVal !== undefined
          ? el.className.baseVal
          : el.className || '').toString();
        return [
          el.tagName.toLowerCase(),
          el.id ? `#${el.id}` : '',
          cls ? `.${cls.trim().split(/\s+/).slice(0, 6).join('.')}` : '',
        ].join('').slice(0, 160);
      };

      /**
       * Inside a container that opted out, that scrolls on purpose, or that
       * clips.
       *
       * `hidden` counts. `getBoundingClientRect` reports geometry BEFORE
       * clipping, so a decorative blur inside an `overflow-hidden` layer still
       * measures as hanging past the edge while being neither visible there nor
       * able to extend the document. Without this the ambient background reads
       * as a defect on every page forever. The page-level `horizontalScroll`
       * flag remains the authoritative check.
       */
      const excused = (el) => {
        for (let p = el; p && p !== document.body; p = p.parentElement) {
          if (p.hasAttribute?.(optOutAttr)) return true;
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        }
        return false;
      };

      const overflowing = [];
      const seen = new Set();
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // 1px of slack: sub-pixel layout rounding is not a defect.
        if (r.right <= vw + 1 && r.left >= -1) continue;
        if (excused(el)) continue;
        /*
         * Hanging off the LEFT edge is only a finding for something you could
         * have needed to see. Overflow to the left never extends the document
         * in a left-to-right page, so a decoration parked out there — the
         * cursor glow waits at -400,-400 until the pointer first moves — costs
         * nothing and is not a defect to chase.
         */
        if (r.right <= vw + 1 && getComputedStyle(el).pointerEvents === 'none') continue;
        const key = describe(el);
        if (seen.has(key)) continue;
        seen.add(key);
        overflowing.push({
          el: key,
          width: Math.round(r.width),
          left: Math.round(r.left),
          right: Math.round(r.right),
          overhang: Math.round(Math.max(r.right - vw, -r.left)),
        });
      }

      const tinyTargets = [];
      if (wantTouch) {
        const interactive =
          'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link], [tabindex]:not([tabindex="-1"])';
        const tseen = new Set();
        for (const el of document.querySelectorAll(interactive)) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue; // not rendered
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          /*
           * A visually-hidden input is not a tap target — it is the accessible
           * half of a styled control whose LABEL is what a finger hits. The
           * combination checklist is built this way, so every checkbox on it
           * reported as a 1x1 failure.
           */
          if (el.classList.contains('sr-only') || (cs.clip === 'rect(0px, 0px, 0px, 0px)')) continue;
          if (el.labels?.length && [...el.labels].some((l) => l.getBoundingClientRect().height >= 43.5)) continue;
          /*
           * 44px per WCAG 2.5.5 / the project's own TOUCH_TARGET.minimum,
           * less half a pixel. Percentage-width controls land on heights like
           * 43.99 that report as "44x44 is too small" once rounded for the
           * report — the same sub-pixel slack the overflow check above allows.
           */
          if (r.height >= 43.5 && r.width >= 43.5) continue;
          // Inline links inside a paragraph are text, not tap targets.
          if (el.tagName === 'A' && el.closest('p')) continue;
          const key = describe(el);
          if (tseen.has(key)) continue;
          tseen.add(key);
          tinyTargets.push({
            el: key,
            w: Math.round(r.width),
            h: Math.round(r.height),
            text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
          });
        }
      }

      return {
        viewport: vw,
        scrollWidth: de.scrollWidth,
        clientWidth: de.clientWidth,
        // The headline check: does the PAGE scroll sideways?
        horizontalScroll: de.scrollWidth > de.clientWidth + 1,
        overflowing: overflowing.sort((a, b) => b.overhang - a.overhang).slice(0, 12),
        tinyTargets: tinyTargets.slice(0, 12),
      };
    },
    { optOutAttr: OPT_OUT_ATTR, wantTouch: checkTouchTargets }
  );

/**
 * Collect console errors for the life of a page.
 * Returns a getter; call it after the navigation settles.
 *
 * @param {import('@playwright/test').Page} page
 */
export const watchConsole = (page) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Vite's dev overlay and favicon 404s are noise, not app defects.
    if (/favicon|\[vite\]|Download the React DevTools/i.test(text)) return;
    errors.push(text.slice(0, 200));
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`.slice(0, 200)));
  return () => errors;
};

/**
 * Let the page settle before measuring.
 *
 * `networkidle` alone is not enough: framer-motion animates entrances, and a
 * card measured mid-transform reports a transient width that is not a bug.
 *
 * @param {import('@playwright/test').Page} page
 */
export const settle = async (page) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(700);
};

/**
 * Render one page at every requested width and report what broke.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{name: string, url: string, prepare?: (page) => Promise<void>}} route
 * @param {number[]} widths
 * @returns {Promise<Array<object>>}
 */
export const auditRoute = async (page, route, widths) => {
  const findings = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: heightFor(width) });
    await page.goto(route.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await settle(page);
    if (route.prepare) await route.prepare(page).catch(() => {});
    await page.waitForTimeout(250);

    const result = await measurePage(page, { checkTouchTargets: width < 768 });
    if (result.horizontalScroll || result.overflowing.length || result.tinyTargets.length) {
      findings.push({ route: route.name, url: route.url, width, ...result });
    }
  }
  return findings;
};
