# Responsive UI/UX + Appearance (Light/Dark) — Audit & Implementation Plan

**Version:** 2 (supersedes v1 of 2026-09-20, commit `fb8140d`)
**Audited against:** `master` @ `5a9cae8`, 2026-09-28
**Status:** Implementation on branch `feat/responsive-appearance`. Phases 2–4 committed; Phase 5 in progress (foundation committed 2026-09-30). Gaps are noted in the log below.
**Scope:** `Web/` only. `Server/` is out of scope and must not be touched.

---

## Implementation log

### Phase 2 — safety net (done, with two gaps)
- Harness: `TABLET_WIDTHS [768, 820, 834, 1024]` with portrait heights; 1280 and 1536 added to desktop; tap targets measured below 1024 or on a coarse pointer; `audit:tablet`; `APPEARANCE=dark|light|both` via an init script writing `mk-appearance`; the sweep factored into `e2e/support/audit-suite.js`.
- WebKit: `iphone-13`, `ipad-mini`, `ipad-pro-11`, `ipad-pro-11-landscape`, **opt-in** (`E2E_WEBKIT=1`) and restricted to `responsive-*`/`visual-*` specs, so the seeding specs can never replay. `npm run test:e2e:install:webkit` has not been run on this machine yet.
- **Audit DB (2.1) — not done; replaced for now.** Instead of a second database, `AUDIT_<ROLE>_EMAIL/PASSWORD` + `AUDIT_MEET` overrides let the read-only audits sign in with accounts that exist in the TRIALS dev DB (kept in gitignored `Web/.env.audit.local`). Nothing was dropped or reseeded. A real audit DB is still needed for the judge walk with a real `resetScores`.
- **Visual baseline (2.5): `e2e/visual-baseline.spec.js` / `npm run audit:visual`.** 44 routes × 375/820/1366, dark — **132 screenshots, re-verified at 0 differing pixels on unchanged code** before any Phase 3 edit. Three fixes were needed before a baseline meant anything: `reducedMotion` must go through `contextOptions` (as a bare test option it is silently ignored); full-page shots must scroll first or every `whileInView` section photographs as black; and the capture waits for toasts and in-flight text to clear (the judge screens differed between two runs of the same build otherwise).
- Not yet run: the AccessLint baseline (the AccessLint server failed to connect this session) and the full 13-width matrix.

### Phase 3 — foundation (done; exit gate = dark diff 0 across the 132)
- 3.1 The four `@apply` components **do** emit CSS when used — they are unused, not broken. Kept, per the rule.
- 3.2/3.3 Screens are `sm md lg xl 2xl` from one module, `src/styles/breakpoints.js`, which `tailwind.config.js`, `utils/ui/responsive.js` and `styles/tokens.js` all read. "desktop" = ≥1024 everywhere; the 1440 step survives as `WIDE_CONTAINER_MIN` (`isDesktopBaseline`, `container-centered`, and `min-[1440px]:` in `ResponsiveContainer`). The 768/767 overlap lived in an unused `.responsive-bg` rule, now deleted.
- 3.4 One z-index scale (`Z_INDEX`) as `--z-*` properties and `z-sticky … z-tooltip` utilities. The old named utilities had no users. **The ~70 numeric `z-10…z-[9999]` sites are not migrated** — they move file by file in Phase 5.
- 3.5 Dead set deleted. The bundle confirmed it: the four lazy backgrounds were shipping as real chunks; DesignTokenAudit and the four Responsive* files were already tree-shaken. `ResponsiveFullWidthContainer` and `ResponsiveFormContainer` went with them.
- 3.6 `useReducedMotion` has one implementation (hooks/useResponsive; the design-system path re-exports it; Home's re-export removed). `.table-mobile-cards`, the index.css `.aspect-*` copies and the unused `.touch-target` are gone.
- 3.7 `.no-horizontal-scroll` / `.mobile-full-width` removed; `body`/`#root` use `100dvh` after a `100vh` fallback.
- 3.8 Appearance plumbing: tokens for both appearances in `index.css` (role palettes on `[data-role]`, each `[data-appearance]` block picks its half, derived tokens redeclared per block so a dark island inside a light page resolves dark); `public/appearance-init.js` + two `theme-color` metas; `AppearanceProvider`/`useAppearance` (`src/contexts/`), helpers in `src/utils/ui/appearance.js`; `App.jsx` root is `bg-bg`. `?appearance=light|dark|system` works (and persists) — the only way in until Phase 9.
- 3.9 **428 concatenations in 48 files → `alpha(X, 0xNN)`**; `src/styles/colourHygiene.test.js` keeps it at 0 in CI.
- 3.10 Tailwind `white` = ink, plus `snow`. Of the 5 solid `bg-white`: the light-styled ErrorBoundary card and the SuperAdminManagement toggle knob are `snow`; the other 3 were in deleted ResponsiveForm. The 16 `placeholder-white/NN` correctly follow ink.
- 3.11 Every light-only plugin/index.css utility was unreferenced and is deleted, except the scrollbars, which now follow the appearance.
- Also from §14.6, because light cannot be legible without it: `DESIGN_TOKENS` surfaces, neutral borders and text, and `COMMON_STYLES`, are `rgb(var(--…))` strings (dark-identical). Role and status colours stay hex until the framer colour animations are gone (R9) and `ThemeProvider` sets `data-role` — the accent tokens are defined but dormant.

**The one intentional dark change in Phase 3:** scrollbars were a light-grey track and thumb on the near-black app; they now follow the appearance (headless screenshots don't show scrollbars, so the diff can't see it).

**Found, not fixed (belongs to Phase 5 per-file work):**
- `alpha()` deliberately reproduces the old concatenation for non-token input, because several callers pass an `rgba()` and so have **always rendered invalid CSS**: the "Completed" status badge in `CompetitionSelector`, `CompetitionDisplay` and `CompetitionSelectionScreen` has no tint or border, and `CoachOrnament`'s gradient is dropped entirely when a ThemeProvider supplies `primaryDark`. Fixing them is a visible change.
- The same class of bug in the Tailwind plugin: `.stacked-table` rows were meant to have a hairline border (`${theme('colors.white')}14`), but `colors.white` is `#fff`, so it produced the five-digit `#fff14` and the declaration was dropped — **phone stacked tables have never had that border**. The visual diff caught it (a valid border shifted every card by 1px on SuperAdminManagement and the add-player payment page); the rule now states no border, which is what has always rendered.
- Light is legible on ordinary pages (checked: coach login). Text over photos is not yet `snow` — Home's hero nav and role-card labels turn dark on the photo. That is Home's Phase 5 pass (§14.5, the 7 known sites).

### Phase 4 — accessibility foundation (done 2026-09-30, committed `8887d18`; every dark change here is intentional)
- **4.1 Focus.** A global `:focus-visible` ring (2px `--focus-ring` = the role accent, 2px offset, placed after `@tailwind utilities`) replaces the `input:focus` rule that swapped every field's outline for a 10% glow. All 35 `outline-none` / `focus:outline-none` are gone (31 page sites, 4 in the Themed* inputs). ThemedButton's `focus:ring-3` is not a class in this config and drew nothing. Checked with the keyboard: Tab onto the show-password toggle on `/coach/login` gives a solid coach-green outline (it had none).
- **4.2 Primary buttons.** `html[data-role]` now comes from the URL (`applyRoleAccent`, a layout effect in `AppContent`), so the accent tokens are live. It matches the JS theme on every screen because each `ThemeProvider` mount passes its own route's role. ThemedButton solid = `bg-accent text-on-accent`: the fill is unchanged in dark and the label is near-black — coach 2.28→8.69, player 2.86→6.93, superadmin 2.03→9.77, admin/judge 4.23→4.68, public 3.68→5.38. Outline/ghost read `accent-fg`, identical in dark.
- **4.3 / 4.4 Text contrast.** Per-site decisions, kept in the codemod rather than a blanket replace: 214 `text-white/40–55` → `text-fg-muted`. Of the 118 at `/15–35`, 87 → muted (73 texts, 10 show/hide-password toggles, 4 links), 3 `·` separators → `fg-subtle`, and 24 decorative icons and 4 placeholders are left as they were. 20 hovers that would no longer brighten against a muted base → `hover:text-fg`. 107 inline `color:` at α .12–.55 → `var(--fg-muted)`; 20 are left (aria-hidden glyphs, chevrons inside labelled buttons, empty-state art, the 404 watermark, and the two "Completed" configs that feed the known-invalid `alpha()` badge, which is Phase 5). `DESIGN_TOKENS.colors.text.muted` → `var(--fg-muted)`. 49 files, 411 lines, every one a 1-for-1 line replacement.
- **4.5 Motion.** `<MotionConfig reducedMotion="user">` at the root: movement stops for people who ask for it; opacity fades continue. The 13 framer rotate spinners are CSS `animate-spin`, so loading feedback keeps turning (every spinner is now 1 s). The unused `.fade-in` and five unused Tailwind animations are deleted. `button { transition: all }` → explicit properties.
- **4.5 Labels.** 15 fields had no programmatic name (placeholder-only search boxes, the rankings selects, the Time Keeper / Scorer name fields in AdminScoring). Four wrappers drew a visible `<label>` that was never linked — `DarkInput` in AdminJudges; `DarkInput`, `DarkSelect` and `DarkTextarea` in SuperAdminManagement — plus the judge slip's `ScoreInput`; all now linked with `useId`. Score-sheet mark cells are named "<athlete>, <column>". In the Sr-Judge edit dialog, Execution is named, and the Originality None / +0.20 buttons carry `aria-pressed` (the choice was shown by colour alone). The 6 remaining scanner hits are verified false positives (wrapped checkboxes, a `display:none` file input, `<input>` written inside comments).
- **4.6 Table semantics.** No grid qualified under D2: none of the 116 `grid-cols-` has a header row over repeating columns, and the tabular data was already `<table>`. Instead, `scope="col"` on all 5 header templates, and names for the score sheet, the rankings, and the three management tables.
- **Links inside sentences** on the password pages ("Back to Login", "Request New OTP") were told apart by colour only (WCAG 1.4.1, and already under 3:1 against the text before this phase) → underlined.

**Verification**
- `npm test` 379/379, lint clean — same as before the phase.
- AccessLint on the 8 public routes its logged-out Chrome can reach: **no contrast, label or focus violations**. What remains is `landmark-main` / `region` on every screen except the 9 that already render `<main>`, and NotFound has no `<h1>` — Phase 5, per screen (a global `<main>` would nest inside those 9).
- `/scores` reported its muted empty-state text at 2.7:1. That is a measurement artifact: the text is inside a framer fade, and a background tab runs no animation frames (checked: `document.hidden`, 0 rAF ticks, parent stuck at `opacity: 0`). The computed colour on `#0a0a0a` is 6.28:1. The same stall means AccessLint contrast numbers on animated screens need checking against computed colours.
- **Visual, against the Phase 3 baseline.** At the old 0.2 colour tolerance, 23 of 44 routes changed. At `threshold: 0`, all 44 do, at every width. Sampled 7 routes — the extremes and the odd cases, not every shot — and every difference traced to an intended change:
  - muted text brightening, e.g. every card blurb on Choose Your Level, and one paragraph measured at grey 94 → 140, which is 0.35 → 0.55 ink exactly;
  - `ThemedButton` labels going dark (judge profile: those two labels are the only changed pixels on the page);
  - the superadmin Logout label (0.50 → 0.55; the only changed pixels on that dashboard);
  - the "Super Admin" header link on NotFound, which only 1366 shows;
  - on `/scores` at 375, an in-flight "Loading…" in the competition dropdown — timing noise, not a colour change.
- **The one layout-looking diff is a 1px settle.** Forgot Password showed a moved button, a new line and ghosted card edges. Measured: the whole card sits exactly 1px higher (edge y 759 → 758; button fill off by one level). The harness captures with reduced motion on. Before Phase 4, framer ignored that and photographed the slide-up entrance about a pixel short of its end; with `MotionConfig reducedMotion="user"` the slide is skipped and the card is at its true resting position. Every screen with a framer entrance shows the same 1px shift, which is why all 44 differ at threshold 0. People without reduced motion still get the slide, ending in the same place.
- **Still owed:** the keyboard walk from login to score submission (only the login page's focus was walked), and AccessLint on the logged-in screens.

**Harness**
- **The pixel gate had a colour tolerance.** `maxDiffPixels: 0` was set, but Playwright's per-pixel `threshold` stayed at its 0.2 default, under which a grey moving 94 → 140 is "the same pixel". So Phase 3's "dark diff 0" proved no change larger than roughly 35 grey levels, not zero change. The spec now uses `threshold: 0` (override with `VISUAL_THRESHOLD`). Phase 3's claim was not re-verified at 0 — it would need the Phase 2 commit's rendering as a baseline.
- **The strict gate is deterministic.** Baseline re-recorded on the Phase 4 state at `threshold: 0`, then compared against an unchanged build: 132 of 132 shots, **0 changed pixels**. It is the baseline Phase 5 diffs against.
- The "compare an unchanged build first" rule caught one bad baseline shot (judge sequence, 1366): it was recorded minutes before the API lost its Atlas connection, with an in-flight "Checking…" line in it. Re-recorded, then matched twice.
- That same connection loss made every later sign-in fail as "Invalid credentials", because the auth service turns any lookup error into that message. Server-side and out of scope; raised as a separate task.

**Found, not fixed**
- `AdminJudges.jsx` and `SuperAdminManagement.jsx` still define their own local `useReducedMotion` (3.6 missed them).
- Placeholders at 25–30% ink (4 `placeholder:text-white/…` + 16 `placeholder-white/30`) are under 4.5:1. Raising them risks a placeholder being read as an entered value — decide with each field in Phase 5.
- `.stacked-table` sets rows and cells to `display: block` on phones, which drops their table semantics; only the `<table>` carries `role="table"`. Rows and cells need `role="row"` / `"cell"` — Phase 6.
- A field inside an `overflow-hidden` wrapper can clip the 2px-offset ring. The judge slip's mark field is covered (its wrapper draws a solid purple focus border); the rest need the keyboard walk.

### Phase 5 — per-file pass (in progress)

**Foundation — committed `e89cddf`.** Tablets are touch devices that were getting desktop metrics.
- `.tap-safe` covers `TOUCH`: below `lg`, **or** any coarse pointer (an iPad Pro in landscape is 1194px wide and still touch).
- A new `mouse:` variant — `(min-width: 1024px) and (pointer: fine)`, the exact complement — carries compact desktop sizes. The 12 `tap-safe md:min-h-[…]` shrink sites moved to `mouse:` (D1: desktop intent).
- Proof, against a Phase 4 baseline at threshold 0: 28 shots changed, **all at 820; zero at 375 and 1366**.
- Tablet audit (768/820/834 portrait, Chromium): undersized targets **213 → 21**, and no overflow on any route, before or after. Most flagged controls already carried `tap-safe` — the report truncates selectors, so the class was not visible in it.
- Left for their files: a 32×32 dialog close ✕ with **no accessible name** (12 hits), the "60 Players" chip, the judge profile's Change-photo button, and Home's inline nav links (36px at tablet).

**Scope of (c), refined.** Text at 60%+ ink already works in both appearances through the ink alias (dark ink at 60% on the light page is ≥ 5.0:1), and Phase 4 fixed everything below that. Renaming it now would move the dark hierarchy for no accessibility gain. So per file, (c) means what actually breaks in light:
- hard-coded dark backgrounds (`rgba(10,10,10,…)`, `#050505`, `#111`);
- accent and status hex used as **text** (saffron on white is 2.86:1);
- text over photos or saturated fills → `snow`;
- glass surfaces (`bg-white/NN`) that would turn darker than the page in light.

Renaming `white` → `ink` stays one mechanical, zero-diff pass at Phase 9.

**Operational — shared checkout.** On 2026-09-30 the checkout was stashed and switched to `master` mid-run. The owner switched back; nothing was lost, but two things follow:
- `master` commit `e24793c` **tracks the baseline PNGs** (force-added past `.gitignore`), so every checkout between `master` and this branch overwrites, then deletes, the local `Web/.visual-baseline/`. Whether baselines belong in git is the owner's call. Until then, a copy lives outside the repo.
- Every long run now records branch, HEAD and a hash of the diff before and after, and is void if they differ.

**Per-file log**

*1. `public/Home.jsx`* (plus shared: brand text tokens in `index.css`; `GradientText`, `SaffronButton` and the index's `GlassCard` in `design-system/index.jsx`)
- (a) 36 `md:` sites: 34 tablet-correct as written (gutters, header height, inline nav from 768, type sizes, 4-up stats, two-sided timeline, 2-column footer); 2 desktop intent → `mouse:` (in the foundation commit).
- (b) The inline nav links were 36px at tablet width → `tap-safe`.
- (c) New brand text tokens `--brand-fg`, `--brand-fg-soft`, `--brand-gold-fg` — the brand hexes in dark, the -700 shades in light (~5:1) — for saffron eyebrows, years, pills, the brand name and the index's `GradientText`. Dark islands: the hero (photo under a dark scrim), the navbar while it is over the hero, the About photo card, and the `#050505` footer. The navbar and mobile-menu backdrops follow `--bg` once scrolled. The role-card Login labels were white on the role fills (saffron 2.86, green 2.28, admin red 3.76) → `on-accent`, near-black in the island. `SaffronButton` solid label → near-black (D6); outline text → `--brand-fg-soft`.
- (d) Dark, 5 widths: the changed pixels are only the role-card labels (every width), the Live Scores label (768+) and the nav links (768/820) — everything below the hero is identical. Light: hero text, stats, headings, the About caption and the footer were unreadable and now read. Public Scores changed in light only (shared `GradientText` / `GlassCard`); every other public page is identical in both appearances.
- Why the whole hero is the island, not just its text: the scrim fades to the page colour from 40% to 100% of the hero's height, which is where the role cards sit (on a phone the hero is taller than the screen). A light-bottomed fade would put white text on a whitened photo.

*2–9. The rest of the public group* — `PublicScores`, `UnifiedLogin` (5 portals), `UnifiedRegister` (3), `AdminRegister`, `ForgotPassword`, `ResetPassword`, `NotFound`, and the shared `layout/Navbar`, `auth/Dropdown` and Themed* inputs.
- (a) 5 `md:` sites (gutters, a heading size, a card's padding) — all tablet-correct.
- (b) 16px text in fields below `lg`/on touch (`text-base mouse:text-sm`) so iOS does not zoom on focus; the scores search box's `sm:min-h-[40px]` (a touch target shrinking from 640px) → `mouse:`.
- (c) A mechanical, dark-identical codemod (`rgba(255,255,255,A)` → `rgb(var(--ink) / A)`, `rgba(10,10,10,A)` → `rgb(var(--bg) / A)`) that refuses framer animation props and SVG presentation attributes, where a CSS variable cannot work. Then by hand:
  - **Role colour as text at 38–56% opacity** — the auth field labels, the portal eyebrow, the feature labels, the Forgot/Register links — failed in DARK too (saffron ~3.1, purple ~2.9:1), and purple has no passing opacity. → full-strength `--accent-fg`. Visible in dark: these labels are brighter.
  - `#EF4444` required markers and errors → `--danger-fg` (identical in dark). Status text `text-green-400` / `text-red-400` (≈2:1 on light) → `text-*-700 dark:text-*-400`, the one place `dark:` earns its keep: identical in dark.
  - `ResetPassword` had its own `COLORS` with `dark: '#0A0A0A'`, so its page stayed black in light with invisible text. `NotFound` hard-coded `#0a0a0a` (same failure) and became a `<main>`.
  - `Dropdown`: the option hover was framer animating to `'#fff'` — white text on a light menu → CSS hover. Its trigger's placeholder is the button's visible NAME ("Select competition first") at 45% → muted.
  - White labels on saffron fills (Send OTP, the reset step dots) → near-black (D6). `AdminRegister`'s strength label now takes a status token; the meter's fills keep their hex.
- (d) Dark: every edited screen changed only where intended — the Send OTP label is the only change on Forgot Password at 1366; on Public Scores, the inactive tab and the dropdown placeholders. `NotFound` is pixel-identical in dark, which proves its tokens and the shared `Navbar` zero-diff. Home is untouched by this batch. Light: Reset Password, NotFound and the Public Scores header/filters were unreadable and now read; the auth labels read in the deep role shade.
- The Public Scores filter labels stay faint in both appearances while their dropdown is disabled (until a competition is chosen) — WCAG exempts inactive controls.

*10–15. Competition selection* — `LevelSelectionScreen`, `CompetitionSelectionScreen` (every signed-in role passes through both), `CompetitionSelector`, `CompetitionDisplay`, `CompetitionLockBanner`, `auth/ConfirmDialog`.
- (a) 6 `md:` sites (padding, heading size, a 2-up card grid at 768) — tablet-correct.
- (b) The "· change" level chip was 32px on touch → `tap-safe`; two search fields 16px on touch.
- (c) **`SAFFRON_CTA`** in `tokens.js`: the saffron gradient plus a near-black label. Twenty-two buttons wrote that gradient by hand with `text-white` (2.86:1); each file adopts the shared style in its own pass. **Status colours** `#22C55E` / `#3B82F6` → `rgb(var(--success-fg))` / `rgb(var(--info-fg))` — equal in dark, and the form `alpha()` understands. **"Completed"** was `rgba(255,255,255,0.3)`: 2.6:1 text, and `alpha()` glued it into invalid CSS so the badge never drew its tint (the Phase 3 note) → `var(--fg-muted)`, readable and a valid tint. New `--danger-fg-soft` (`#F87171` in dark, `#B91C1C` in light) for "Locked". `ConfirmDialog`'s confirm label → near-black on its accent fill (red 3.76, green 2.28 with white); its close button's `hover:bg-white/08` was not a Tailwind class (no hover) → `/[0.08]`.
- (d) Dark: the eight selection screens are pixel-identical. The dashboards changed at every width — **all 40 shots by exactly one colour level** (classified mechanically: max channel delta 1). That is 8-bit alpha rounding: `rgba(255,255,255,0.03)` and `rgb(var(--ink) / 0.03)` are the same colour but composite a large tinted surface one level apart. Light: the level cards were white-on-white with invisible icons; the "Locked" badge reads.

**Reading a dark diff from here on.** "Identical in dark" means *within one colour level*. Every dark diff is classified mechanically — max channel delta ≤ 1 is rounding; anything larger is a real change that must be explained.

*16–22. Player group and the score boards* — `PlayerTeamSelection`, `PlayerDashboard`, `performance/PerformancePanel` (also on the coach dashboard), `scores/PlayerRankingBoard`, `scores/TeamChampionshipBoard`, `scores/ScoreCategoryFilters`, `responsive/ResponsiveRankings`.
- (a) 9 `md:` sites (gutters, card padding, heading sizes, a 2-up team grid at 768) — tablet-correct.
- (b) Nothing to add: no field below 16px, no target under 44px.
- (c) **`DATA_COLORS`** in `tokens.js`: medal gold/silver/bronze and the score-category blue/purple/green/red as channel tokens — the old hexes in dark, -700/-800 shades in light. The boards wrote them as text (bronze `#CD7F32` on white is 3.3:1). `PlayerTeamSelection` had its own `COLORS` with `dark: '#0A0A0A'`, so its page stayed black in light — the `ResetPassword` failure again.
- (d) Dark: two intended changes only. The "not assigned" badge was 50% ink → muted (3.58:1 in light). `PlayerTeamSelection`'s own `#FF9933` saffron → the one brand saffron (a hue shift on its icons and "Click to join"). `ResponsiveRankings`' rank-2 silver `#94A3B8` → the `#C0C0C0` every other board uses, but no audited route renders a rank 2 there. The coach dashboard (which hosts `PerformancePanel`) moved by rounding only. Light: Team Selection was a black page with invisible team names and now reads; the medal scores read in their deep shades; the score filters' labels on Public Scores and Admin Scores read (the codemod gave them ink).

**`FG`** in `tokens.js` — the semantic text colours (`FG.brand`, `FG.accent`, `FG.danger`, …) as one frozen object. Files 1–22 had written them as string literals (`'rgb(var(--brand-fg))'`), which the repo's `design-system/no-hardcoded-colors` lint rule flags (it exempts `tokens.js`): 165 literals in 23 files → `FG.*`, value-identical, from here on the only form. The ink codemod's partial strings (`1px solid rgb(var(--ink) / 0.1)`) still warn, exactly as the `rgba()` they replaced did.

*20–22. Coach group* — `CoachCreateTeam`, `CoachDashboard`, `CoachPayment`.
- (a) 15 `md:` sites (gutters, card padding, header height, heading sizes, 2-up grids) — tablet-correct.
- (b) The discount-code field 16px on touch. Every other field already inherits 16px; every target is already 44px or `tap-safe`.
- (c) Nine saffron buttons → `SAFFRON_CTA` (two had the gradient as a hex literal; the two logo squares that share it stay). The pay button's green "discount" fill gets the same near-black label (D6, white was 2.28:1). New `--cat-pink` for the girls' accent (`#EC4899`; pink-700 in light). The create-team step dots: the current step's number was white on green → near-black. Other steps' numbers and labels were 30% ink (2.6:1) → muted. The navbar's `rgba(10,10,10,…)` became `--bg`, so it is no longer a dark bar on the light page. The dashboard's one framer `whileHover` background (the Save button) is left — a hover tint, not text.
- (d) Dark: three intended changes — CTA labels near-black (including the *disabled* Add Player button, whose label went from dim white to dim black), the green step dot's number, the muted step labels. The same run proved the `FG` refactor zero-diff: player, public and admin are pixel-identical in both appearances. Light: the navbar, the player rows, the age-group chips and both forms' fields were invisible and now read.

**Found, not ours to change**
- Home's navbar links to `/about`, `/gallery` and `/contact`, and its feature cards to `/gallery` and `/schedule`. None of those routes exists — all land on the 404 page. Adding pages or removing links is a navigation change, which this project does not make.
- `design-system/index.jsx` defines its own `GlassCard`, `FadeIn` and `GradientText`, duplicating `cards/`, `animations/` and `ornaments/` — consolidation belongs to Phase 8.
- More local copies for Phase 8: `ResetPassword` defines its own (non-reactive) `useReducedMotion`, `COLORS` and `GradientText`; `ForgotPassword` its own `GradientText` — now four local `useReducedMotion`s (with `AdminJudges` and `SuperAdminManagement`).
- The tablet audit logged `Failed to auto-select competition: Competition switch already in progress` (`CompetitionContext.jsx`) — two automatic selections colliding. App logic, not presentation.

---

## What changed in v2

| | |
|---|---|
| **New scope** | Light/Dark appearance option (Parts II and IV §14). Today the app is dark-only. |
| **Re-verified** | Every v1 number re-measured on `master` after ~40 commits of judge-screen work. Table in §1.1. |
| **Correction 1** | v1 listed `ResponsiveContainer` as dead code and Phase 3.8 would have deleted it. **It is live** — it wraps `ResponsiveTable`, `ResponsiveRankings` and `ResponsiveFilters`. v1's count excluded the component's own directory. Real dead set is in §3.2. |
| **Correction 2** | v1 said rewrite the three `desktop:` prefixes to `xl:`. That is **not** behaviour-preserving: `desktop` is 1440px and `xl` is 1280px, so containers would widen between 1280 and 1439. They become `min-[1440px]:` (§12). |
| **New constraints** | Nine protected behaviours from judge trials and recent user rules (§15). Several are easy to break by accident with exactly the kind of work this plan does. |
| **Decisions** | v1's two open questions are now decided, plus six new ones for appearance (§22). Per the standing working-style rule, I chose the recommended option wherever it does not change a user flow, and say so in one line each. |
| **New finding** | The **current dark theme already fails contrast** in 228 text sites and on the primary button of three roles (§9). The appearance work has to fix this regardless of light mode. |

---

## 0. The shape of the project

**Width.** Commit `29d34fc` adapted every screen for phones and deliberately stopped every primitive at 767px so desktop stayed untouched. Nobody built the band in between. Tablets (768–1023px) get the full desktop layout **and** desktop touch metrics, and no test measures them.

**Appearance.** Dark is not a theme here; it is hard-coded. About 2,300 colour literals assume a near-black page, there are only 3 `dark:` prefixes in the codebase, and 428 places build colours by concatenating strings in a way that silently breaks the moment a token becomes a CSS variable.

**Consequence for sequencing.** Both scopes touch the same ~40 files. The plan does each file **once**, doing its tablet review and its colour migration in the same pass and checking both with the same screenshot diff (§17, Phase 5).

---

# PART I — RESPONSIVE AUDIT

## 1. Stack (verified)

React 19.1 · Vite 7 · Tailwind **3.4.18 installed** (`^3.3.6` declared) · react-router-dom 7 · framer-motion 12 · react-hot-toast 2.4 · lucide-react 0.546. SPA, all pages lazy. Imperative axios; no query cache. Socket.IO on judge/admin scoring. Global dark `#0a0a0a`. CSP is a `<meta>` tag in `Web/index.html`.

### 1.1 v1 → v2 measurements

| Signal | v1 (09-20) | Now (09-28) |
|---|---:|---:|
| `.jsx` / `.js` files | 94 / 64 | 108 / 77 |
| JSX lines (non-test) | 30,820 | 32,823 |
| `md:` / `lg:` / `tablet:` prefixes | 166 / 60 / 0 | 167 / 65 / **0** |
| `style={{` | 1,505 | 1,562 |
| Arbitrary Tailwind values | 274 | 297 |
| `focus-visible` | 0 | **0** |
| `outline-none` | 38 | 38 |
| Dialogs on `.modal-overlay` / hand-rolled | 10 / 4 | 10 / 4 |
| `<table>` elements | 5 | 5 |
| Files with `overflow-x-auto` | 3 | 2 |
| `grid-cols-` | 108 | 116 |
| `<input>` vs `htmlFor` | 40 vs 26 | 42 vs 26 |
| `100vh` | 3 | 3 |

Nothing got better on the a11y axes, and the gap between inputs and labels widened.

## 2. Route and page inventory

### 2.1 Public / unauthenticated
| Route | Component |
|---|---|
| `/` | `public/Home.jsx` (839 L, **36 `md:` sites — the most of any file**) |
| `/scores` | `public/PublicScores.jsx` + `scores/PlayerRankingBoard`, **`scores/TeamChampionshipBoard` (new)** |
| `/forgot-password` | `shared/ForgotPassword.jsx` |
| `/reset-password`, `/reset-password/:token` | `shared/ResetPassword.jsx` |
| `*` | `NotFound` (deliberately not a redirect) |
| `/{player,coach,admin,judge,superadmin}/login` | `unified/UnifiedLogin.jsx` — one component, five routes, role from URL |
| `/{player,coach,judge}/register` | `unified/UnifiedRegister.jsx` |
| `/admin/register` | `admin/AdminRegister.jsx` |

### 2.2 Player — `select-level` → `select-competition` → `select-team` → `dashboard`
### 2.3 Coach — `create-team`, `select-level`, `select-competition`, `dashboard` (1,141 L), `payment` (Razorpay)
### 2.4 Admin — `select-level`, `select-competition`, `dashboard`, `dashboard/:tab`, `teams`, `scoring`
Tabs inside `UnifiedDashboard`: `dashboard`, `teams`, `lots`, `scores`, `judges`, `transactions`.

### 2.5 Judge — `select-level`, `select-competition`, `dashboard` (1,248 L), `profile`, `team/:teamId`, `scoring`, `scoring/panel-review`, `sequence`
`/judge/scoring` renders **one of three screens by seat**: `JudgeScoring` (evaluation seats), `ScorerScoring`, or **`TimeKeeperScoring` + `StopwatchFace` (new, seat 7)**. A person seated as both Scorer and Time Keeper picks a role in a popup on the dashboard.

### 2.6 SuperAdmin — `dashboard`, `dashboard/:tab`, `add-player-payment`, `scoring`
Tabs: `overview`, `management` (`SuperAdminManagement.jsx`, **1,721 L, largest file**), `teams`, `lots`, `scores`, `judges`, `transactions`. **No `select-level`/`select-competition` for superadmin — intentional, preserve it.**

**Distinct rendered screens: ~50** (two more than v1: Time Keeper sheet, Team Championship board).

## 3. Component inventory

### 3.1 Design system (`components/design-system/`)
`theme/` (ThemeProvider = **role accent**, see §10.4) · `forms/` (ThemedButton/Input/Select/Textarea) · `cards/` (Glass/Dark/Stat/TiltCard) · `backgrounds/` · `ornaments/` · `animations/` (FadeIn, useReducedMotion) · `accessibility/` (LiveRegion) · `audit/`.

### 3.2 Dead code — corrected

| Component | Lines | Static refs | Dynamic/lazy refs |
|---|---:|---:|---:|
| `responsive/ResponsiveForm.jsx` | 289 | 0 | 0 |
| `responsive/ResponsiveGrid.jsx` | 326 | 0 | 0 |
| `responsive/ResponsiveImage.jsx` | 233 | 0 | 0 |
| `responsive/ResponsiveTypography.jsx` | 442 | 0 | 0 |
| `design-system/audit/DesignTokenAudit.jsx` | 709 | 0 | 0 |
| `backgrounds/Constellation.jsx` | — | 0 | 0 |
| `backgrounds/DiagonalBurst.jsx` | — | 0 | 0 |
| `backgrounds/HexMesh.jsx` | — | 0 | 0 |
| `backgrounds/RadialBurst.jsx` | — | 0 | 0 |
| **Total** | **2,349** | | |

Also dead once `ResponsiveForm` goes: the `ResponsiveFormContainer` export inside `ResponsiveContainer.jsx` (0 other users).

**Live and must stay:** `ResponsiveContainer` (used by 3 live components), `ResponsiveTable` (includes `ResponsiveScoringTable`, the score sheet — protected, §15), `ResponsiveFilters`, `ResponsiveRankings`, `AmbientOrbs`, `HexGrid`.

### 3.3 New since v1 (must be included in every pass)
`competition/CompetitionLockBanner.jsx` · `scores/TeamChampionshipBoard.jsx` · `judge/StopwatchFace.jsx` · `judge/TimeKeeperScoring.jsx` · `judge/scorerRows.js` · `judge/timeKeeper.js` · `hooks/useBodyScrollLock.js` · `hooks/useCompetitionLock.js`.

### 3.4 The four merged mobile primitives — preserve
`AmbientOrbs` (one clipping layer; its sizing lives in CSS on purpose) · `.modal-overlay` + `.modal-panel` (`flex-start` + auto margins, so a too-tall dialog never overflows off the top) · `.tap-safe` (44px below `md`) · `.stacked-table` (labelled cards below `md`, headers clipped, not hidden).

## 4. Design-system audit

### 4.1 Breakpoints — four sources of truth, not three
| Source | "desktop" means |
|---|---|
| `tailwind.config.js` `screens` (11 entries, 6 unused) | 1440px |
| `utils/ui/responsive.js` `BREAKPOINT_HELPERS.desktop` | 1440px |
| `utils/ui/responsive.js` `desktopOnly` / `RESPONSIVE_RANGES.desktop` | 1024px |
| **`styles/tokens.js` `DESIGN_TOKENS.breakpoints`** (missed in v1) | **1024px** (`wide` = 1280) |

Plus hard-coded `@media` in `index.css`, one of which is `max-width: 768px` against everyone else's 767 — **both rules apply at exactly 768px**.

### 4.2 Two z-index scales that collide
Tailwind: `mobile-menu 50 · modal 100 · tooltip 200`, plus `.mobile-dropdown` hard-coding `'100'`. `tokens.js`: `dropdown 10 · sticky 20 · fixed 30 · modalBackdrop 40 · modal 50 · popover 60 · tooltip 70`. **Tailwind's mobile menu and the tokens' modal are both 50.**

### 4.3 Light-theme utilities in a dark app
`.responsive-input/-select/-button` (white background, gray-900 text), `.mobile-menu-panel` (white), scrollbars (`#f1f1f1` track), `.scrollbar-thin`, `.image-loading`, `.image-error` (`#999` on `#f5f5f5`), `.table-mobile-cards`. These are dealt with in the appearance foundation (Phase 3), since they're exactly what a scheme-aware token layer replaces.

### 4.4 Inverted touch targets
`.responsive-input/-select/-button` set 44px on mobile, then `minHeight: auto` + `text-sm` at `md`. `.tap-safe` stops at 767. **Tablets get desktop touch sizing.** Second iOS consequence: inputs under 16px make iOS Safari zoom the page on focus, and `text-sm` is 14px from 768px up. **Every text field on an iPad triggers a zoom.**

### 4.5 Duplicates
`.stacked-table` vs `.table-mobile-cards` (the latter hides `thead` from screen readers) · `.touch-target` vs `.tap-safe` · `useReducedMotion` defined twice and re-exported a third time · `.aspect-*` shadowing Tailwind · Tailwind `primary`/`secondary` (blue/green) vs `DESIGN_TOKENS` role colours.

### 4.6 Suspected broken plugin output
`addComponents({ '.responsive-container': { '@apply container-responsive': {} } })` and three siblings. **Unconfirmed** — must be settled against the built CSS (Phase 3.1), not assumed.

### 4.7 Patterns the brief forbids, already present
`.no-horizontal-scroll` (`overflow-x: hidden; max-width: 100vw`; `100vw` includes the scrollbar, so it causes overflow on desktop) · `.mobile-full-width` (`calc(-50vw + 50%)`) · `100vh` ×3.

### 4.8 Inline styles
1,562 `style={{`. Worst: SuperAdminManagement 97, CoachDashboard 82, ResponsiveRankings 79, JudgeScoring 77, judgeShared 69, Home 69, AdminJudges 54. They defeat memoisation, cannot carry media queries, and — new in v2 — **are where most of the hard-coded dark colour lives** (§8).

## 5. Accessibility audit

- **Focus visible — P0.** `focus-visible` ×0, `outline-none` ×38, and a global `input:focus, select:focus, textarea:focus { outline: none; box-shadow: 0 0 0 3px rgba(59,130,246,0.1) }`, a 10%-opacity glow on `#0a0a0a`. Fails WCAG 2.4.7 app-wide.
- **Contrast — P0, new in v2.** See §9. 228 text sites and three roles' primary buttons fail 4.5:1 in the current dark theme.
- **Labels.** 42 `<input>` vs 26 `htmlFor`: up to 16 unlabelled, verify each (some may use `aria-label` or a wrapping `<label>`).
- **Table semantics.** 5 `<table>` vs 116 `grid-cols-`; the data grids have no row/column semantics. Scope per D2 (§22).
- **Motion.** CSS keyframes (`.fade-in`, `spin`, shimmer) are not gated by `prefers-reduced-motion`; `button { transition: all }`.
- **Clean:** `onClick` on `div`/`span` ×0; 353 `aria-*`.

## 6. Performance (UI layer)
`transition: all` on every button · 250ms resize debounce in `useResponsive` · `useResponsiveValue` subscribes to full resize state to pick one value · a resize listener per element in `useTouchTargetValidation` · 1,562 inline style objects defeat `React.memo` · **only 1 of the 10 dialogs locks body scroll** (`useBodyScrollLock`, SuperAdminManagement only), so the page scrolls behind every other open dialog; three mobile menus lock with their own independent `overflow` toggles, which clobber each other.

## 7. Test harness — what exists and what blocks Phase 2
- `npm run audit:responsive` / `audit:modals` / `audit:judge-walk` / `audit:shots`: 38 routes, 5 areas; checks overflow, touch targets and console errors.
- **Widths:** `MOBILE_WIDTHS [320,360,375,390,414,430]`, `DESKTOP_WIDTHS [1366,1440,1920]`. **No tablet widths; no 1280 or 1536.**
- **Browsers:** one Playwright project, Desktop Chrome. **No WebKit**, so nothing exercises iPhone/iPad Safari, which the standing rule says must work.
- **Accounts:** `CREDENTIALS` pick seed-roster people (Ravi / Rajesh / Atharva). Per project memory those accounts **do not exist in the current dev database** (SGAM-TRIALS-1). Recreating them means `setup --drop`, which would **destroy the TRIALS data**. Phase 2 therefore needs a separate audit database (§19).
- **The in-app preview browser cannot measure mobile layout.** It sizes `body` to 375 while `innerWidth` reports the pane's real width, so every fixed overlay looks broken. Playwright only.
- **Tailwind config edits do not hot-reload.** Restart the dev server; pass `E2E_BASE_URL` deliberately.

---

# PART II — APPEARANCE (LIGHT/DARK) AUDIT

## 8. How colour is authored today

| Form | Count | Notes |
|---|---:|---|
| `text-white` (bare) | ~352 | "foreground ink" |
| `text-white/NN` | 477 | text hierarchy expressed as opacity |
| `bg-white/NN` | 82 | glass surfaces |
| `border-white/NN` | 52 | hairlines |
| `bg-white` solid | 5 | review each |
| `ring/fill/stroke/placeholder/…-white` | 16 | |
| `bg-black(/NN)` | 4 | dialog scrims |
| `text-gray-*` / `bg-gray-*` | 22 / 6 | |
| Hex literals in JSX/JS | 375 | top: `#ef4444` ×74, `#22c55e` ×36, `#fff` ×34, `#3b82f6` ×25, `#a855f7` ×22 |
| `rgba(255,255,255,α)` | 464 | α mostly 0.02–0.08 (surfaces/borders) and 0.30–0.50 (text) |
| `rgba(0,0,0,α)` | 35 | shadows, scrims |
| **Hex + 2-digit alpha concatenation** `` `${COLORS.saffron}0A` `` | **428 in 48 files** | see §10.1 |
| framer-motion colour animations | 19 | see §10.2 |
| `dark:` prefixes | **3** | |

`text-white/NN` by bucket: 80–100 and bare → **380** · 60–75 → **111** · 40–55 → **220** · 15–35 → **118**.

## 9. Contrast analysis (computed, WCAG relative luminance)

### 9.1 Opacity text on its own page background
| α | Dark: white on `#0a0a0a` | Light: `#0b0d12` on `#f6f7f9` |
|---|---:|---:|
| 0.30 | 2.61 ✗ | 2.00 ✗ |
| 0.40 | 3.77 ✗ text | 2.66 ✗ |
| 0.45 | **4.48 ✗** (tokens.js calls this "improved contrast") | 3.06 ✗ text |
| 0.50 | 5.37 ✓ | 3.58 ✗ text |
| 0.60 | 7.30 ✓ | 4.99 ✓ |
| 0.70 | 9.76 ✓ | 7.17 ✓ |

Two conclusions:
1. **Dark already fails** at `text-white/40` and below: 228 sites under 4.5:1, and 94 under 3:1 at /30 and below.
2. **Opacity doesn't transfer.** AA needs α ≥ 0.50 on dark but α ≥ 0.60 on light. A light theme that only flips white to black would break 110 sites that pass today (/45–/55). Text therefore needs a semantic scale with separate values per theme (§14.4).

### 9.2 Role accents
| Accent | As text on `#0a0a0a` | As text on `#fff` | White label on it |
|---|---:|---:|---:|
| player saffron `#FF6B00` | 6.93 | 2.86 ✗ | **2.86 ✗** |
| superadmin gold `#F5A623` | 9.77 | 2.03 ✗ | **2.03 ✗** |
| coach green `#22C55E` | 8.69 | 2.28 ✗ | **2.28 ✗** |
| admin/judge purple `#8B5CF6` | 4.68 | 4.23 ✗ | 4.23 (large only) |
| public blue `#3B82F6` | 5.38 | 3.68 ✗ | 3.68 (large only) |
| error `#EF4444` | 5.26 | 3.76 ✗ | 3.76 (large only) |
| warning `#F59E0B` | 9.22 | 2.15 ✗ | 2.15 ✗ |

`ThemedButton`'s solid variant is `text-white` on the role colour, so **the primary action button for players, coaches and superadmins is 2.0–2.9:1 today.**

## 10. Hazards a naive theme switch would hit

1. **428 hex+alpha concatenations (48 files).** `` `${COLORS.saffron}0A` `` works only while the token is a 6-digit hex. Make it `var(--accent)` and it becomes `var(--accent)0A`, which is invalid, so the browser silently drops the declaration. No error, no warning, the background just disappears. Worst files: UnifiedRegister 23, Home 23, UnifiedLogin 20, AdminRegister 17, SuperAdminManagement 15, CompetitionSelectionScreen 15. The Tailwind plugin does the same thing in `.stacked-table`: `` `1px solid ${theme('colors.white')}14` ``.
2. **19 framer-motion colour animations** (e.g. `whileHover={{ background: 'rgba(239,68,68,0.12)' }}` in Navbar, CoachDashboard, Dropdown, CompetitionSelector, AdminScoring, AdminTeams). framer interpolates numeric colours and cannot interpolate `var(...)`.
3. **`ThemeProvider.hexToRgb`** parses the role hex to derive `primaryLight`/`primaryDark`, and returns `null` for a `var()` string.
4. **`theme('colors.white')` in 4 plugin rules** (one concatenation, three `backgroundColor`).
5. **Hard-coded roots:** `App.jsx` wraps everything in `style={{ background: '#0a0a0a' }}`; `index.css` `:root` sets `color-scheme: dark`, colour and background; the Toaster is `#363636` / `#fff`.
6. **No `<meta name="theme-color">`**, so the mobile browser chrome can't follow the theme.
7. **Name collision.** `ThemeProvider`/`useTheme` already mean *role accent* (13 files). Calling light/dark "theme" as well would make every future conversation ambiguous.
8. **Seven separate shells render account controls** (Navbar, UnifiedDashboard, CoachDashboard, JudgeDashboard, JudgeTeamPlayers, JudgeScoring, JudgePanelReview), and the Navbar is hidden on most routes. There's no single place to put a toggle.

**Good news:** no raster logos or images assume a dark background (only `vite.svg`); no chart library; only `sessionStorage` is cleared on logout (`AuthProvider` ×2, `obfuscatedStorage` ×1), so a `localStorage` preference survives sign-out; the CSP already allows same-origin scripts.

---

# PART III — STRATEGY

## 11. Agents
Three device agents own the outcome (your §7). Appearance is a cross-cutting concern, so it gets a **shared** auditor rather than a fourth primary agent:

| Agent | Band | Mandate here |
|---|---|---|
| **Desktop** | ≥1024 | Viewport efficiency at 1280×720 / 1366×768; density; multi-column; sticky toolbars. |
| **Tablet** | 768–1023 | **Build the missing band** — the core of the project. |
| **Mobile** | <768 | Verify the 09-03 work; close gaps (4 hand-rolled dialogs, 2 overflow tables, body scroll lock, iOS zoom). |
| Shared: **Appearance & Contrast Auditor** *(new)* | all | Both schemes on every screen; ratios against §14.4 targets; no concatenated colours left behind. |
| Shared: Design System · Accessibility (AccessLint) · Component Architecture · Performance · Regression | all | as v1 |

One product, three presentations, **two appearances**. Only presentation adapts.

## 12. Breakpoints — decided (D3)
Collapse to five: **`sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`**. Remove `xs`, `mobile`, `mobile-lg`, `tablet`, `desktop`, `desktop-lg`.
- The only `desktop:` uses are 3 classes in `ResponsiveContainer.jsx` (lines 50, 71, 77). `desktop:px-8` follows `lg:px-8` and does nothing, so it's deleted. `desktop:max-w-desktop-wide` becomes **`min-[1440px]:max-w-desktop-wide`**, which is pixel-identical. Whether 1440 should stay a step at all is a Desktop-agent question for Phase 7, not a Phase 3 edit.
- One source of truth: `tokens.js` `breakpoints` and `responsive.js` `BREAKPOINTS` are both **derived from** `tailwind.config.js`. "desktop" gets one meaning: ≥1024. The 768/767 overlap is fixed.
- `md` is then **re-read as tablet portrait**, one site at a time (D1).

## 13. Z-index — one scale
`base 0 · sticky 20 · dropdown 30 · overlay-nav 40 · scrim 50 · modal 60 · popover 70 · toast 80 · tooltip 90`, emitted as CSS vars and Tailwind `z-*`. `.mobile-dropdown`'s literal `'100'` and both old scales retire.

## 14. Appearance architecture — the specification

### 14.1 Two orthogonal axes, two names
- **Role accent** (exists): `ThemeProvider`/`useTheme` — purple, saffron, green, gold, blue by URL role. Keeps its name.
- **Appearance** (new): `AppearanceProvider` / `useAppearance` — `dark | light`. "Theme" is never used for this in code, copy or commits.

The two combine in CSS: `html[data-appearance][data-role]` resolves 6 roles × 2 appearances.

### 14.2 Preference model
- Values: `'dark' | 'light' | 'system'`. UI labels: **Dark · Light · Match device**. ("System" is jargon; "Match device" says what it does.)
- **Default: `dark`** (D5). Existing users see nothing change until they choose.
- Stored in plain `localStorage` under `mk-appearance`, not `obfuscatedStorage`: it isn't sensitive, it has to be readable before the bundle loads, and obfuscated storage keys depend on bundle code. Per device, not per account (D8), because an account field would need a server change.
- Every read and write goes through `try/catch`; storage can throw in some private-browsing modes. On failure it falls back to `dark` in memory.
- `system` follows `matchMedia('(prefers-color-scheme: light)')` live via a `change` listener.
- Cross-tab sync through the `storage` event, the same pattern `AuthProvider` already uses.
- Logout never touches it; verified that only `sessionStorage` is cleared.

### 14.3 No-flash bootstrap
- A `<1 KB` **classic** (non-module) script at `public/appearance-init.js`, loaded in `<head>` **before** any stylesheet. Module scripts are deferred and would paint once in the wrong appearance first.
- It reads the preference, resolves `system`, and sets `document.documentElement.dataset.appearance`, `style.colorScheme`, and the `theme-color` meta.
- **External, not inline, on purpose.** The CSP allows `'unsafe-inline'` today, but `index.html` itself notes the move to nonces. A same-origin file stays valid under `script-src 'self'` whatever happens to inline scripts, so no CSP change is needed now or later.
- Two `<meta name="theme-color">` tags with `media="(prefers-color-scheme: …)"`, plus an explicit override from the script when the preference isn't `system`.

### 14.4 Token layer — values (verified)
CSS custom properties in `index.css`, as RGB triplets so alpha still works: `rgb(var(--surface) / 0.8)`.

**Surfaces**
| Token | Dark (unchanged) | Light |
|---|---|---|
| `--bg` | `#0a0a0a` | `#f6f7f9` |
| `--surface` | `#111111` | `#ffffff` |
| `--surface-raised` | `#161616` | `#ffffff` + soft shadow |
| `--surface-sunken` | `#0a0a0a` | `#eef0f3` |
| `--surface-overlay` (dialogs) | `#1a1a1a` | `#ffffff` |
| `--scrim` | `rgb(0 0 0 / .6)` | `rgb(11 13 18 / .45)` |
| `--ink` (tints, hairlines) | `255 255 255` | `11 13 18` |

Light cards sit **above** the page (white on off-white), which keeps elevation consistent between appearances. That's why surfaces can't just follow `ink`: ink at 3% on a light page would make cards darker than the page and invert elevation. A cool neutral off-white is used, not the brand cream `#FFF8F0`: warm cream plus a saffron accent is one of the recognisable templated looks the frontend-design guidance warns against.

**Text and lines**: per-appearance alpha of `--ink`. Worst case across all surfaces:

| Token | Target | Dark α → worst ratio | Light α → worst ratio |
|---|---|---|---|
| `--fg` | ≥15 | 1.00 → 17.40 | 1.00 → 17.02 |
| `--fg-secondary` | ≥7 | 0.70 → 8.97 | 0.78 → 9.23 |
| `--fg-muted` | ≥4.5 | **0.55** → 6.03 | **0.64** → 5.60 |
| `--fg-subtle` *(decorative/disabled only)* | ≥3 | 0.38 → 3.50 | 0.45 → 3.03 |
| `--line` | decorative | 0.10 → 1.26 | 0.12 → 1.29 |
| `--line-strong` *(input borders, 1.4.11)* | ≥3 | 0.38 → 3.50 | 0.45 → 3.03 |

**Role accent**, set per `[data-role]`, one pair of values per appearance:
| Role | Dark fill = accent-fg | on-accent (dark) | Light fill | on-accent (light) | Light accent-fg (text) |
|---|---|---:|---|---:|---|
| player | `#FF6B00` | `#0a0a0a` 6.93 | `#C2410C` | `#fff` 5.18 | `#C2410C` |
| superadmin | `#F5A623` | `#0a0a0a` 9.77 | `#B45309` | `#fff` 5.02 | **`#92400E`** |
| coach | `#22C55E` | `#0a0a0a` 8.69 | `#15803D` | `#fff` 5.02 | **`#166534`** |
| admin / judge | `#8B5CF6` | `#0a0a0a` 4.68 | `#6D28D9` | `#fff` 7.10 | `#6D28D9` |
| public | `#3B82F6` | `#0a0a0a` 5.38 | `#1D4ED8` | `#fff` 6.70 | `#1D4ED8` |

Gold and green accent **text** uses the -800 shade in light mode because the -700 shade measures 4.39–4.40 on `--surface-sunken`. Buttons keep -700.

**Focus ring** = `--accent-fg`, 2px, 2px offset. Minimum against any surface: 4.11 dark (purple), 4.39 light. All ≥3:1.

**Status** (`success | warning | danger | info`), each with `-fg`, `-fill`, `-on`, `-tint`. Light: success `#15803D`, warning `#B45309`, danger `#B91C1C` (6.47 on white), info `#1D4ED8`. Dark: current hues with `#0a0a0a` labels on fills.

### 14.5 Tailwind integration
- `darkMode: ['selector', '[data-appearance="dark"]']` (supported by the installed 3.4.18), kept for the rare case that genuinely needs a different class, not as the main mechanism.
- Semantic colours: `bg`, `surface`, `surface-raised`, `surface-sunken`, `surface-overlay`, `fg`, `fg-secondary`, `fg-muted`, `fg-subtle`, `line`, `line-strong`, `accent`, `accent-fg`, `on-accent`, `success-*`, `warning-*`, `danger-*`, `info-*`.
- **Transitional alias (Layer A):** Tailwind `white` is redefined as `rgb(var(--ink) / <alpha-value>)`. With `--ink: 255 255 255` in dark, **all ~1,440 `text/bg/border-white` sites render pixel-identically**; in light they flip to ink straight away. That makes light mode usable for testing across untouched files while the semantic migration proceeds file by file. A literal `snow: '#ffffff'` is added for text that genuinely must stay white (labels on photos or fills; 7 known `text-white`-on-saturated-background sites plus inline `#fff`).
  - Prerequisites, in order: fix the 4 `theme('colors.white')` plugin uses; review the 5 solid `bg-white` and 16 `ring/fill/stroke/placeholder-white` sites.
  - The alias is **removed at the end** (Phase 9 exit). A check fails CI if new `text-white`/`bg-white/` appear after migration.

### 14.6 JS token layer
- New `alpha(color, a)` in `styles/tokens.js`. It accepts a legacy hex or a token name. For a hex it returns exactly what the concatenation produced: `a` is passed as the **byte** (`0x0A`), not a rounded decimal, so dark stays pixel-identical.
- **Order is mandatory:** codemod all 428 `${X}NN` → `alpha(X, 0xNN)` first → verify zero diff → only then point role and status tokens at CSS variables (`rgb(var(--accent-rgb) / a)`). Swapping the tokens first breaks 48 files silently (R8).
- `DESIGN_TOKENS.colors.surfaces/borders/text` values become `rgb(var(--…))` strings once the codemod is in, so the 13 files that read `DESIGN_TOKENS` and the 13 that read `useTheme()` follow the appearance **without re-rendering**.
- `ThemeProvider`: drop `hexToRgb`; `primary` → `rgb(var(--accent))`, `primaryLight` → `rgb(var(--accent-rgb) / .15)`; it sets `data-role` on `<html>`.
- The 19 framer colour animations move to CSS `hover:`/`transition-colors`. This is the same lesson as the stopwatch, where framer lagged and was replaced with plain CSS.

### 14.7 Special surfaces
| Surface | Treatment |
|---|---|
| **`StopwatchFace`** (26 hex) | Stays a **dark instrument in both appearances** (D7): rendered inside a `data-appearance="dark"` island so its tokens resolve dark. It's modelled on the iOS Clock stopwatch, which is dark in both appearances, and its amber 60–90 s / red 90+ band **is the COP time window** (judge-slip rules), so its colours carry rule meaning. |
| `AmbientOrbs` / `HexGrid` | Colour props from accent tokens; light uses a lower `--orb-opacity` and smaller blur (bright blurred orbs read as smudges); `HexGrid` stroke = `--line`. |
| Toaster | `--surface-overlay`, `--fg`, `--line`; status icons from status tokens. |
| Razorpay (`CoachPayment`, `SuperAdminAddPlayerPayment`) | Their checkout can't read CSS variables. Pass the resolved accent hex via `getComputedStyle(documentElement).getPropertyValue('--accent-hex')`. |
| `index.css` | `color-scheme` per appearance (native pickers and scrollbars follow); scrollbars per appearance (fixes today's light scrollbar on the dark app); `::selection`; `:-webkit-autofill` background per appearance (login forms otherwise get Chrome's pale fill in dark or the wrong fill in light); `.image-loading`/`.image-error`. |
| `App.jsx` root | Inline `#0a0a0a` → `bg-bg`. |
| Dialog scrims (`bg-black/NN`, ×4) | → `--scrim`. |

### 14.8 The control
- **`AppearanceMenu`**: an icon button (lucide `Moon`/`Sun`/`Monitor`, already a dependency) showing the *resolved* appearance, with accessible name **"Appearance: Dark"**. It opens a menu of three `menuitemradio` entries, **Dark · Light · Match device (currently Light)**, with the active one checked.
- Keyboard: Enter/Space opens; arrows move; Esc closes and returns focus to the button. It reaches 44px at every touch width (mobile *and* tablet).
- **Not a cycling button.** Cycling makes people remember the order (recognition over recall, your §5).
- On change: the `LiveRegion` announces "Appearance: Light"; transitions are suppressed for one frame so 200 elements don't cross-fade. That's a single scoped rule, the one justified `!important` in the project.
- **Switching is an attribute flip, never a reload or remount.** Only the control consumes `useAppearance()`; everything else follows through CSS variables. A judge mid-slip keeps every mark, the autosave and the socket (§15.4).

### 14.9 Placement
One shared `AccountControls` cluster, so every shell shows the same thing in the same order: **[Appearance] [Account/Profile] [Log out]**.

| Shell | Where |
|---|---|
| `Navbar` | right cluster, before logout |
| `UnifiedDashboard` (admin + superadmin, 13 tabs) | header account cluster |
| `CoachDashboard` | header account cluster |
| `JudgeDashboard`, `JudgeTeamPlayers`, `JudgePanelReview` | header account cluster |
| `JudgeScoring`, `ScorerScoring`, `TimeKeeperScoring` | header only, **never inside the sticky Submit bar** |
| Public (`Home`, `/scores`, login, register, forgot/reset, NotFound) | top-right of the page header |
| Level/competition selection screens | top-right, same position as public |

### 14.10 Rollout gate
The light appearance is **not exposed** until every route passes the light matrix (Phase 9). Until then it is reachable only through `localStorage` or a `?appearance=light` query param honoured by the bootstrap script, for testing. No user ever sees a half-migrated light theme.

## 15. Protected behaviours (from project memory)

Several of these are easy to break with exactly the work this plan does. Treat them as spec.

1. **Score sheet never scrolls sideways.** `ResponsiveScoringTable` divides the width it has: `table-layout: fixed`, participant column 16%, equal shares elsewhere, inputs `width: 100%`, headers **wrap**. Don't restore `whiteSpace: nowrap`, don't rely on the wrapper's `overflow-x`, don't drop a column. The tablet pass must re-measure it at 768 and 1024 with a 5-column panel.
2. **The Chief's copy is a display seat.** A 4-judge panel is drawn with 5 columns on the Scorer sheet. Column count ≠ panel size; `ResponsiveScoringTable` takes an explicit `panelSize`. Layout refactors must not derive columns from `judges.length`.
3. **Mark fields are number-only text inputs** (`type="text"`, `inputMode="decimal"`, `DecimalInput`), never `type="number"`. E2E selectors target `inputmode="decimal"`. The iOS ≥16px font rule (§4.4) applies to them too.
4. **Judge slip.** The phone slip is **three tabs** plus a **pinned Live Final Score**, and nothing may sit under the fixed Submit footer. Refresh keeps the slip (autosave waits for `useJudgeInfo`), and `beforeunload` guards unsubmitted marks, so **nothing in this project may trigger a reload.** An edit never shows the old score ("Loading your submitted score…").
5. **COP wording is verbatim, including capitalisation** ("At Least once…"). **No `uppercase`/`capitalize` utilities on COP text.** Same for stored values: render levels with `levelLabel()`, since CSS-capitalising prints "Dso".
6. **Stopwatch:** rAF writes SVG transforms and the buttons are plain CSS. Don't reintroduce framer-motion. Whole seconds; amber/red band = rule window. Dark island (§14.7).
7. **Pass-through:** with one competition at a level, `CompetitionSelectionScreen` renders only "Opening <name>…", never a frame of the list. Level cards say "Counting…" until the role's own list loads. New skeletons must not replace either state.
8. **Public breakdown** shows the panel-rule average, with no per-judge J1–J4 pills. Don't re-add them in the name of "preserving information".
9. **Every device includes iPhone and Safari.** WebKit joins the test matrix (§19).

---

# PART IV — PHASES

Sequenced by severity (your §52) rather than the literal §53 order, and stated as such.

### Phase 2 — Safety net *(no visual change)*
- 2.1 **Audit database.** Point the Server at a separate database (override its Mongo connection string for the run) and seed it with the roster chain. **Never run `--drop` against the everyday dev database**, which holds SGAM-TRIALS-1.
- 2.2 Harness widths: add `TABLET_WIDTHS = [768, 820, 834, 1024]`, and add 1280 and 1536 to desktop. New script `audit:tablet`.
- 2.3 WebKit: `playwright install webkit`; projects `iPhone 13` (390), `iPad Mini` (768), `iPad Pro 11` (834, + landscape). Chromium stays the default.
- 2.4 `APPEARANCE=dark|light|both` env in the harness, set through `addInitScript` writing `mk-appearance` before navigation. It does nothing until Phase 3 ships the bootstrap, which is fine.
- 2.5 Baselines: screenshots of 38 routes × 13 widths (dark); `npm test`, `npm run lint`, `audit:responsive`, `audit:modals`, `audit:judge-walk` all green; AccessLint scan per route saved.
- *Exit:* every later phase can be diffed against this.

### Phase 3 — Foundation *(dark stays pixel-identical; screenshot diff must be 0)*
- 3.1 Build the CSS and prove whether the four `@apply` components emit anything; delete only if they're empty.
- 3.2 Breakpoints → 5 (D3); `ResponsiveContainer` lines 50/71/77 as §12. **Restart the dev server.**
- 3.3 One breakpoint source (Tailwind → `responsive.js` → `tokens.js`); fix 768/767.
- 3.4 One z-index scale (§13).
- 3.5 Delete the dead set (§3.2, 2,349 L), after checking the built bundle, not grep alone.
- 3.6 De-duplicate `.table-mobile-cards`, `useReducedMotion`, `.aspect-*`.
- 3.7 Remove `.no-horizontal-scroll` / `.mobile-full-width`; fix what the harness then reports. `100vh` → `100dvh` (with `100vh` fallback first for old WebKit).
- 3.8 **Appearance plumbing:** CSS variables for both appearances (§14.4, light values dormant); `appearance-init.js` + `theme-color` metas; `AppearanceProvider`/`useAppearance`; `App.jsx` root and `index.css` `:root` on tokens.
- 3.9 **Codemod** 428 concatenations → `alpha(X, 0xNN)`; fix the 4 `theme('colors.white')` plugin sites. Diff 0.
- 3.10 Tailwind `white` → ink alias + `snow`; review the 5 solid `bg-white` and 16 other white utilities. Diff 0 in dark.
- 3.11 Light-only utilities from §4.3 moved onto tokens, or deleted if unreferenced.
- *Exit:* dark screenshot diff = 0 across the matrix; light is reachable via the query param and legible, but not yet correct.

### Phase 4 — Accessibility foundation *(visible changes, all justified by WCAG)*
- 4.1 Global `:focus-visible` ring (§14.4) replaces the `input:focus` strip; pair each of the 38 `outline-none` sites with it.
- 4.2 **Primary buttons:** `ThemedButton` solid → `bg-accent text-on-accent`. In dark, labels on saffron/gold/green/blue/purple become near-black (D6).
- 4.3 **Muted text:** the 220 `text-white/40–55` sites → `text-fg-muted` (dark α .55). /40 and /45 get visibly brighter.
- 4.4 The 118 `text-white/15–35` sites are reviewed **one by one**: decorative/disabled → `text-fg-subtle`; carries information → `text-fg-muted`.
- 4.5 Labels for the up-to-16 unlabelled inputs; heading hierarchy; motion gated by `prefers-reduced-motion`; `transition: all` → explicit properties.
- 4.6 Table semantics on data-dense grids only (D2).
- *Exit:* AccessLint clean (dark) on all 38 routes; keyboard walk from login to score submission.

### Phase 5 — Per-file pass: tablet band + semantic colour *(the main body)*
Each file below is opened **once**. For each file:
- **(a)** classify every `md:` site as tablet, desktop or ambiguous, and write it down (D1);
- **(b)** add the tablet layout: 44px targets at 768–1023, ≥16px inputs on coarse pointers, column counts, dialog sizes;
- **(c)** migrate colour to semantic tokens: text by bucket, `bg-white/NN` → surfaces, `border-white/NN` → `line`, inline `rgba(255,255,255,α)` → `rgb(var(--ink) / α)` or semantic, hex → accent/status tokens, framer colour animations → CSS;
- **(d)** screenshot diff at 768 / 820 / 1024 in **both** appearances, plus 375 and 1366 to prove mobile and desktop didn't move;
- **(e)** re-run the file's tests.

Order is **public → player → coach → admin → superadmin → judge**, with judge last because it's socket-driven and used mid-meet.

| # | File | Lines | `md:` | white cls | rgba-W | hex+α | style | framer colour |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | `public/Home.jsx` | 839 | **36** | 44 | 1 | 25 | 69 | 1 |
| 2 | `public/PublicScores.jsx` | 487 | 4 | 9 | 22 | 11 | 30 | 0 |
| 3 | `scores/PlayerRankingBoard.jsx` | 253 | 0 | 1 | 21 | 3 | 22 | 0 |
| 4 | `scores/TeamChampionshipBoard.jsx` | 111 | 0 | 3 | 12 | 2 | 11 | 0 |
| 5 | `responsive/ResponsiveRankings.jsx` | 418 | 0 | 0 | 5 | 8 | 79 | 0 |
| 6 | `unified/UnifiedLogin.jsx` | 724 | 0 | 11 | 1 | 22 | 35 | 0 |
| 7 | `unified/UnifiedRegister.jsx` | 934 | 0 | 14 | 1 | 24 | 35 | 0 |
| 8 | `admin/AdminRegister.jsx` | 516 | 0 | 19 | 1 | 18 | 31 | 0 |
| 9 | `shared/ForgotPassword.jsx` | 237 | 0 | 12 | 2 | 6 | 17 | 0 |
| 10 | `shared/ResetPassword.jsx` | 548 | 0 | 20 | 8 | 6 | 32 | 0 |
| 11 | `competition/LevelSelectionScreen.jsx` | 322 | 3 | 6 | 11 | 13 | 15 | 0 |
| 12 | `competition/CompetitionSelectionScreen.jsx` | 932 | 3 | 20 | 14 | 19 | 30 | 0 |
| 13 | `competition/CompetitionSelector.jsx` | 317 | 0 | 6 | 10 | 11 | 24 | 2 |
| 14 | `competition/CompetitionDisplay.jsx` | 119 | 0 | 1 | 5 | 7 | 13 | 0 |
| 15 | `layout/Navbar.jsx` | 228 | 1 | 14 | 2 | 4 | 18 | 1 |
| 16 | `auth/ConfirmDialog.jsx` | 197 | 0 | 9 | 2 | 5 | 13 | 0 |
| 17 | `auth/Dropdown.jsx` | 201 | 0 | 5 | 7 | 6 | 9 | 1 |
| 18 | `player/PlayerTeamSelection.jsx` | 270 | 5 | 15 | 2 | 8 | 14 | 0 |
| 19 | `player/PlayerDashboard.jsx` | 550 | 4 | 23 | 4 | 12 | 25 | 1 |
| 20 | `coach/CoachCreateTeam.jsx` | 219 | 0 | 7 | 6 | 5 | 17 | 0 |
| 21 | `coach/CoachDashboard.jsx` | 1,141 | 16 | 65 | 18 | 20 | 82 | 2 |
| 22 | `coach/CoachPayment.jsx` | 716 | 1 | 48 | 4 | 9 | 44 | 0 |
| 23 | `unified/UnifiedDashboard.jsx` | 876 | 12 | 17 | 6 | 14 | 36 | 2 |
| 24 | `admin/AdminTeams.jsx` | 317 | 3 | 40 | 5 | 8 | 23 | 1 |
| 25 | `admin/AdminLots.jsx` | 405 | 2 | 19 | 2 | 4 | 14 | 0 |
| 26 | `admin/AdminScores.jsx` | 541 | 1 | 26 | 6 | 6 | 15 | 0 |
| 27 | `admin/AdminJudges.jsx` | 1,070 | 1 | 40 | 9 | 22 | 54 | 0 |
| 28 | `admin/AdminTransactions.jsx` | 456 | 2 | 29 | 7 | 11 | 25 | 0 |
| 29 | `performance/PerformancePanel.jsx` | 440 | 0 | 5 | 33 | 9 | 33 | 0 |
| 30 | `superadmin/AddPlayerForm.jsx` | 824 | 1 | 19 | 15 | 8 | 36 | 0 |
| 31 | `superadmin/SuperAdminAddPlayerPayment.jsx` | 488 | 1 | 30 | 1 | 3 | 25 | 0 |
| 32 | `superadmin/SuperAdminManagement.jsx` | **1,721** | 8 | **84** | 28 | 23 | **97** | 1 |
| 33 | `admin/AdminScoring.jsx` | 796 | 5 | 31 | 4 | 18 | 30 | 1 |
| 34 | `judge/JudgeDashboard.jsx` | 1,248 | 2 | 55 | 9 | 2 | 19 | 0 |
| 35 | `judge/JudgeTeamPlayers.jsx` | 562 | 1 | 25 | 3 | 0 | 17 | 0 |
| 36 | `judge/JudgeSequence.jsx` | 372 | 0 | 23 | 4 | 2 | 13 | 0 |
| 37 | `judge/judgeShared.jsx` | 871 | 0 | 21 | **59** | 1 | 69 | 0 |
| 38 | `judge/JudgeScoring.jsx` | 1,221 | 0 | 48 | 45 | 1 | 77 | 1 |
| 39 | `judge/ScorerScoring.jsx` + `responsive/ResponsiveTable.jsx` | 910 + 553 | 4 | 24 | 4 | 11 | 26 | 2 |
| 40 | `judge/JudgePanelReview.jsx` | 705 | 0 | 18 | 17 | 0 | 39 | 3 |
| 41 | `judge/TimeKeeperScoring.jsx` (+ `StopwatchFace` island) | 274 | 2 | 7 | 2 | 2 | 15 | 0 |

*(Files under 25 combined signals and the `design-system/` internals are handled with their first consumer. Judge files 37–41 are re-verified with a real `node Server/scripts/resetScores.js --commit` against the audit DB, not the `WALK_UNLOCK` response rewrite.)*

- *Exit:* `audit:tablet` clean at 768/820/834/1024, portrait and landscape, Chromium + WebKit; no `${X}NN` left anywhere; `text-white` only where `snow` was meant.

### Phase 6 — Mobile gap closure
- 6.1 Move the 4 hand-rolled `fixed inset-0` dialogs onto `.modal-overlay`.
- 6.2 Adopt `useBodyScrollLock` in every `.modal-overlay` user (currently 1 of 10), and move the three hand-rolled menu locks onto it too (`Navbar.jsx:28`, `Home.jsx:252`, `UnifiedDashboard.jsx:295`). Each writes `body.style.overflow` independently, so a menu closing while a dialog is open unlocks the page underneath. The hook's own header comment describes exactly this clobbering.
- 6.3 The 2 remaining `overflow-x-auto` tables → `.stacked-table` or a justified `data-allow-overflow`.
- 6.4 `audit:judge-walk` with tab switching and the Submit-footer `elementFromPoint` check, in both appearances.

### Phase 7 — Desktop viewport efficiency
Measure content height at 1280×720 and 1366×768 for all routes; reduce by grouping, multi-column and sticky toolbars, **never by shrinking type**; decide the fate of the 1440 container step (§12).

### Phase 8 — Shared components
Extract only where duplication is proven: `PageHeader` · `AccountControls` (§14.9) · `FilterToolbar` · `DataTable` wrapper · `Pagination` · `StatusBadge` (status tokens) · `EmptyState` · `ErrorState` · `LoadingSkeleton` (must not replace the §15.7 states) · `FormField` · `MetricCard`. The 9 deleted dead components are the precedent to avoid.

### Phase 9 — Light appearance completion and exposure
- 9.1 Full matrix in light: 38 routes × 13 widths, Chromium + WebKit; AccessLint contrast per route.
- 9.2 Tune the orbs, scrims, shadows and toaster by eye against the checklist in your §57.
- 9.3 Ship `AppearanceMenu` in every shell (§14.9) and lift the rollout gate.
- 9.4 Remove the `white` → ink alias; turn on the CI check forbidding new `text-white`/`bg-white/`.

### Phase 10 — Performance
Resize handling on `requestAnimationFrame` at ~100ms; stop `useResponsiveValue` subscribing to everything; one shared resize observer; re-check memoisation now that the colour inline styles are gone; confirm an appearance switch triggers **no React commit** outside the menu (React Profiler).

### Phase 11 — Regression and final report
All roles, all routes, 13 widths, 2 appearances, 2 engines, plus your §47 edge cases (long names, empty and single-item sets, many items, long errors, slow network, failed requests). Deliver the §62 report, including a section per protected behaviour in §15.

---

## 16. Priorities
**P0:** focus visible · dark-theme contrast (primary buttons, muted text) · tablet touch-target inversion + iPad input zoom · overflow patches · the 768/767 overlap.
**P1:** tablet band · WebKit and tablet coverage · 4 hand-rolled dialogs + scroll lock · 2 overflow tables · table semantics on data grids · desktop vertical efficiency · appearance foundation (because it gates light).
**P2:** light appearance completion · breakpoint and z-index consolidation · dead code · shared components.
**P3:** motion polish, micro-interactions. Not started while P0/P1 are open.

## 17. Why one pass per file
The tablet review and the colour migration touch the same lines of the same ~40 files and are checked by the same screenshots. Two separate passes would double the review cost, and doubling it on `SuperAdminManagement` (1,721 lines, 97 inline styles) alone would be expensive. The foundation phases (3, 4) are deliberately cross-cutting and mechanical, so Phase 5 is purely judgement work.

## 18. Verification protocol
| Check | Command | Gate |
|---|---|---|
| Unit | `npm test` | green |
| Lint | `npm run lint` | green |
| Overflow + targets | `npm run audit:responsive` (`ROLE=`, `WIDTHS=`, `AUDIT_HEIGHT=`, `APPEARANCE=`) | no new findings |
| Tablet | `audit:tablet` (new) | clean |
| Dialogs | `audit:modals` | clean |
| Judge flow | `audit:judge-walk` | clean, both appearances |
| Visual | `audit:shots` | diff reviewed vs Phase-2 baseline; **0 in dark for Phase 3** |
| A11y | `accesslint:accessibility-scan` per route per appearance | no new violations |
| Colour hygiene | grep `\$\{[A-Za-z_.]+\}[0-9A-Fa-f]{2}` | 0 after 3.9 |

Screenshot volume: full matrix is 38 × 13 × 2 = 988 per engine. Per-commit smoke uses 3 widths (375, 820, 1366) × 2 appearances; the full matrix runs at each phase exit.

## 19. Environments
- **Audit DB:** separate database, seeded by the roster chain; its accounts match `CREDENTIALS`. The everyday dev DB (SGAM-TRIALS-1, hand-seated panels) is never dropped or reseeded by this project.
- **Dev servers:** the owner usually already has 5000/5173 running; reuse them and pass `E2E_BASE_URL` explicitly.
- **Preview pane:** fine for reading pages; **never** for judging mobile layout.

## 20. Risk register
| # | Risk | Mitigation |
|---|---|---|
| R1 | Re-reading `md` silently moves 167 sites | Per-site classification, per-file diff (D1) |
| R2 | Deleting code that's dynamically imported | Check the built bundle (Phase 3.5) — v1 already miscounted once |
| R3 | Tailwind config not hot-reloading | Mandatory restart; explicit `E2E_BASE_URL` |
| R4 | Preview pane misreporting mobile | Playwright only |
| R5 | Exposing one role's controls to another | Per-role walk in Phase 11 |
| R6 | Judge screens are live and stateful | Last in order; real reset; §15 checklist |
| R7 | Inline-style conversion shifting values | Byte-exact `alpha()`; diff 0 |
| **R8** | **Concatenated colours becoming invalid CSS silently** (428 / 48 files) | Codemod before any token swap; grep gate = 0 |
| **R9** | framer can't animate `var()` (19 sites) | Move to CSS before swap |
| **R10** | `white`-means-ink alias confusing future code | Time-boxed to Phase 9; CI check afterwards |
| **R11** | Visible dark changes from a11y fixes (button labels, 220 muted texts, 118 reviewed) | The only part existing users will notice; screenshot review; release note |
| **R12** | `setup --drop` against the dev DB | Separate audit DB (§19) |
| **R13** | Flash of the wrong appearance on load | Blocking classic bootstrap before CSS (§14.3) |
| **R14** | WebKit-only defects (`dvh`, autofill, safe-area, input zoom) | WebKit projects from Phase 2 |
| **R15** | A reload from the toggle losing a judge's slip | Attribute flip only; judge-walk asserts marks survive a toggle |

## 21. Out of scope
Business logic · API contracts/endpoints · anything in `Server/` · data values and calculations · permissions and auth · workflows and journeys · navigation meaning · role capabilities · form/field meaning · filter/sort/search behaviour · validation rules · table contents · metrics · status meanings · **COP text** · **storing the appearance on the account** (needs a server field).

Also noted but not scheduled: the app still uses Vite's default `vite.svg` favicon.

## 22. Decisions

**Settled by the owner (2026-09-20)**
- **D1** — `md` re-read per site with screenshot diffs, never a global replace; each site recorded as tablet, desktop or ambiguous.
- **D2** — Table semantics on data-dense grids only (stable column meaning repeating across rows, plus a header row).

**Decided under the standing rule** (recommended option, no change to any user flow):
- **D3** — Breakpoints → `sm md lg xl 2xl`. `desktop:` → `min-[1440px]:`, pixel-identical.
- **D4** — Inline styles: **every colour-bearing inline style is tokenised**, because light mode is impossible otherwise. Geometry-only inline styles stay unless their file is already open and a token fits.
- **D5** — Default appearance **Dark**; options Dark / Light / Match device. Nothing changes for anyone until they choose.
- **D6** — In dark, primary-button labels become near-black on the bright role fills (2.0–2.9:1 → 4.7–9.8:1). Visible, but the flow is unchanged and it's required by WCAG.
- **D7** — The stopwatch stays a dark instrument in both appearances.
- **D8** — Appearance is saved per device, not per account.

**Open:** none blocking. If you want the preference to follow the account across devices (D8), that needs a server field and would be a separate, backend-scoped change.

## 23. Definition of done
All ~50 screens pass overflow, targets and console at 13 widths, portrait and landscape, in **both appearances**, on **Chromium and WebKit** · AccessLint clean in both appearances · focus visible everywhere · every §9 contrast failure fixed · no concatenated colours, no `white`-as-ink alias · appearance menu in every shell, keyboard-operable, surviving logout and reload with no flash · all §15 behaviours re-verified · no data point, column, metric or control removed · every role's routes verified · `npm test` + lint green · the §62 report delivered.
