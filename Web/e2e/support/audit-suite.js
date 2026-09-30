/**
 * The audit sweep, as a function, so the phone/desktop pass and the tablet pass
 * are the same code with a different list of widths.
 *
 * Environment (read by whichever spec calls this):
 *   ROLE=judge|public|coach|player|admin|superadmin|all   which areas (default all)
 *   WIDTHS=375,820,1366                                    overrides the spec's widths
 *   AUDIT_HEIGHT=768                                       force a height (landscape)
 *   APPEARANCE=dark|light|both                             see responsive-audit.js
 */

import { test } from '@playwright/test';
import { signInAs, ROUTES_BY_AREA } from './audit-routes.js';
import { APPEARANCES, applyAppearance, auditRoute, watchConsole, widthsFor } from './responsive-audit.js';

const ROLE = process.env.ROLE || 'all';

const parseWidths = (raw) => raw.split(',').map((w) => Number(w.trim())).filter(Boolean);

/** Print one area's findings as a report a human can act on. */
const report = (area, widths, findings, consoleErrors) => {
  const lines = [
    `\n${'='.repeat(72)}\n  ${area.toUpperCase()}  (widths: ${widths.join(', ')}; appearance: ${APPEARANCES.join(' + ')})\n${'='.repeat(72)}`,
  ];

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
        const scheme = APPEARANCES.length > 1 ? ` ${f.appearance}` : '';
        lines.push(`    @${f.width}px${scheme}  ${bits.join(' | ')}`);
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

/**
 * Declare one `test` per area.
 *
 * @param {{label: string, widths: number[]}} options
 *   `label` names the sweep in the test title; `widths` is the default list,
 *   which `WIDTHS=` replaces.
 */
export const defineAuditSuite = ({ label, widths: defaultWidths }) => {
  const widths = process.env.WIDTHS ? parseWidths(process.env.WIDTHS) : defaultWidths;

  for (const [area, config] of Object.entries(ROUTES_BY_AREA)) {
    const shouldRun = ROLE === 'all' || ROLE === area;
    test(`${label}: ${area}`, async ({ page }, testInfo) => {
      test.skip(!shouldRun, `ROLE=${ROLE}`);
      test.setTimeout(25 * 60_000 * APPEARANCES.length);

      const runWidths = widthsFor(testInfo, widths);
      const errors = watchConsole(page);
      const findings = [];
      for (const appearance of APPEARANCES) {
        await applyAppearance(page, appearance);
        // Signing in once per appearance is cheap next to the sweep, and keeps
        // each appearance's run independent of the other's session state.
        if (config.login) await signInAs(page, area);
        for (const route of config.routes) {
          findings.push(...(await auditRoute(page, route, runWidths, appearance)));
        }
      }
      report(`${area} [${testInfo.project.name}]`,
        runWidths.map((w) => w ?? page.viewportSize()?.width), findings, errors());
    });
  }
};
