---
doc: 00-INDEX
covers:
  - Web/**
read_when: "always — the entry point for any change in Web/"
depends_on: []
verified_against_commit: cd66189
last_verified: 2026-10-11
---

# MEMORY — router

**What this is.** A React 19.1 + Vite 7 SPA for the same Mallakhamb
gymnastics competition platform `Server/MEMORY` documents — registration
+ Razorpay payment, live judge-panel scoring over HTTP and Socket.IO,
running-order/lot draw, and public results. Five roles — player, coach,
admin, superadmin, judge. Not TypeScript. Deployed as a static build,
separately from the API (different origin — this is why CSRF matters
and why `document.cookie` can't be used to read the CSRF token). Verified
against commit `f0bdc1d`, 2026-09-23.

## Read order for a cold agent (only 3 docs)

1. **[SHARED-CONTRACTS.md](SHARED-CONTRACTS.md)** — the single most
   important doc in this tree. This is a monorepo with two independent
   implementations of the same scoring/fee/lock rules; only 3 of 8
   duplicated pairs have an automated drift test. Read this before
   touching anything that computes a number that gets saved.
2. **[01-ARCHITECTURE.md](01-ARCHITECTURE.md)** — the app shell, and a
   correction of several stale version/dependency claims made by other
   project docs (`README.md` especially). Read this before trusting
   `README.md`'s stack table.
3. **[GOTCHAS.md](GOTCHAS.md)** — dead code, stale docs, real
   previously-shipped bugs kept as precedent, and unguarded duplication.
   Read before trusting any single file's comments at face value.

## Folder map

| Path | Purpose |
|---|---|
| `src/App.jsx`, `src/main.jsx` | The provider chain and app shell — [01-ARCHITECTURE.md](01-ARCHITECTURE.md) |
| `src/routes/` | Route tree, per-role layouts, lazy imports — [03-ROUTING-AND-NAV.md](03-ROUTING-AND-NAV.md) |
| `src/contexts/` | Auth, Route, Competition context/providers — [04-STATE-MANAGEMENT.md](04-STATE-MANAGEMENT.md), [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md) |
| `src/services/` | axios client + per-domain API modules — [08-API-INTEGRATION.md](08-API-INTEGRATION.md) |
| `src/utils/scoring/`, `src/utils/ordering/`, `src/utils/competition/` | Client/server duplicated domain math — [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md), [11-SCORING-CLIENT.md](11-SCORING-CLIENT.md) |
| `src/utils/auth/` | Token storage, cross-tab sync, path↔role mapping — [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md) |
| `src/styles/`, `eslint-rules/`, `tailwind.config.js`, `src/components/design-system/` | Design tokens (3-4 independent copies — read before editing) — [05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md) |
| `src/components/responsive/` | Layout primitives, mostly dead — [12-RESPONSIVE.md](12-RESPONSIVE.md) |
| `src/components/` (everything else) | Shared, non-design-system, non-responsive components — [07-COMPONENTS.md](07-COMPONENTS.md) |
| `src/validators/` | zod schemas (mostly unused — see the doc) — [13-FORMS-AND-VALIDATION.md](13-FORMS-AND-VALIDATION.md) |
| `src/pages/admin/`, `src/pages/judge/`, `src/pages/coach/`, `src/pages/player/`, `src/pages/superadmin/`, `src/pages/unified/`, `src/pages/public/` | Individual screens, one doc per file >15KB — [06-SCREENS/](06-SCREENS/) |
| `src/setupTests.js`, `**/*.test.{js,jsx}` | vitest unit tests — [14-TESTING.md](14-TESTING.md) |
| `e2e/`, `playwright.config.js` | Dual-purpose Playwright test **and seeding** harness — writes to a real DB, read the safety notes — [15-E2E-AND-SEEDING.md](15-E2E-AND-SEEDING.md) |
| `vite.config.js`, `postcss.config.js`, `eslint.config.js`, `package.json` | Build/lint/test config, no CI pipeline exists — [16-BUILD-AND-CONFIG.md](16-BUILD-AND-CONFIG.md), [02-CONVENTIONS.md](02-CONVENTIONS.md) |

## "I need to do X — what do I open?"

| Task | Read these MEMORY docs | Then open |
|---|---|---|
| Add a new screen for an existing role | `CHANGE-RECIPES.md#add-role-screen`, [03-ROUTING-AND-NAV.md](03-ROUTING-AND-NAV.md) | `src/routes/index.jsx`, `src/routes/lazy-pages.js` |
| Add or change an API call | `CHANGE-RECIPES.md#add-endpoint-call`, [08-API-INTEGRATION.md](08-API-INTEGRATION.md) | the domain's `src/services/**/*.api.js` |
| Change scoring/fee/lock math | `CHANGE-RECIPES.md#change-scoring-math`, [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md) | `src/utils/scoring/*.js` **and** the `Server/` counterpart, same commit |
| Change the judge slip / mismatch review flow | [11-SCORING-CLIENT.md](11-SCORING-CLIENT.md), [06-SCREENS/judge-scoring.md](06-SCREENS/judge-scoring.md), [06-SCREENS/judge-panel-review.md](06-SCREENS/judge-panel-review.md) | `src/pages/judge/{JudgeScoring,JudgePanelReview,judgeShared,useJudgePanelData}.js*` |
| Add a socket event | `CHANGE-RECIPES.md#add-socket-event`, [09-REALTIME.md](09-REALTIME.md) | `Server/src/socket/events/event-types.js`, the relevant judge/admin screen |
| Add a form | `CHANGE-RECIPES.md#add-form`, [13-FORMS-AND-VALIDATION.md](13-FORMS-AND-VALIDATION.md) | the relevant screen; check `form.validator.js` first, most forms don't use it |
| Change a color/spacing/breakpoint | `CHANGE-RECIPES.md#change-design-tokens`, [05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md), [02-CONVENTIONS.md](02-CONVENTIONS.md) (colour literals are a lint **error**) | `src/styles/looks/{contract,prime-time}.js` → `npm run looks`, `src/styles/breakpoints.js`, `src/styles/tokens.js` (`FG`/`DATA_COLORS`) |
| Change a judge screen's header / the slip's look | [06-SCREENS/judge-shared.md](06-SCREENS/judge-shared.md), [07-COMPONENTS.md](07-COMPONENTS.md) | `JudgeHeader` in `src/pages/judge/judgeShared.jsx` (keep its ref — the slip pins its score bar off it), `src/components/shell/shell.css` |
| Prepare the SPA for the move off Render | [GOTCHAS.md](GOTCHAS.md) ("Open blockers for moving production off Render"), [09-REALTIME.md](09-REALTIME.md) | the 7 `replace('/api'` socket sites, CSP `connect-src` in `index.html`; plan in repo-root `deploy/COMMON.md` (C1.1, C1.2) |
| Light/Dark, or anything that must read in both appearances | [05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md) | `src/utils/ui/appearance.js`, `public/appearance-init.js`, `src/contexts/AppearanceProvider.jsx`, `src/components/layout/AppearanceMenu.jsx` |
| Restyle screens / the site-wide design language | `docs/design-language/LOOKS.md` (the playbook), `REPORT.md` (what's done/left), [05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md) | `src/styles/looks/*` — a restyle is a pack edit; prime-time is the only look |
| Change the landing page | [06-SCREENS/public-home-and-scores.md](06-SCREENS/public-home-and-scores.md), `docs/homepage/README.md` | `src/pages/public/Home.jsx`, `src/pages/public/home/**`; verify with `npm run audit:home` |
| Change password reset | [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md#password-reset--otp-only-scoped-to-the-login-page-it-came-from) | `src/pages/shared/{ForgotPassword,ResetPassword,resetPortal}.*`, `src/services/auth/auth.api.js` |
| Fix a horizontal-scroll or touch-target bug | [12-RESPONSIVE.md](12-RESPONSIVE.md) | measure with the Playwright audits, never the in-app preview; the shared primitives (`.tap-safe`, `mouse:`, `.modal-panel`, `.stacked-table`) live in `tailwind.config.js` |
| Change login/logout/session/cross-tab behavior | [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md) | `src/contexts/AuthProvider.jsx`, `src/utils/auth/**`, `src/middleware/protected-route.jsx` |
| Change competition selection or the level/competition chooser | [04-STATE-MANAGEMENT.md](04-STATE-MANAGEMENT.md), [06-SCREENS/](06-SCREENS/) competition-selection docs | `src/contexts/CompetitionContext.jsx` — read the auto-select race section before touching the mount effect |
| Run or add a seed/e2e script | `CHANGE-RECIPES.md#run-seed-or-e2e-script`, [15-E2E-AND-SEEDING.md](15-E2E-AND-SEEDING.md) | `e2e/support/**`, `e2e/*.spec.js`, `package.json`'s `seed:*` scripts — **read the blast-radius table first** |
| Write a vitest test | [14-TESTING.md](14-TESTING.md) | the matching subsystem's existing `*.test.js` for a pattern to copy — no shared render helper exists |
| Debug a payment flow | [06-SCREENS/coach-payment.md](06-SCREENS/coach-payment.md), [06-SCREENS/superadmin-add-player-payment.md](06-SCREENS/superadmin-add-player-payment.md) | the specific screen — these two Razorpay integrations are independent, not shared |
| Check whether a README/doc claim is trustworthy | [GOTCHAS.md](GOTCHAS.md) | — `README.md`, `docs/architecture.md`, and especially `docs/web-guide.md` have confirmed stale claims; see the list before citing one |
| Find which screen a >15KB file needs its own doc for | [06-SCREENS/](06-SCREENS/), [_COVERAGE.md](_COVERAGE.md) | one doc per screen file; `_COVERAGE.md` tracks what's been read and where |

## `covers:` is the staleness contract

Every doc's frontmatter lists `covers:` globs. **When you change a
file, open the doc(s) whose `covers` match and update them in the same
change.** Bump `last_verified` and `verified_against_commit`. A MEMORY
doc that contradicts the code is worse than no doc — if you can't
verify a section, mark it `⚠️ UNVERIFIED` rather than leaving it to be
trusted. `_COVERAGE.md` tracks what's been read; update it if you add a
new in-scope file.

**Line-number citations rot.** Every `file.js:NNN`-style citation in
this tree was accurate against commit `f0bdc1d`. A refactor that adds
or removes lines above a cited range silently invalidates the citation
without making it look wrong — the doc will still read as confident and
specific. Treat a line-number citation as a strong hint of *where to
look*, not a guarantee the code is still there at that exact line;
re-locate by the quoted identifier/comment text if the line number
doesn't match what's described. There are two ways to reduce this rot
if it becomes a real maintenance burden: re-verify citations
periodically against a fresh commit (cheap per-doc, easy to defer
indefinitely), or anchor high-churn citations to a named marker
(`// region:` comments or similar) instead of a line number (more
upfront work, more durable). Neither is implemented — flagging the
tradeoff for whoever owns this tree to decide, not deciding it here.

## Doc list

`01-ARCHITECTURE` · `02-CONVENTIONS` · `03-ROUTING-AND-NAV` ·
`04-STATE-MANAGEMENT` · `05-DESIGN-SYSTEM` · `07-COMPONENTS` ·
`08-API-INTEGRATION` · `09-REALTIME` · `10-AUTH-AND-SECURITY` ·
`11-SCORING-CLIENT` · `12-RESPONSIVE` · `13-FORMS-AND-VALIDATION` ·
`14-TESTING` · `15-E2E-AND-SEEDING` · `16-BUILD-AND-CONFIG` ·
`SHARED-CONTRACTS` · `CHANGE-RECIPES` · `GOTCHAS` ·
`06-SCREENS/{admin-judges,admin-scoring,admin-scores,admin-transactions,
admin-lots,admin-teams,admin-register,scorer-scoring,coach-dashboard,
coach-payment,coach-create-team,player-dashboard,player-team-selection,
judge-shared,judge-scoring,judge-panel-review,judge-panel-data-hook,
judge-team-players,judge-dashboard,judge-sequence,judge-profile,
superadmin-management,superadmin-add-player-payment,unified-login,
unified-register,unified-dashboard,public-home-and-scores}` ·
`_COVERAGE`.

No `06-SCREENS` doc exists for `ForgotPassword.jsx`/`ResetPassword.jsx`/
`NotFound.jsx` — deliberately; they're covered in
[10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md) instead, since their
content is inseparable from the auth/session model.

## Worked cold-start traces

**"A coach reports their payment succeeded in Razorpay but the team
still shows as unpaid."** → Index row "Debug a payment flow" →
[06-SCREENS/coach-payment.md](06-SCREENS/coach-payment.md). The doc's
"Razorpay flow, step by step" section shows the actual finalization
step is the `handler` success callback (`CoachPayment.jsx:211-232`),
which calls `coachAPI.verifyPaymentAndSubmit(response)` — **only on the
server confirming this does `paymentComplete` flip true**; if
verification fails, the UI deliberately does not lie about success, and
tells the coach to "contact support with your payment reference." So a
"Razorpay succeeded but app shows unpaid" report is almost certainly a
server-side signature-verification failure, not a client bug — the fix
starts in `Server/`'s payment verification, not here. **Result**: the
doc routes straight to the exact callback and explains why the
discrepancy is intentional-looking rather than a bug to patch
client-side.

**"Add a new field to the judge slip that Panel Review should also
show."** → Index row "Change the judge slip / mismatch review flow" →
[11-SCORING-CLIENT.md](11-SCORING-CLIENT.md) and
[06-SCREENS/judge-shared.md](06-SCREENS/judge-shared.md). The canonical
shape lives in `judgeShared.jsx`'s `normalizeBreakdown` — the doc
flags that a no-input call to that function produces a *different*
shape (missing `detailed`/`_score` keys entirely) than a real-breakdown
call, a trap for a naive new field that assumes the two branches agree.
It also flags that `scoringPropTypes.js` mirrors this shape by hand and
must be updated in the same change, and that `JudgePanelReview.jsx`'s
`failedItems` computation explicitly refuses to render undetailed data
rather than fabricate it — a new field needs the same `detailed` guard
if it's element-level detail. **Result**: three specific files
(`judgeShared.jsx`, `scoringPropTypes.js`, `JudgePanelReview.jsx`) and
the exact trap to avoid, not a generic "look at the scoring files"
answer.

**"The score sheet is scrolling sideways on a tablet — fix it."** →
Index row "Fix a horizontal-scroll bug" → [12-RESPONSIVE.md](12-RESPONSIVE.md).
The doc's first move is disambiguation: this codebase has fixed **two
independent** horizontal-scroll bugs with two different mechanisms —
the judge/scorer score sheet uses `tableLayout: 'fixed'` +
`<colgroup>` + fluid input cells (in `ResponsiveTable.jsx`'s
`ResponsiveScoringTable` export), while a *different* prior bug
(decorative background orbs extending past the viewport) was fixed via
CSS clipping in `AmbientOrbs.jsx`. The doc also flags that the generic
`ResponsiveTable`/`ResponsiveRankings` components still **do** scroll
sideways on purpose — that's accepted behavior there, not a bug to
match. **Result**: confirms which of two unrelated fixes applies before
any code is touched, avoiding a "fix" that copies the wrong pattern.
