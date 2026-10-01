/**
 * Edge cases, by rewriting what the API says (plan Phase 11): the layout must
 * survive data the seed never has. Read-only — every change happens in the
 * browser's copy of a response; the database is never touched.
 *
 * Scenarios (EDGE_CASES=long,empty,slow,failed; default all):
 *   long    every name-like string gains a long unbroken word and a long phrase
 *   empty   every list in a response becomes empty
 *   slow    every data request waits 2.5 s (loading states, then the screen)
 *   failed  every data request answers 500 (error states, no uncaught throw)
 *
 * Each screen is checked at 375 and 1366 (EDGE_WIDTHS) for sideways scroll,
 * elements running past the viewport, and uncaught page errors.
 *
 *   ROLE=admin EDGE_CASES=long npx playwright test e2e/edge-cases.spec.js --project=chromium
 */
import { test, expect } from '@playwright/test';
import { ROUTES_BY_AREA, signInAs } from './support/audit-routes.js';
import { measurePage, settle } from './support/responsive-audit.js';

const ROLE = process.env.ROLE || 'all';
const CASES = (process.env.EDGE_CASES || 'long,empty,slow,failed').split(',');
const WIDTHS = (process.env.EDGE_WIDTHS || '375,1366').split(',').map(Number);
// The data screens; choosers and sign-in forms have no data worth distorting.
const SKIP = /select-(level|competition)|login|register|password|no-such-page/;
// Never distort the session itself, or nothing past sign-in would render at all.
const ESSENTIAL = /\/api\/(csrf-token|auth\/|.*\/login|.*\/me\b|.*\/profile\b|.*\/competitions\b|.*\/assignments\b|public\/cop-rules)/;

const NAME_KEY = /^(name|firstName|lastName|teamName|title|description|coachName|email|label|place|venue|city)$/i;
const LONG_WORD = 'Mahamahopadhyaya-Shrimanyadeshpande';
const lengthen = (node) => {
  if (Array.isArray(node)) return node.map(lengthen);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [
    k, typeof v === 'string' && NAME_KEY.test(k) && v.length > 0 ? `${v} ${LONG_WORD} Venkatasubramanian Raghunathan` : lengthen(v),
  ]));
};
const emptyLists = (node) => {
  if (Array.isArray(node)) return [];
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, emptyLists(v)]));
};

const distort = async (page, scenario) => {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (ESSENTIAL.test(url) || route.request().method() !== 'GET') return route.continue().catch(() => {});
    try {
      if (scenario === 'failed') {
        return await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Edge-case test: the server failed this request on purpose.' }) });
      }
      if (scenario === 'slow') {
        await new Promise((r) => setTimeout(r, 2_500));
        return await route.continue();
      }
      const response = await route.fetch();
      const body = await response.json().catch(() => null);
      if (!body) return await route.fulfill({ response });
      const next = scenario === 'long' ? lengthen(body) : emptyLists(body);
      return await route.fulfill({ response, body: JSON.stringify(next) });
    } catch {
      return route.continue().catch(() => {});
    }
  });
};

for (const [area, config] of Object.entries(ROUTES_BY_AREA)) {
  for (const scenario of CASES) {
    test(`edge (${scenario}): ${area}`, async ({ page }) => {
      test.skip(ROLE !== 'all' && ROLE !== area, `ROLE=${ROLE}`);
      test.setTimeout(10 * 60_000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
      if (config.login) await signInAs(page, area);
      await distort(page, scenario);
      const lines = [];
      for (const route of config.routes.filter((r) => !SKIP.test(r.url))) {
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
          await page.goto(route.url);
          await settle(page);
          if (scenario === 'slow') await page.waitForTimeout(3_000);
          if (route.prepare) await route.prepare(page).catch(() => {});
          const m = await measurePage(page, { checkTouchTargets: false });
          const bad = m.horizontalScroll || m.overflowing.length;
          // Proof the distortion reached the screen, so an "ok" means something.
          const shown = scenario === 'long' ? ((await page.locator('body').innerText()).includes(LONG_WORD) ? ' [long names shown]' : ' [no long name on screen]') : '';
          lines.push(`  ${route.name} @${width}: ${bad ? `SIDEWAYS ${m.scrollWidth}>${m.clientWidth} ${m.overflowing.slice(0, 3).map((o) => `↔ ${o.el} (+${o.overhang})`).join(' ')}` : 'ok'}${shown}`);
        }
      }
      /*
       * The score lists and the sheet only show names once a category is chosen,
       * so for long names walk Admin Scores to the published 5-judge category,
       * measure the team list, then open a team's sheet.
       */
      if (area === 'admin' && scenario === 'long') {
        const choose = async (label, name) => {
          await page.locator('label', { hasText: label }).first().locator('xpath=following-sibling::*[1]')
            .locator('button[aria-haspopup="listbox"]').click();
          await page.getByRole('option', { name }).first().click();
          await page.waitForTimeout(500);
        };
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
          await page.goto('/admin/dashboard/scores');
          await settle(page);
          for (const [label, name] of [[/^Gender/, /^Female$/], [/^Age Group/, /Above ?16/i], [/^Competition Type/, /^Competition I\b(?!I)/], [/^Apparatus/, /Rope/i]]) {
            await choose(label, name);
          }
          await page.getByText(/View Details/).first().waitFor({ timeout: 30_000 });
          for (const [step, go] of [['team list', async () => {}], ['score sheet', async () => {
            await page.getByText(/View Details/).first().click();
            await page.locator('input[inputmode="decimal"]').first().waitFor({ timeout: 30_000 });
            await settle(page);
          }]]) {
            await go();
            const m = await measurePage(page, { checkTouchTargets: false });
            const shown = (await page.locator('body').innerText()).includes(LONG_WORD) ? ' [long names shown]' : ' [no long name on screen]';
            const bad = m.horizontalScroll || m.overflowing.length;
            lines.push(`  Admin scores → ${step} @${width}: ${bad ? `SIDEWAYS ${m.scrollWidth}>${m.clientWidth} ${m.overflowing.slice(0, 3).map((o) => `↔ ${o.el} (+${o.overhang})`).join(' ')}` : 'ok'}${shown}`);
          }
        }
      }

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      console.log(`\n===== edge (${scenario}): ${area} =====\n${lines.join('\n')}${errors.length ? `\n  page errors: ${errors.join(' | ')}` : ''}`);
      expect(lines.filter((l) => /SIDEWAYS/.test(l)), 'layout broke on distorted data').toEqual([]);
      expect(errors, 'uncaught page errors').toEqual([]);
    });
  }
}
