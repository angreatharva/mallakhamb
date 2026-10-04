# Responsive UI/UX and Light/Dark — final report

Branch `feat/responsive-appearance` · plan: [RESPONSIVE_UIUX_PLAN.md](RESPONSIVE_UIUX_PLAN.md) (the per-file log is there; this is the summary).

## What changed for the people using it

- **Every screen works on a phone, a tablet and a laptop.** Nothing scrolls sideways; on touch screens every control is at least 44px; form fields are 16px on touch, so iOS does not zoom on focus.
- **A Light/Dark switch in every screen** — Dark, Light, or Match device. It sits beside Log out (top-right on sign-in and the choosers), is fully keyboard-operable, announces the change, and survives logout and reload with no flash. Switching never reloads: a judge mid-slip keeps every mark.
- **Light mode reads everywhere.** Before this work the app was dark-only; colour came from hard-coded hexes that turned invisible on a light page.
- **Tablet layouts that fit.** The score sheet shows athlete cards below 1024px, where all 48 of its fields used to clip; the transactions table becomes cards on touch screens; dialogs and menus freeze the page behind them.
- **No functionality changed.** No route, API call, permission, workflow, data field, column or control was removed. Three password-policy differences (admin 12 characters, player 8) were preserved explicitly when their components merged.

## Verification

| Check | Result |
|---|---|
| Visual baseline (all routes × 375/768/820/1024/1366 × dark/light, `threshold: 0`) | Every batch re-run guarded; refactors (Phases 8, 9.4, 10) **pixel-identical**, every intended change classified and reviewed. Final run on the merged branch: **pixel-identical in all six areas** |
| Contrast (WCAG 1.4.3), every text element, every route, 1366 + 375 | **88/88 light, 88/88 dark** (the audit now waits out running animations — a toast read mid-fade had measured a false 1.31:1) |
| Overflow · touch targets · console, all routes | Chromium at 15 widths (320–1920) in both appearances, plus phone landscape (667–932 × 375) and tablet landscape (1024/1180 × 768): **clean in all six areas** after one fix (the coach header ran 5px past a 320px screen once the switch joined it). Final run: Chromium 15 widths, light and dark, **6/6 areas clean each**; tablet portrait, phone landscape and tablet landscape **6/6 each** |
| Real devices (`E2E_DEVICES=1`): iPhone 13, iPad Mini, iPad Pro 11 (+landscape) on WebKit; Galaxy S24, Tab S4, Z Fold 7, Tab S9 landscape on Chromium, both appearances | **48/48 area-runs clean** (8 profiles × 6 areas). Their console lines are requests the browser cancels when the audit moves on — see Known limitations |
| Edge cases (API rewritten in the browser): long names, empty lists, 2.5 s latency, 500s | 24/24 clean — no sideways scroll, no uncaught error |
| Screens behind filters and tabs (`deep-screens.spec.js`): public player and team boards, admin team list, individual and team rankings, lots, judges, teams — filters chosen, 320–1366, both appearances | **128/128 screen-widths clean** after the fixes below |
| Judge screens behind state (`judge-deep-screens.spec.js`): running order, panel review, the Senior Judge's edit dialog, the Mismatch and Tolerance alerts — 320–1366, both appearances | **100/100 clean** after the fixes below; the edit dialog's number grid is the one accepted exception (Known limitations) |
| Score sheet (`responsive-score-sheet.spec.js`) | no sideways scroll at any width; 0 clipped fields; cards below 1024, table from 1024; follows a live resize |
| Judge slip walk, 320 + 375 + 768, both appearances | three tabs; nothing under the Submit bar; stepper tap areas answer outside their boxes; COP viewer locks and releases |
| Appearance persistence | Light survives logout and reload; on reload `data-appearance` is only ever `light` |
| Keyboard focus | every Tab stop on every route shows a visible change on focus — outline, ring or border — in both appearances, **6/6 areas** |
| Unit tests · lint · build | **405 unit tests pass** · 0 lint errors · build clean |

## Re-verification after merging master (2026-10-02/03)

`master` was merged in (`d56b6c6`). Its judge-panel change came over whole: per-section mismatch chips (`isOff`), Final Submit no longer locked by a tolerance breach, and the COP §3.4 base-score notice — restyled with the branch's tokens, with `PanelAlerts.test` naming the token instead of a hex. Then every check above was re-run from scratch on the final code (`1c187b4`), **one run at a time**: the audit accounts cannot be signed in from two browsers at once, so results from any window in which two runs overlapped were thrown away, not counted.

**Screens no audit had reached.** The route audits open each URL with nothing chosen, so they never saw a results board (it needs a category), the judge's running order (it redirects without one), or the panel review and its dialogs (they need a scored athlete, or a panel that disagrees). Two specs now reach them the way a person does: `deep-screens.spec.js` chooses the filters and opens the tabs; `judge-deep-screens.spec.js` goes through the judge dashboard's "Set Sequence" and the scoring screen's own hand-over to the panel review, and asserts the page stayed put — its first version measured the team page while believing it was on the review. To hold the review open on a meet whose scores are all finalized, and to open the alerts, it changes the scores response **in the browser only**; nothing is saved or submitted.

Found and fixed:
- **The viewport store went stale** while nothing was subscribed — a phone rotated with no responsive component on screen handed back the old size. It re-measures on read now; a test fails on the old store and passes on the new.
- **The judge's athlete list scrolled sideways at 320px.** The row could not shrink; the apparatus badge moves under the name below `sm`.
- **The results podium stayed three cards wide (~520px) on every phone** — public `/scores` and admin Individual Rankings. Below `sm` it stacks in placing order. The markup is in placing order too, and `sm:order-*` draws the podium, so desktop is unchanged and a screen reader meets first place first.
- **Public scores header:** its Clear button was 36px on touch (now the 44px floor), and with it the header ran 11px past a 320px screen (gaps tighten below 360px).
- **Team Championship** cut the team name to "SGAM-TRI…" at 320px; it wraps now.
- **The running order had no Light/Dark switch** — missed in Phase 9.3 — and a 36px back button. Both fixed.
- **Panel review:** "Edit My Score" was 42px and the Senior Judge's per-judge pencils 32×32 on touch → the 44px floor, and the pencils carry a label.
- **The Mismatch, Tolerance and Senior-Judge-edit dialogs** closed with a 32×32 ✕ that had **no accessible name** → "Close", 44px on touch.
- **In the Senior Judge's edit dialog, a tap just below "−" pressed "+".** Its compact picker squeezed the count to ~20px, and the two steppers' tap extensions overlapped there. On touch it is now the slip's own picker; compact stays for the mouse.
- **The steppers' tap extensions reached 43px, not 44** — a 1px border ate one of the 15px. Now 16px.

The audits themselves were corrected on the way, each after a false reading was traced to its cause:
- the contrast audit read a toast mid-fade (1.31:1);
- the responsive audit read a 44px link at 43 mid scale-in, and measured a pseudo-element's reach from the border box instead of the padding box. Both now wait for stillness and measure from the padding box.

## Protected behaviours (plan §15)

1. **The score sheet never scrolls sideways.** Measured at 375–1366: no page or sheet overflow. Below 1024 the sheet is athlete cards (owner's call, 2026-10-02) because at 768 every one of 48 fields clipped a "10.00" mark or "00:00" time; from 1024 the divided-width table, 0 clipped. No column dropped.
2. **The Chief's copy is a display seat.** `panelSize` stays explicit in both table and cards; `ResponsiveScoringTable.test` covers five columns for a 4-judge panel, the 4-judge average, the copy never typable twice, and the same on a phone.
3. **Mark fields are number-only text inputs.** 0 native number inputs on the sheet at every width; `inputMode="decimal"` throughout. 16px on touch in the cards; 13px in the table, where 16px would clip.
4. **The judge slip.** Three tabs and the pinned Live Final Score are unchanged; the walk asserts nothing sits under the Submit footer at 375 and 768 in both appearances. The Light/Dark control sits in the slip's header, never the Submit bar. Refresh-keeps-the-slip and edit-never-shows-the-old-score tests pass. Nothing added triggers a reload.
5. **COP wording is verbatim.** No case utility was added to COP text; the checklist tests that compare every requirement with the COP pass.
6. **The stopwatch** stays framer-free, whole seconds, and is a dark island (`data-appearance="dark"`) in both appearances.
7. **Pass-through** with one competition at a level is untouched; `PostLoginFlow` tests pass.
8. **The public breakdown** shows the panel-rule average with no per-judge pills — untouched.
9. **Every device includes iPhone and Safari** — WebKit device projects ran on every area.

## Decisions taken on the owner's behalf ("do the best thing possible")

- **Score sheet at tablet width → cards below 1024.** Fewer columns would have dropped data (§15.1).
- **Slip steppers (29px) → a 44px tap area without moving the layout**, borrowed from the non-interactive count between "−" and "+"; the walk taps outside each box to prove it.

## Known limitations and follow-ups

- **AccessLint's live audit cannot sign in**, so the logged-in screens were checked by the in-repo contrast, target, focus and overflow audits instead of AccessLint's full rule set. Public pages can be run through AccessLint any time.
- **Found, not ours to change** (in the plan): Home links to `/about`, `/gallery`, `/contact`, `/schedule`, which do not exist; `CompetitionContext` logs "Competition switch already in progress" when two automatic selections collide.
- **Not merged on purpose:** `design-system/index.jsx`'s `GlassCard`/`FadeIn`/`GradientText` differ from the `cards/`/`animations/`/`ornaments/` versions; an `AccountControls` cluster would restyle every shell's Log out.
- **The Senior Judge's edit dialog: the Difficulty numbers are narrower than 44px on small phones** — 30×44 at 320px, 38×44 at 360, 41×44 at 375, 44×44 from 390. They are the slip's own 2×5 grid inside a dialog's padding; WCAG 2.2 AA (2.5.8) asks for 24×24. `judge-deep-screens.spec.js` accepts exactly these buttons at ≥24×44 and fails anything else that small.
- **The judge slip's Difficulty number grid is 35×44px at 320px only** (44×44 from 360px). That passes WCAG 2.2 AA (2.5.8 asks for 24×24); the 2×5 grid stays as tuned in judge trials rather than becoming a scrolling row.
- **WebKit device runs log a few "Network Error" / "access control checks" console lines.** They are requests the browser cancels when the audit moves on (sign-in hops between pages): replayed with every failed request logged, each is "Load request cancelled", and the same screens loaded without moving on show zero errors and their full data. Chromium cancels the same requests silently. The app already catches them (`verifyCopRulesAgainstServer` logs a warning).
- **`master` tracks 132 baseline PNGs in `Web/.visual-baseline/`.** This branch's pixel gate reads its baselines from outside the repo (`../.mallakhamb-visual-baseline/`), so those files are unused here. Keeping or deleting them is the owner's call.
- **Run the audits one at a time.** They share the audit accounts, which cannot be signed in from two browsers at once; on Windows a stopped background shell can keep running, so check for leftover `playwright` processes before trusting a result.
- **Operational:** a test run is void if the API loses Atlas mid-run (`getaddrinfo ENOTFOUND`, "Authentication failed" toasts, "0 competitions"); `/api/health` can report 503 from its heap-percentage rule while the database is fine.

## Running the harness

Accounts: `set -a && . ./.env.audit.local && set +a` (TRIALS dev DB, read-only).

```bash
npm run audit:visual                       # pixel gate (baselines outside the repo)
npx playwright test e2e/contrast-audit.spec.js --project=chromium
npm run audit:responsive                   # WIDTHS=, AUDIT_HEIGHT=, APPEARANCE=both
E2E_DEVICES=1 npx playwright test e2e/responsive-audit.spec.js --project=iphone-13
npx playwright test e2e/responsive-score-sheet.spec.js --project=chromium
WALK_UNLOCK=1 WALK_AGE=Above18 WALK_APPEARANCE=light npm run audit:judge-walk
npx playwright test e2e/edge-cases.spec.js --project=chromium
npx playwright test e2e/appearance-persistence.spec.js --project=chromium
npx playwright test e2e/focus-visible.spec.js --project=chromium
npx playwright test e2e/deep-screens.spec.js --project=chromium        # DEEP_WIDTHS=
npx playwright test e2e/judge-deep-screens.spec.js --project=chromium  # needs the audit judge seated as Senior Judge
```

## Commits

- `8ca2b5c` test(e2e): responsive plan Phase 2 — tablet band, WebKit, appearance switch, pixel baseline
- `70f2b39` feat(web): responsive plan Phase 3 — one breakpoint/z-index source, appearance tokens, alpha() codemod
- `a9c3530` test(e2e): the pixel gate compares colours exactly (threshold 0)
- `8887d18` feat(web): responsive plan Phase 4 — accessibility foundation
- `e89cddf` feat(web): responsive plan Phase 5 foundation — a touch floor for tablets
- `3c3392a` feat(web): responsive plan Phase 5 — Home (tablet touch, light appearance)
- `9b6f320` feat(web): responsive plan Phase 5 — public group (auth screens, scores, 404)
- `d865a05` test(e2e): baselines live outside the repo; iOS + Android device profiles
- `c007fb0` feat(web): responsive plan Phase 5 — competition selection, ConfirmDialog
- `24d9676` feat(web): responsive plan Phase 5 — player group and score boards
- `8d1a0f6` refactor(web): FG — semantic text colours from tokens.js, not literals
- `e8661ed` feat(web): responsive plan Phase 5 — coach group
- `c315c04` feat(web): responsive plan Phase 5 — admin group
- `c65c75b` feat(web): responsive plan Phase 5 — super-admin group
- `641e747` feat(web): responsive plan Phase 5 — AdminScoring and the score sheet
- `46d14ad` feat(web): responsive plan Phase 5 — judge group
- `6df54fb` refactor(web): AmbientOrbs tints through alpha(), not `${color}${byte}`
- `b68071f` feat(web): responsive plan Phase 6.2 — one counted scroll lock; Phase 5 exit
- `4c8baaf` feat(web): responsive plan Phase 6.1/6.3/6.4 — COP viewer, transactions region, slip walk
- `df8ab80` feat(web): AppearanceMenu (not yet exposed); device matrix clean; desktop-fold spec
- `d1d4c63` feat(web): responsive plan Phase 9.1 — contrast gate passes in both appearances; Phase 7 measured
- `71661f6` feat(web): responsive plan Phase 9.3 — the Light/Dark switch, in every shell
- `6a2f600` feat(web): score sheet cards below 1024; slip steppers get 44px tap areas
- `4ece333` refactor(web): responsive plan Phase 8.1 — the admin kit and other proven duplicates
- `2c3eb77` refactor(web): responsive plan Phase 8.2 — one JudgeLogoutButton
- `8764fe5` refactor(web): responsive plan Phase 8.3 — one password meter, each form's policy explicit
- `c0b9539` refactor(web): responsive plan Phase 9.4 — retire the white -> ink alias
- `78b81eb` perf(web): responsive plan Phase 10 — one shared viewport store
- `738af34` test(e2e): responsive plan Phase 11 — edge cases and appearance persistence
- `9a3c620` docs(web): responsive plan Phase 11 — regression matrix, focus check, final report
- `d56b6c6` Merge master into feat/responsive-appearance
- `c0b9b63` fix(web): the shared viewport store re-measures while nothing is subscribed
- `9596488` fix(web): the judge's athlete list no longer scrolls sideways on small phones
- `d024c8b` fix(web): results boards fit a phone once a category is chosen
- `d0effc2` test(e2e): the contrast audit waits out running animations before it reads colours
- `272f6b0` fix(web): the judge's running order, panel review and its dialogs on touch screens
- `1c187b4` test(e2e): measure the judge screens behind state; the audit stops racing
- (this report update)
