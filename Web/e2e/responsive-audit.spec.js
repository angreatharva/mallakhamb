/**
 * Responsive audit sweep — reports, never fixes, and never writes.
 *
 * Walks every route of every role at the phone widths named in the brief and
 * at the desktop baselines that must not regress, and prints what overflows,
 * what is too small to tap, and what logged an error.
 *
 * Run one area at a time:
 *   ROLE=judge npx playwright test e2e/responsive-audit.spec.js
 *   ROLE=all WIDTHS=375,1440 npx playwright test e2e/responsive-audit.spec.js
 *
 * Read-only, so unlike the seeding specs it is safe to re-run at will — but it
 * still signs in as real seeded accounts, so point it at a local stack.
 */

import { test } from '@playwright/test';
import { signInAs, ROUTES_BY_AREA } from './support/audit-routes.js';
import {
  MOBILE_WIDTHS,
  DESKTOP_WIDTHS,
  auditRoute,
  watchConsole,
} from './support/responsive-audit.js';

const ROLE = process.env.ROLE || 'all';
const WIDTHS = process.env.WIDTHS
  ? process.env.WIDTHS.split(',').map((w) => Number(w.trim()))
  : [...MOBILE_WIDTHS, ...DESKTOP_WIDTHS];

/** Print one area's findings as a report a human can act on. */
const report = (area, findings, consoleErrors) => {
  const lines = [`\n${'='.repeat(72)}\n  ${area.toUpperCase()}  (widths: ${WIDTHS.join(', ')})\n${'='.repeat(72)}`];

  if (!findings.length) {
    lines.push('  No overflow or touch-target findings.');
  } else {
    // Group by route so one broken component reads as one problem.
    const byRoute = new Map();
    for (const f of findings) {
      if (!byRoute.has(f.route)) byRoute.set(f.route, []);
      byRoute.get(f.route).push(f);
    }
    for (const [route, list] of byRoute) {
      lines.push(`\n  ${route}  [${list[0].url}]`);
      for (const f of list) {
        const bits = [];
        if (f.horizontalScroll) bits.push(`PAGE SCROLLS SIDEWAYS (${f.scrollWidth} > ${f.clientWidth})`);
        if (f.overflowing.length) bits.push(`${f.overflowing.length} overflowing`);
        if (f.tinyTargets.length) bits.push(`${f.tinyTargets.length} small targets`);
        lines.push(`    @${f.width}px  ${bits.join(' | ')}`);
        for (const o of f.overflowing.slice(0, 4)) {
          lines.push(`        ↔ ${o.el}  w=${o.width} right=${o.right} (+${o.overhang})`);
        }
        for (const t of f.tinyTargets.slice(0, 6)) {
          lines.push(`        ⊙ ${t.el}  ${t.w}x${t.h}  "${t.text}"`);
        }
      }
    }
  }

  if (consoleErrors.length) {
    lines.push(`\n  Console errors (${consoleErrors.length}):`);
    for (const e of [...new Set(consoleErrors)].slice(0, 8)) lines.push(`    ✖ ${e}`);
  }
  console.log(lines.join('\n'));
};

for (const [area, config] of Object.entries(ROUTES_BY_AREA)) {
  const shouldRun = ROLE === 'all' || ROLE === area;
  test(`responsive audit: ${area}`, async ({ page }) => {
    test.skip(!shouldRun, `ROLE=${ROLE}`);
    test.setTimeout(25 * 60_000);

    const errors = watchConsole(page);
    if (config.login) await signInAs(page, area);

    const findings = [];
    for (const route of config.routes) {
      findings.push(...(await auditRoute(page, route, WIDTHS)));
    }
    report(area, findings, errors());
  });
}
