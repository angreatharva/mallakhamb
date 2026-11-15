/*
 * Build-time feature flags.
 *
 * COACH_PAPER_FORM_ENABLED — the coach's own "Scan Paper Form" (dashboard
 * button + /coach/paper-form). OFF unless the build sets
 * VITE_COACH_PAPER_FORM=1; the server has the matching
 * COACH_PAPER_FORM_ENABLED. The admin / super admin walk-in desk (pages/desk)
 * is a separate surface and is never behind this flag.
 */
export const COACH_PAPER_FORM_ENABLED = import.meta.env.VITE_COACH_PAPER_FORM === '1';
