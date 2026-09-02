/**
 * Viewport-sized screenshots taken while scrolling a page.
 *
 * `fullPage: true` is useless on the marketing pages: their sections reveal on
 * `useInView`, and a full-page capture never scrolls, so everything below the
 * fold photographs as empty. This walks down a screen at a time, letting each
 * section animate in before it is shot, and reports the page's total height so
 * a mobile layout that is merely a stretched desktop one is obvious.
 *
 *   SCROLL_URL=/ SCROLL_WIDTH=375 npx playwright test e2e/responsive-scroll-shots.spec.js
 */

import { test } from '@playwright/test';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { measurePage, settle } from './support/responsive-audit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../test-results/shots');

const URL_PATH = process.env.SCROLL_URL || '/';
const WIDTH = Number(process.env.SCROLL_WIDTH || 375);
const LABEL = process.env.SCROLL_LABEL || URL_PATH.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
const MAX_PANELS = Number(process.env.SCROLL_PANELS || 10);

test(`scroll shots: ${URL_PATH} @ ${WIDTH}px`, async ({ page }) => {
  test.setTimeout(10 * 60_000);
  mkdirSync(OUT, { recursive: true });

  const height = WIDTH < 768 ? 812 : 900;
  await page.setViewportSize({ width: WIDTH, height });
  await page.goto(URL_PATH, { waitUntil: 'domcontentloaded' });
  await settle(page);

  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`${URL_PATH} @${WIDTH}px — scrollHeight ${total}px (${(total / height).toFixed(1)} screens)`);

  const panels = Math.min(Math.ceil(total / height), MAX_PANELS);
  for (let i = 0; i < panels; i += 1) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), i * height);
    // Long enough for the in-view transitions to finish before the shutter.
    await page.waitForTimeout(900);
    await page.screenshot({ path: resolve(OUT, `scroll-${LABEL}-${WIDTH}-${String(i).padStart(2, '0')}.png`) });
  }
  console.log(`captured ${panels} panels`);

  // Measure at the bottom too: sticky bars and footers only exist down here.
  const m = await measurePage(page, { checkTouchTargets: WIDTH < 768 });
  if (m.horizontalScroll) console.log(`SIDEWAYS SCROLL ${m.scrollWidth} > ${m.clientWidth}`);
  for (const o of m.overflowing.slice(0, 5)) console.log(`  ↔ ${o.el} (+${o.overhang})`);
  for (const t of m.tinyTargets.slice(0, 6)) console.log(`  ⊙ ${t.el} ${t.w}x${t.h} "${t.text}"`);
});
