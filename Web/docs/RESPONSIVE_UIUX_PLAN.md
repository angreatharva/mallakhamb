# Responsive UI/UX Transformation — Audit & Implementation Plan

**Status:** Phase 1 (Discovery) complete. No application code modified.
**Branch at audit time:** `feat/competition-level-selection`
**Date:** 2026-09-20
**Scope:** `Web/` only. `Server/` is out of scope and must not be touched.

---

## 0. The single most important finding

**This is not a greenfield responsive project. Roughly half of it already exists, and the half that is missing is not the half you would guess.**

Commit `29d34fc` — *"feat(web): adapt every screen for mobile, desktop unchanged"* — is merged into the current branch. It introduced a deliberate, well-reasoned mobile adaptation built on four shared primitives, plus a Playwright audit harness covering 38 routes. That work is good and must be preserved, not redone.

Its explicit design decision was that **every primitive stops at the `md` breakpoint (767px)** so the desktop baseline stayed untouched. The consequence, never addressed:

> **Tablets get the full desktop layout at 768px wide, with desktop touch metrics, and no test ever measures it.**

The evidence is unambiguous:

| Signal | Count | Meaning |
|---|---:|---|
| `md:` prefixes in JSX | 166 | Layouts switch mobile→desktop at 768px |
| `lg:` prefixes in JSX | 60 | Only 60 refinements exist at 1024px |
| `tablet:` prefixes in JSX | **0** | The dedicated tablet breakpoint is never used |
| Tablet widths in the audit harness | **0** | `MOBILE_WIDTHS` + `DESKTOP_WIDTHS` only |

`MOBILE_WIDTHS = [320, 360, 375, 390, 414, 430]`, `DESKTOP_WIDTHS = [1366, 1440, 1920]` (`e2e/support/responsive-audit.js:15`). The 768–1024 band — iPad portrait, the single most common tablet posture — is measured by nothing.

**Revised project shape:** Mobile = verify and close gaps. Tablet = build, this is the real work. Desktop = density and viewport efficiency, per your §8/§29.

---

# PART I — AUDIT FINDINGS

## 1. Stack and architecture (verified against source)

- React 19.1 + Vite 7 + Tailwind 3, SPA, package `mallakhambindia`. Path alias `@/` → `src/`.
- Router: react-router-dom 7. All pages lazy via `routes/lazy-pages.js`.
- Provider chain (`App.jsx`): `ErrorBoundary → BrowserRouter → AuthProvider → AppContent → CompetitionProvider → Navbar? + AppRoutes`.
- Per-role layouts wrap `ProtectedRoute` + `RouteErrorBoundary` (own ErrorBoundary + Suspense) + `<Outlet/>`.
- Data: imperative axios (`services/api-client.js`), two instances (`api`, `publicApi`). **No TanStack Query** — it was removed. No cache layer.
- Real-time: socket.io-client in judge scoring + `AdminScoring`.
- Global theme is **dark**: `#0a0a0a` background, `color-scheme: dark`, text `#f3f4f6`.
- Source size: 94 `.jsx`, 64 `.js`, 1 `.css` (`src/index.css`), 30,820 JSX lines total.
- Tests: 17 Vitest files, 17 Playwright specs (4 of them responsive audits).

## 2. Route and page inventory

### 2.1 Public / unauthenticated (14 route entries, 5 components)

| Route | Component | Notes |
|---|---|---|
| `/` | `public/Home.jsx` (839 L) | Marketing home, heavy decoration |
| `/scores` | `public/PublicScores.jsx` | Public leaderboards, data-dense |
| `/forgot-password` | `shared/ForgotPassword.jsx` | |
| `/reset-password`, `/reset-password/:token` | `shared/ResetPassword.jsx` (548 L) | |
| `*` | `NotFound` | Catch-all; deliberately **not** a redirect |
| `/{player,coach,admin,judge,superadmin}/login` | `unified/UnifiedLogin.jsx` (724 L) | **One component, 5 routes.** Role derived from URL path |
| `/{player,coach,judge}/register` | `unified/UnifiedRegister.jsx` (934 L) | |
| `/admin/register` | `admin/AdminRegister.jsx` (516 L) | Separate from UnifiedRegister |

### 2.2 Player (4 routes)
`select-level` → `select-competition` → `select-team` → `dashboard` (`PlayerDashboard.jsx`, 549 L).
Level and competition render the shared `components/competition/LevelSelectionScreen.jsx` / `CompetitionSelectionScreen.jsx` (854 L).

### 2.3 Coach (5 routes)
`create-team`, `select-level`, `select-competition`, `dashboard` (`CoachDashboard.jsx`, **1,128 L**), `payment` (`CoachPayment.jsx`, 716 L — Razorpay).

### 2.4 Admin (6 routes + 6 dashboard tabs)
Routes: `select-level`, `select-competition`, `dashboard`, `dashboard/:tab`, `teams`, `scoring` (`AdminScoring.jsx`, 745 L, socket).
Tabs (rendered inside `UnifiedDashboard`, **not** top-level routes): `dashboard`, `teams`, `lots`, `scores`, `judges`, `transactions`.

### 2.5 Judge (8 routes)
`select-level`, `select-competition`, `dashboard` (1,069 L), `profile` (457 L), `team/:teamId` (562 L), `scoring` (**1,092 L**), `scoring/panel-review` (695 L), `sequence`.
Plus `ScorerScoring.jsx` (768 L) for Scorer-type judges, and shared plumbing in `judgeShared.jsx` (726 L) + `useJudgePanelData.js`.

### 2.6 SuperAdmin (4 routes + 7 dashboard tabs)
Routes: `dashboard`, `dashboard/:tab`, `add-player-payment` (488 L), `scoring` (reuses `AdminScoring`).
Tabs: `overview`, `management` (`SuperAdminManagement.jsx`, **1,606 L — largest file in the app**), `teams`, `lots`, `scores`, `judges`, `transactions`.

**Note:** `select-level` / `select-competition` exist for player, coach, admin and judge — **but not superadmin**. Preserve that asymmetry; it is intentional (superadmin is not competition-scoped).

**Distinct rendered screens: ~48.**

## 3. Component inventory

### 3.1 Design system — `components/design-system/` (33 files)
`theme/` (ThemeProvider, useTheme) · `forms/` (ThemedButton, ThemedInput, ThemedSelect, ThemedTextarea) · `cards/` (GlassCard, DarkCard, StatCard, TiltCard) · `backgrounds/` (AmbientOrbs, Constellation, DiagonalBurst, HexGrid, HexMesh, RadialBurst) · `ornaments/` (GradientText, ShieldOrnament, CoachOrnament) · `animations/` (FadeIn, useReducedMotion) · `accessibility/` (LiveRegion) · `audit/` (DesignTokenAudit).

This is a real design system and is the correct foundation to build on.

### 3.2 `components/responsive/` — **5 of 8 are dead code**

| Component | Used outside its own dir | Verdict |
|---|---:|---|
| `ResponsiveTable.jsx` (479 L) | 4 files | Keep, extend for tablet |
| `ResponsiveFilters.jsx` | 1 file | Keep |
| `ResponsiveRankings.jsx` | 1 file | Keep |
| `ResponsiveContainer.jsx` | **0** | Dead |
| `ResponsiveForm.jsx` | **0** | Dead |
| `ResponsiveGrid.jsx` | **0** | Dead |
| `ResponsiveImage.jsx` | **0** | Dead |
| `ResponsiveTypography.jsx` | **0** | Dead |

**1,452 lines of unused responsive abstraction**, while pages hand-roll their own layout inline. Plus `design-system/audit/DesignTokenAudit.jsx` (709 L, 0 references) = **2,161 lines of dead UI code.**

This is the central irony of the current codebase: the reusable primitives you are asking for were written, then never adopted.

### 3.3 The four merged mobile primitives (preserve — these are correct)

1. **`AmbientOrbs`** — one clipping layer replacing six per-page orb implementations. Fixed a real bug: an orb at `left: 95%` grew the document and made **judge screens scroll sideways at 1440px**, not just on phones. Size scales via `--orb-scale` set by media query in CSS, deliberately not JS.
2. **`.modal-overlay` + `.modal-panel`** — replaced 17 hand-written dialog shells. Uses `align-items: flex-start` + auto block margins, because `align-items: center` sends a too-tall panel's overflow off the **top**, where browsers refuse to scroll. Save/Cancel rows were unreachable on phones.
3. **`.tap-safe`** — 44px floor, `max-width: 767px` only. Exists because `.touch-target` applies at every width and would inflate dense desktop toolbars.
4. **`.stacked-table`** — table → labelled cards below `md`, via `data-label`. Headers are clipped (not `display: none`) so they stay available to screen readers. No column is dropped.

## 4. Design system audit

### 4.1 Breakpoints — explosion, and three competing sources of truth

`tailwind.config.js` defines **11 screens**:
`xs` 320 · `mobile` 320 · `mobile-lg` 480 · `sm` 640 · `md` 768 · `tablet` 768 · `lg` 1024 · `xl` 1280 · `desktop` 1440 · `2xl` 1536 · `desktop-lg` 1920

Actual usage in JSX: `sm:` 114, `md:` 166, `lg:` 60, `xl:` 1, `desktop:` 3, and **`xs:` / `mobile:` / `mobile-lg:` / `tablet:` / `2xl:` / `desktop-lg:` = 0**.

Six unused aliases, two exact duplicates (`xs`≡`mobile` at 320, `md`≡`tablet` at 768). Directly violates your §18 "avoid breakpoint explosion".

Three separate definitions of the same concept:
- `tailwind.config.js` `theme.screens`
- `src/utils/ui/responsive.js` `BREAKPOINTS` + `RESPONSIVE_RANGES`
- Hardcoded `@media` queries in `src/index.css`

And **"desktop" means two different things** inside `responsive.js` alone: `BREAKPOINT_HELPERS.desktop` = `min-width: 1440px`, while `BREAKPOINT_HELPERS.desktopOnly` = `min-width: 1024px` and `RESPONSIVE_RANGES.desktop.min` = 1024.

### 4.2 Off-by-one breakpoint overlap
`index.css:269` uses `@media (max-width: 768px)` while every primitive uses `max-width: 767px`. **At exactly 768px both the mobile and the tablet rule apply.**

### 4.3 Light-theme utilities inside a dark application

The app background is `#0a0a0a`. These all render light-on-dark:

| Location | Problem |
|---|---|
| `tailwind.config.js` `.responsive-input` | `backgroundColor: white`, `color: gray.900`, `border: gray.300` |
| `.responsive-select`, `.responsive-button` | Same |
| `.mobile-menu-panel` | `backgroundColor: white` |
| `index.css:55-60` scrollbar | track `#f1f1f1`, thumb `#c1c1c1` |
| `index.css:78` `.scrollbar-thin` | thumb `#d1d5db` |
| `index.css:238` `.image-loading` | `#f0f0f0 → #e0e0e0` gradient |
| `index.css:254` `.image-error` | bg `#f5f5f5`, text `#999` — fails contrast on any background |
| `.table-mobile-cards` | border `#e5e7eb` |

### 4.4 Inverted touch targets — tablets lose the 44px floor

`.responsive-input`, `.responsive-select` and `.responsive-button` each set `minHeight: 44px` at mobile, then at `@screen md` (768px+) set **`minHeight: auto`** and drop font to `sm`.

Combined with `.tap-safe` stopping at 767px, the result is systemic: **a tablet is a touch device that receives desktop touch metrics.** This is the mechanism behind the tablet gap, not just an oversight in page layout.

### 4.5 Duplicate and conflicting primitives

| Concern | Implementations | Issue |
|---|---|---|
| Stacked tables | `.stacked-table` (correct) **and** `.table-mobile-cards` (legacy) | Legacy uses `thead { display: none }` — removes headers from screen readers — plus `paddingLeft: 50%` absolute positioning |
| Touch targets | `.touch-target` / `.touch-target-lg` (all widths) **and** `.tap-safe` (<768 only) | Conflicting philosophies |
| Reduced motion | `hooks/useResponsive.js:243` **and** `design-system/animations/useReducedMotion.js:18`, re-exported again in `public/Home.jsx:23` | Three call sites for one hook |
| Aspect ratios | `index.css` `.aspect-square` / `.aspect-video` **and** Tailwind's built-ins | Shadowing |
| Colors | Tailwind `primary`(blue)/`secondary`(green) **and** `styles/tokens.js` `DESIGN_TOKENS` (per-role saffron/purple/green/gold) | Two unrelated palettes |

### 4.6 Broken Tailwind plugin code

```js
const responsiveComponents = {
  '.responsive-container': { '@apply container-responsive': {} },
  ...
};
addComponents(responsiveComponents);
```

`@apply` is not valid inside an `addComponents` object literal this way. `.responsive-container`, `.responsive-grid`, `.responsive-flex` and `.responsive-text` are almost certainly emitting nothing. **Must be confirmed against built CSS before removal** — see Phase 3, Task 3.1.

### 4.7 Forbidden patterns already in the codebase

Your §48 / GUARDRAIL 7 explicitly prohibits these, and they are present:

- `.no-horizontal-scroll` = `overflowX: hidden` + `maxWidth: 100vw`. This is overflow-hidden as a generic patch. Worse, `100vw` **includes the scrollbar width**, so on desktop it actively causes the overflow it claims to prevent.
- `.mobile-full-width` uses `calc(-50vw + 50%)` — same scrollbar mismatch.
- `100vh` used 3× (`body`, `#root`, `.responsive-img-hero`) — the classic mobile address-bar bug. Needs `100svh`/`100dvh`.

### 4.8 Inline styles — 1,505 occurrences

`style={{` appears **1,505 times** across the app. Worst offenders:

| File | Count |
|---|---:|
| `superadmin/SuperAdminManagement.jsx` | 93 |
| `coach/CoachDashboard.jsx` | 82 |
| `components/responsive/ResponsiveRankings.jsx` | 79 |
| `judge/JudgeScoring.jsx` | 78 |
| `components/responsive/ResponsiveTable.jsx` | 70 |
| `design-system/audit/DesignTokenAudit.jsx` | 70 |
| `public/Home.jsx` | 69 |
| `judge/judgeShared.jsx` | 67 |
| `admin/AdminJudges.jsx` | 51 |

Three consequences: (1) it is the root cause of the visual inconsistency, since values are authored per-site rather than from tokens; (2) every inline object is a **new identity on every render**, defeating `React.memo` on any child receiving it; (3) inline styles cannot carry media queries, which is *why* responsive behaviour had to be bolted on separately.

Also 274 arbitrary Tailwind values (`p-[13px]`-style). No `!important` anywhere — genuinely clean on that axis.

## 5. Accessibility audit

### 5.1 Focus visibility — systemic WCAG 2.4.7 failure (P0)

| Signal | Count |
|---|---:|
| `focus-visible` anywhere in `src/` | **0** |
| `outline-none` in JSX | 38 |
| `focus:` utility classes | 35 |

Plus the global rule at `index.css:99`:

```css
input:focus, select:focus, textarea:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
```

Every text input, select and textarea in the application has its focus outline removed and replaced with a blue glow at **10% opacity** — on a `#0a0a0a` background this is very close to invisible. 38 further sites strip outlines individually. Nothing anywhere restores a `:focus-visible` ring.

This alone fails WCAG 2.1 AA and makes the app keyboard-hostile. It is the highest-value single fix in the project.

### 5.2 Other accessibility signals

| Signal | Count | Read |
|---|---:|---|
| `aria-*` attributes | 353 | Healthy baseline |
| `aria-label` | 75 | |
| `role="…"` | 46 | |
| `onClick` on `div`/`span` | **0** | Excellent — no fake buttons |
| `<label htmlFor>` | 26 | vs 40 `<input>` — **up to 14 potentially unlabelled inputs, must be verified individually** |
| Headings `<h1>`–`<h6>` | 120 | Hierarchy correctness unverified |
| `alt=` | 21 | vs 17 `<img>` — plausibly complete |
| `role="table"` / `"grid"` | 1 | See below |

### 5.3 Data presented without table semantics
Only **5 `<table>` elements in 4 files**, against **108 `grid-cols-` usages**. Most tabular data in this app is CSS grid with no table semantics and no `role="table"`. A screen reader user gets an undifferentiated list of cells with no row/column relationships.

This is a genuine finding but must be handled carefully — converting grids to tables is a structural change. Scope it to *adding semantics*, not re-authoring layout.

### 5.4 Motion
`useReducedMotion` exists and `FadeIn` honours it. But CSS animations in `index.css` (`.fade-in`, `spin`, `.image-loading` shimmer) are **not** gated by a `@media (prefers-reduced-motion: reduce)` block. `button { transition: all 0.2s }` is ungated and uses `all`.

## 6. Performance observations (UI-layer only)

- `button { transition: all 0.2s ease-in-out }` — `transition: all` animates every property including layout-affecting ones.
- `useResponsive()` uses a **250ms** resize debounce; noticeably laggy on device rotation. It also returns a fresh object each render, and `useResponsiveValue()` calls the full hook (subscribing to resize) merely to pick a value.
- `useTouchTargetValidation` attaches a `resize` listener **per element**.
- 1,505 inline style objects defeat memoization (see §4.8).
- Six SVG background components; `AmbientOrbs` correctly moved sizing to CSS to avoid re-render, but the others were not audited for the same issue.
- No route-level data caching since TanStack Query was removed — repeat navigations refetch.

## 7. What the existing audit harness already covers

`npm run audit:responsive` (plus `audit:modals`, `audit:judge-walk`, `audit:shots`) drives real Playwright viewports across **38 routes in 5 areas** (public 14, judge 8, admin 9, superadmin 4, coach 5, player 4), asserting:
- horizontal overflow, with a `data-allow-overflow` opt-out
- undersized touch targets
- console errors and page errors

**Operational constraint, learned the hard way and recorded in project memory:** the in-app preview browser **cannot** measure this app's mobile layout. Its emulation sets `body` to 375px while `window.innerWidth` still reports the pane's real width (~656px), so every `position: fixed` overlay — i.e. all modals and drawers — lays out against the wrong number and reads as broken when it is fine. **All responsive verification goes through Playwright.** Chasing one phantom modal overflow this way previously cost an hour.

**Second constraint:** editing `tailwind.config.js` does **not** hot-reload. The utility silently does not exist and computed styles show the unstyled default. Restart the dev server after every config edit, and pass `E2E_BASE_URL` deliberately when more than one dev server is running.

---

# PART II — STRATEGY

## 8. Agent model

Per your §7/§11, three device agents own the outcome, with shared auditors. Mapping to this codebase:

| Agent | Band | Primary mandate here |
|---|---|---|
| **Desktop Agent** | ≥1024px | Viewport efficiency (§8/§29): kill excess vertical height on 1280×720 and 1366×768. Density, multi-column, sticky toolbars. *Layout semantics stay as-is.* |
| **Tablet Agent** | 768–1023px | **Build the missing band.** Highest-value agent on this project. |
| **Mobile Agent** | <768px | Verify the 2026-09-03 work holds; close gaps (4 un-migrated modals, 3 overflow-x tables). |
| **Shared auditors** | all | Design System · Accessibility (AccessLint) · Component Architecture · Performance · Regression |

**Constraint for all agents (your §12):** one product, three presentations. Same IA, terminology, data, flows, component semantics. Only presentation adapts.

## 9. Target breakpoint system

Collapse 11 screens to **5 real ones**, keeping the names already used in 340 JSX prefixes so no page churns:

| Token | Width | Band | Current usage |
|---|---:|---|---:|
| `sm` | 640 | Large phone | 114 |
| `md` | 768 | **Tablet portrait** | 166 |
| `lg` | 1024 | Laptop | 60 |
| `xl` | 1280 | Desktop | 1 |
| `2xl` | 1536 | Wide desktop | 0 |

**Remove:** `xs`, `mobile`, `mobile-lg`, `tablet`, `desktop`, `desktop-lg` — but `desktop:` has **3 live usages** that must be rewritten to `xl:` first, and `2xl` is retained despite 0 usage because wide-desktop max-width capping needs it.

Critically, `md` must be **reinterpreted**: today it means "not a phone, therefore desktop." It must come to mean "tablet portrait", with `lg` as the first genuinely desktop band. This reinterpretation is the core of the tablet work and the main regression risk — see §16.

## 10. Token strategy

`styles/tokens.js` `DESIGN_TOKENS` already holds per-role colour. Extend, don't replace:
- Promote spacing / radii / shadow / z-index / motion-duration scales into tokens.
- Emit as CSS custom properties on `:root` so they work in both Tailwind classes and the remaining inline styles.
- Retire Tailwind's unused `primary`(blue) / `secondary`(green) palettes once confirmed unreferenced.
- Z-index: replace the 3-value scale and the hardcoded `zIndex: '100'` in `.mobile-dropdown` (which collides with `modal`) with one ordered scale.

---

# PART III — PHASED IMPLEMENTATION

Ordering follows your §53, resequenced so the highest-severity defects land first.

### Phase 2 — Safety net *(no visual change)*
- **2.1** Add tablet widths to the harness: `TABLET_WIDTHS = [768, 820, 834, 1024]`; add `1280`, `1536` to desktop. Add `audit:tablet` script.
- **2.2** Capture baseline screenshots at all 13 widths × 38 routes via `audit:shots`.
- **2.3** Record a green baseline: `npm test`, `npm run lint`, `npm run audit:responsive`.
- **2.4** Add `AccessLint` scan of key routes as a recorded baseline.
- *Exit:* every subsequent phase is diffable against this.

### Phase 3 — Design system normalization
- **3.1** Build the CSS and diff it to prove whether `.responsive-container` / `-grid` / `-flex` / `-text` emit anything (§4.6). Delete only if confirmed empty.
- **3.2** Collapse breakpoints to 5. Rewrite the 3 `desktop:` usages → `xl:`. **Restart dev server.**
- **3.3** Single breakpoint source of truth: `responsive.js` derives from the Tailwind config; fix the two conflicting meanings of "desktop"; fix the 768/767 overlap.
- **3.4** Fix light-theme utilities (§4.3) to dark tokens, or delete if unreferenced.
- **3.5** Remove `.no-horizontal-scroll` and `.mobile-full-width`; fix the real overflow sources the harness reports.
- **3.6** `100vh` → `100dvh`/`100svh` (3 sites).
- **3.7** De-duplicate: delete `.table-mobile-cards`; unify `useReducedMotion` to one module; remove shadowed `.aspect-*`.
- **3.8** Delete 2,161 lines of dead code (5 responsive components + `DesignTokenAudit`) **after** confirming zero references including dynamic imports.
- **3.9** Z-index and motion-duration scales into tokens.

### Phase 4 — Accessibility foundation **(P0 — do not defer)**
- **4.1** Replace the global `input:focus` outline-strip with a token-driven `:focus-visible` ring meeting 3:1 contrast against `#0a0a0a`.
- **4.2** Audit all 38 `outline-none` sites; pair each with a visible `focus-visible` ring.
- **4.3** Verify the 40 `<input>` against 26 `htmlFor` — label every unlabelled control.
- **4.4** Gate CSS animations behind `prefers-reduced-motion`; replace `transition: all`.
- **4.5** Verify heading hierarchy across 120 headings.
- **4.6** Add `role="table"`/`rowgroup`/`row`/`cell` semantics to grid-based data views **without** changing layout.
- *Exit:* AccessLint clean on all 38 routes; full keyboard walkthrough of login → score submission.

### Phase 5 — Tablet band **(the main build)**
- **5.1** Restore the 44px touch floor for 768–1023: extend `.tap-safe`, remove the `minHeight: auto` inversion at `@screen md` (§4.4).
- **5.2** Re-point layout switches: audit all 166 `md:` prefixes and decide per site whether the breakpoint means "tablet" or "desktop"; move the latter to `lg:`.
- **5.3** Navigation: sidebar/`UnifiedDashboard` tab rail behaviour for tablet portrait vs landscape.
- **5.4** Tables at tablet: currently either stacked (<768) or full desktop. Needs a middle density.
- **5.5** Forms: column counts for 768–1023.
- **5.6** Dialogs: sizing between phone-full-width and desktop-centred.
- *Exit:* `audit:tablet` clean at 768/820/834/1024, portrait and landscape.

### Phase 6 — Mobile gap closure
- **6.1** Migrate the 4 remaining hand-rolled `fixed inset-0` modals to `.modal-overlay`.
- **6.2** Resolve the 3 `overflow-x-auto` tables → `.stacked-table` or justified opt-out.
- **6.3** Re-run `audit:judge-walk`. **Remember the judge slip is three tabs** (Difficulty / Combination / Exec & Orig) — scrolling shows only the first; the other two must be clicked to render. Anything measuring that screen must switch tabs, and nothing may hide under the fixed 77px Submit footer.

### Phase 7 — Desktop viewport efficiency (your §8/§29)
- **7.1** Measure real content height at 1280×720 and 1366×768 across all 38 routes.
- **7.2** Reduce excess vertical space via grouping and multi-column — **not** by shrinking type (GUARDRAIL 5).
- **7.3** Content max-widths and sticky contextual toolbars where they earn their place.

### Phase 8 — Shared component consolidation
Extract, from observed duplication only (§39): PageHeader · FilterToolbar · DataTable wrapper · Pagination · StatusBadge · EmptyState · ErrorState · LoadingSkeleton · FormField · ButtonGroup · MetricCard.
**Constraint:** extract a component only where duplication is already proven — no speculative abstraction (§38). The 5 dead components are the cautionary precedent.

### Phase 9 — Inline style reduction
1,505 sites is too many to convert safely in one pass. Convert **only** where a site is (a) in a file being touched for another reason, and (b) expressible as a token. Target the top 9 files (629 occurrences, 42%). Explicitly **not** a goal to reach zero.

### Phase 10 — Performance
Resize debounce 250ms → ~100ms with `requestAnimationFrame`; stop `useResponsiveValue` subscribing to full resize state; consolidate per-element resize listeners; re-check memoization once inline styles drop.

### Phase 11 — Regression & final audit
Full matrix, all roles, all 38 routes, 13 widths, plus the §47 edge cases (long names, empty datasets, many items, multiple validation errors, slow network). Produce the §62 report.

---

## 11. Priority classification

**P0 (fix first):** focus-visible failure (§5.1) · tablet touch-target inversion (§4.4) · `.no-horizontal-scroll` overflow patches (§4.7) · light-theme controls in dark app (§4.3) · 768/767 overlap (§4.2)

**P1:** tablet layout band (§0) · missing tablet test coverage · 4 un-migrated modals · 3 overflow-x tables · grid data without table semantics · desktop vertical efficiency

**P2:** breakpoint collapse · duplicate primitives · dead code · inline-style reduction · shared component extraction

**P3:** motion polish · micro-interactions · decorative refinement — **not to be started while any P0/P1 remains open** (your §52).

## 12. Verification protocol

| Check | Command | Gate |
|---|---|---|
| Unit | `npm test` | Must stay green |
| Lint | `npm run lint` | Must stay green |
| Overflow + touch targets | `npm run audit:responsive` | No new findings |
| Tablet | `audit:tablet` *(to be added, 2.1)* | Clean |
| Modals | `npm run audit:modals` | Clean |
| Judge flow | `npm run audit:judge-walk` | Clean |
| Visual diff | `npm run audit:shots` | Reviewed vs Phase-2 baseline |
| Accessibility | `accesslint:accessibility-scan` per route | No new violations |

`ROLE=`, `WIDTHS=` and `AUDIT_HEIGHT=` env vars scope any run; `AUDIT_HEIGHT` covers landscape.

**A fully judged meet has no openable score sheet** — that is the normal end state. To exercise judge scoring, prefer a real `node Server/scripts/resetScores.js --commit` over the `WALK_UNLOCK=1` response-rewriting path, because the faked path never exercises anything downstream of a real slip. Clearing `isFinalized` alone is insufficient: the roster derives "locked" from all five of `isFinalized` / `hasScore` / `isLocked` / `judgeSlips` / `judgeScores`.

## 13. Risk register

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Reinterpreting `md` (§9) silently changes 166 layout sites** — the single largest regression risk | Per-site review, never global find/replace. Screenshot diff each one against the Phase-2 baseline. |
| R2 | Deleting "dead" code that is dynamically imported | Confirm via built bundle, not grep alone |
| R3 | Tailwind config edits not hot-reloading → false results | Mandatory dev-server restart; explicit `E2E_BASE_URL` |
| R4 | Preview browser misreporting mobile layout | Playwright only, never the preview pane |
| R5 | Touching role-conditional rendering could expose another role's controls | Per-role regression walk in Phase 11 (§43) |
| R6 | Judge scoring is socket-driven and mid-competition stateful | Treat as highest-risk area; change last, verify with a real reset |
| R7 | Inline-style conversion changing computed values | Convert only token-expressible sites; visual diff each file |

## 14. Explicitly out of scope

Per your §2 and §60 — and stated here so no agent drifts into them: business logic, API contracts and endpoints, database structure, any `Server/` file, data calculations and values, permissions, auth/authorization behaviour, workflows and user journeys, navigation meaning, role capabilities, form/field meaning, filter/sort/search behaviour, validation rules, table information content, dashboard metrics, entity relationships, status meanings.

Presentation adapts. Meaning does not.

## 15. Definition of done

All 38 routes pass overflow, touch-target and console checks at 13 widths across mobile, tablet and desktop, portrait and landscape · AccessLint clean, keyboard walkthrough complete, focus visible everywhere · zero data points, columns, metrics or controls removed · all roles verified against their own route sets · `npm test` and `npm run lint` green · visual diff reviewed against the Phase-2 baseline with every change justified · §62 report delivered.

---

## 16. Decisions

### 16.1 Settled (owner-approved 2026-09-20)

**D1 — `md` reinterpretation: per-site review, screenshot-diffed.**
No global find/replace under any circumstances. Each of the 166 `md:` sites is reviewed individually, its intent classified as *tablet* or *desktop*, and only desktop-intent sites move to `lg:`. Every changed site is visual-diffed against the Phase-2 baseline before it is accepted. This is the slowest available route and is chosen deliberately: R1 is the largest regression risk in the project.

*Implementation note:* record the classification per site (file:line → tablet | desktop | ambiguous) as the work proceeds, so the decision is auditable afterwards and ambiguous sites can be escalated rather than guessed.

**D2 — Grid table semantics: data-dense views only.**
Add `role="table"` / `rowgroup` / `row` / `cell` to genuine data grids only — scores, teams, transactions, judges, superadmin management. Decorative grids and card-layout grids are left alone; marking those up as tables would be actively wrong for screen-reader users. Layout is not re-authored in either case (§4 of Phase 4.6).

*Boundary test for inclusion:* the grid has a stable column meaning that repeats across rows, and a header row (visual or otherwise). If it does not, it is layout, not a table.

### 16.2 Still open

1. **Breakpoint collapse (§9)** — proceed with the 11→5 reduction, or keep the unused aliases and simply stop adding to them? The reduction is cleaner but touches the config that every page compiles against. *Not blocking until Phase 3.2.*
2. **Inline styles (Phase 9)** — confirm that "reduce meaningfully in the top 9 files" (629 of 1,505 occurrences) is the target, rather than eliminating all of them. *Not blocking until Phase 9.*
