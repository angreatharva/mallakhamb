/**
 * The tablet-band sweep: 768, 820, 834 and 1024, portrait by default.
 *
 * Same routes, same measurements and same report as `responsive-audit.spec.js`
 * — the difference is that touch targets are measured here, because a tablet
 * is a finger device that has been getting desktop metrics.
 *
 *   npm run audit:tablet
 *   ROLE=judge npx playwright test e2e/responsive-tablet.spec.js
 *   AUDIT_HEIGHT=768 WIDTHS=1024 npx playwright test e2e/responsive-tablet.spec.js   # iPad landscape
 *   E2E_WEBKIT=1 npx playwright test e2e/responsive-tablet.spec.js --project=ipad-mini
 */

import { defineAuditSuite } from './support/audit-suite.js';
import { TABLET_WIDTHS } from './support/responsive-audit.js';

defineAuditSuite({ label: 'tablet audit', widths: TABLET_WIDTHS });
