/**
 * Keyboard focus is visible on every stop (plan §23, WCAG 2.4.7).
 *
 * Tabs through each screen and, for every element that takes focus, compares
 * it focused against unfocused: an outline, a box-shadow ring or a border
 * colour that changes counts as visible. Anything that looks the same both
 * ways is reported.
 *
 *   ROLE=public FOCUS_STOPS=25 npx playwright test e2e/focus-visible.spec.js --project=chromium
 */
import { test, expect } from '@playwright/test';
import { ROUTES_BY_AREA, signInAs } from './support/audit-routes.js';
import { applyAppearance, settle } from './support/responsive-audit.js';

const ROLE = process.env.ROLE || 'all';
const STOPS = Number(process.env.FOCUS_STOPS || 25);
const APPEARANCES = process.env.APPEARANCE === 'both' ? ['dark', 'light'] : [process.env.APPEARANCE === 'light' ? 'light' : 'dark'];

const look = (el) => {
  const cs = getComputedStyle(el);
  return {
    outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` : '',
    shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow,
    border: `${cs.borderTopColor} ${cs.borderBottomColor}`,
    bg: cs.backgroundColor,
  };
};

for (const [area, config] of Object.entries(ROUTES_BY_AREA)) {
  test(`focus visible: ${area}`, async ({ page }) => {
    test.skip(ROLE !== 'all' && ROLE !== area, `ROLE=${ROLE}`);
    test.setTimeout(20 * 60_000);
    const lines = []; const invisible = [];
    for (const appearance of APPEARANCES) {
      await applyAppearance(page, appearance);
      await page.setViewportSize({ width: 1366, height: 900 });
      if (config.login) await signInAs(page, area);
      for (const route of config.routes) {
        await page.goto(route.url);
        await settle(page);
        if (route.prepare) await route.prepare(page).catch(() => {});
        await page.locator('body').click({ position: { x: 1, y: 1 } }).catch(() => {});
        const seen = new Set(); let checked = 0;
        for (let i = 0; i < STOPS; i++) {
          await page.keyboard.press('Tab');
          const result = await page.evaluate((lookSrc) => {
            // eslint-disable-next-line no-new-func
            const lookFn = new Function(`return (${lookSrc})`)();
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const id = `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}|${(el.id || el.getAttribute('name') || el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}`;
            const focused = lookFn(el);
            el.blur();
            const plain = lookFn(el);
            el.focus();
            const same = focused.outline === plain.outline && focused.shadow === plain.shadow && focused.border === plain.border && focused.bg === plain.bg;
            return { id, visible: !same && (focused.outline || focused.shadow !== plain.shadow || focused.border !== plain.border || focused.bg !== plain.bg) };
          }, look.toString());
          if (!result || seen.has(result.id)) continue;
          seen.add(result.id); checked += 1;
          if (!result.visible) invisible.push(`${route.name} [${appearance}]: ${result.id}`);
        }
        lines.push(`  ${route.name} [${appearance}]: ${checked} stops`);
      }
    }
    console.log(`\n===== focus visible: ${area} =====\n${lines.join('\n')}${invisible.length ? `\n  INVISIBLE:\n    ${invisible.join('\n    ')}` : '\n  every stop shows focus'}`);
    expect(invisible).toEqual([]);
  });
}
