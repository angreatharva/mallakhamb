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
 *   ROLE=public APPEARANCE=both npx playwright test e2e/responsive-audit.spec.js
 *
 * The tablet band has its own sweep (`npm run audit:tablet`).
 *
 * Read-only, so unlike the seeding specs it is safe to re-run at will — but it
 * still signs in as real accounts, so point it at a local stack. See
 * `support/audit-routes.js` for which accounts and how to override them.
 */

import { defineAuditSuite } from './support/audit-suite.js';
import { MOBILE_WIDTHS, DESKTOP_WIDTHS } from './support/responsive-audit.js';

defineAuditSuite({ label: 'responsive audit', widths: [...MOBILE_WIDTHS, ...DESKTOP_WIDTHS] });
