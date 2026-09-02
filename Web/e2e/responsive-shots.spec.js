/**
 * Full-page screenshots at a chosen width, for looking at the result.
 *
 * The overflow audit next door answers "is anything broken"; this answers "does
 * it look like it was designed for this screen", which no assertion can. Same
 * logins and the same route list, so the two stay in step.
 *
 *   SHOT_ROLE=judge SHOT_WIDTH=375 npx playwright test e2e/responsive-shots.spec.js
 *
 * Writes to Web/test-results/shots/. Read-only against the app.
 */

import { test } from '@playwright/test';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { signInAs, ROUTES_BY_AREA } from './support/audit-routes.js';
import { settle } from './support/responsive-audit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../test-results/shots');

const AREA = process.env.SHOT_ROLE || 'judge';
const WIDTH = Number(process.env.SHOT_WIDTH || 375);
const ONLY = process.env.SHOT_ONLY ? new RegExp(process.env.SHOT_ONLY, 'i') : null;

test(`screenshots: ${AREA} @ ${WIDTH}px`, async ({ page }) => {
  test.setTimeout(15 * 60_000);
  mkdirSync(OUT, { recursive: true });

  const area = ROUTES_BY_AREA[AREA];
  await page.setViewportSize({ width: WIDTH, height: WIDTH < 768 ? 812 : 900 });
  if (area.login) await signInAs(page, AREA);

  for (const route of area.routes) {
    if (ONLY && !ONLY.test(route.name)) continue;
    await page.goto(route.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await settle(page);
    if (route.prepare) await route.prepare(page).catch(() => {});
    await page.waitForTimeout(400);

    const slug = `${AREA}-${WIDTH}-${route.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    await page.screenshot({ path: resolve(OUT, `${slug}.png`), fullPage: true });
    console.log(`shot: ${slug}.png`);
  }
});
