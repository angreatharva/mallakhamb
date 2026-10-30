---
doc: 07-COMPONENTS
covers:
  - src/components/auth/AccountLockoutMessage.jsx
  - src/components/auth/ConfirmDialog.jsx
  - src/components/auth/Dropdown.jsx
  - src/components/auth/SafeText.jsx
  - src/components/auth/PasswordStrength.jsx
  - src/components/admin/AdminKit.jsx
  - src/components/ui/**
  - src/components/layout/AppearanceMenu.jsx
  - src/components/layout/ErrorBoundary.jsx
  - src/components/layout/Navbar.jsx
  - src/components/ordering/SortableList.jsx
  - src/components/scores/PlayerRankingBoard.jsx
  - src/components/scores/LuckyDrawPanel.jsx
  - src/components/auth/SignOutOnBackDialog.jsx
  - src/components/scores/ScoreCategoryFilters.jsx
  - src/components/scores/scoreRows.js
  - src/components/competition/CompetitionDisplay.jsx
  - src/components/competition/CompetitionLockBanner.jsx
  - src/components/competition/CompetitionSelector.jsx
  - src/components/competition/CompetitionSelectionScreen.jsx
  - src/components/competition/LevelSelectionScreen.jsx
  - src/components/performance/PerformancePanel.jsx
  - src/components/superadmin/AddPlayerForm.jsx
  - src/utils/security/sanitize.js
read_when: "reusing or changing a shared (non-design-system, non-responsive) component"
depends_on: [05-DESIGN-SYSTEM, SHARED-CONTRACTS]
verified_against_commit: 4201319
last_verified: 2026-10-30
---

## Scope

This doc covers everything under `src/components/**` **except**
`design-system/**` and `responsive/**`, which have their own doc
([05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md)). The full real file list
(confirmed by glob, superseding any partial listing elsewhere):

```
components/auth/{AccountLockoutMessage,AuthLoadingSpinner,ConfirmDialog,Dropdown,SafeText}.jsx
components/competition/{CompetitionDisplay,CompetitionLockBanner,CompetitionSelectionScreen,CompetitionSelector,LevelSelectionScreen}.jsx
components/layout/{ErrorBoundary,Navbar}.jsx
components/ordering/SortableList.jsx
components/performance/PerformancePanel.jsx
components/scores/{PlayerRankingBoard,ScoreCategoryFilters,scoreRows}.js(x)
components/superadmin/AddPlayerForm.jsx
```

`AuthLoadingSpinner.jsx` is documented in
[10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md) instead (it's a
`protected-route.jsx` implementation detail); noted here only for
completeness.

## Rollout additions (design-language W1–W4 + Phase 6, 2026-10-10/11)

- `ui/Notice` (inline status, 3px rule; caller passes the role),
  `ui/RunningOrder` + `RunningOrderItem` (numbered choice rows; `titleAs="h3"`
  where the e2e flows read the card's h3), `ui/TextLink`, `Grain local`,
  `Heading asIs` (names keep their case), popover/picker CSS (`ui/popover.css`:
  `.ui-picker`, `.ui-popover*`, used by `auth/Dropdown` and
  `competition/CompetitionSelector`), `.ui-check` (checkbox chip),
  `.info-line`.
- `shell/AuthLayout` + `AuthHeader` + `AuthLinks`: every sign-in, register,
  forgot and reset screen (black stage side, `data-appearance="dark"` island).
  `AppHeader` gained `extra`, `fixed`, `navFrom="xl"`, `compactBrand`, and
  keeps the Light/Dark switch in the bar at every width. `AccountControls`
  says "Logout" (the e2e name).
- `scores/board.css`: the results board (`.sb-*`), the squad (`.squad-*`),
  the fee sheet (`.pay-sheet*`), `.perf-tab`. Imported through `ui.css`.
- `admin/AdminKit` keeps its names (DarkCard, FadeIn, DarkBtn…) but is drawn
  by the primitives; `auth/ConfirmDialog` (isOpen/message API) wraps the
  `ui` ConfirmDialog.
- `components/design-system/` is gone except `accessibility/LiveRegion`.

## `shell/` and `brand/` (design-language Phase 4, branch `look/phase-4-shells`)

**2026-10: the account menu.** `Shell.jsx` exports `AccountMenu` (a `ui/Menu`:
My profile, Change password → `#password`, Update email → `#email`;
targets from `accountMenuTargets(profileTo)`) and `AccountControls` now
renders Light/Dark, `AccountMenu`, Logout (`drawer` prop: plain links inside
the phone sheet). `AppHeader` derives `profileTo = /${role}/profile` for
every signed-in role. `JudgeDashboard` uses `AccountMenu` directly. See
[06-SCREENS/account-and-player-identity.md](06-SCREENS/account-and-player-identity.md).
`components/account/AccountRequestsPanel.jsx` (+ `account.css`) — the
coach's approvals list for no-email players; documented there too.

`@/components/shell`: `AppHeader` (wordmark, RoleIdent, competition
"segment", TabNav from `lg`, AccountControls from `md`, a menu button
opening a `Dialog sheet` drawer below those; below 480px the wordmark
collapses to the mark, name kept for screen readers), `PageHeader`
(the page h1), `RoleIdent`, `AccountControls`, `TabNav` (NavLink,
`aria-current="page"`). `@/components/brand/Brand`: `BRAND_NAME`,
`Wordmark`, `PoleMark` (saffron via `--brand-fg`). Built in Phase 4,
adopted per rollout wave. Trap: a Tailwind layout utility on a
component's ROOT beats the component's own breakpoint CSS (utilities
win ties) — `AccountControls` once showed on phones because of a `flex`
class. `look-specimen.spec.js` now fails on masthead overlap/overflow.

**Judge screens don't use `AppHeader`: they use `JudgeHeader`**
(`src/pages/judge/judgeShared.jsx`, `c32815c`), the shell masthead drawn
with `shell-header judge-header` classes (CSS in `shell/shell.css`), on all
seven judge screens. Props: `back {label,onClick,disabled}`, `title`,
`subtitle` (who is judging / the seat), `context` (usually
`<ScoringFor name team />` — the athlete being scored), `live` (renders
`LiveDot` when not `null`), `status`, `actions`, `onLogout`, `wide`. It is a
`forwardRef`: **the slip measures the header through that ref to place its
pinned score bar** — keep the ref when restyling. Every control keeps its
accessible name (e2e reads them).

## `ui/` — the look primitives (design-language Phase 3, branch `look/phase-3-primitives`)

`@/components/ui`: Button, IconButton, Field + Input/Select/Textarea/
PasswordInput, Panel, Heading, Tag, StatusTag, Stat, SpecList, DataTable,
Tabs/TabPanel, Segmented, Dialog, ConfirmDialog, Menu, Spinner, Skeleton,
EmptyState, ErrorState, Grain, `toastOptions`. The guide is
`docs/design-language/README.md`; the specimen is `/__look` (dev /
`VITE_LOOK_OVERRIDE=1` builds only). They read tokens only and import
`@/styles/look-fonts`. Their CSS is NOT imported per component: it is one
`ui.css`, imported at the top of `index.css` before Tailwind's layers, so
preflight loses to them and pages' layout utilities beat them on ties.
Traps already hit:
- `:where()` base rules lost to preflight (`button { padding: 0 }`) — base
  rules are single classes.
- A loading label hidden with `visibility: hidden` dropped the button's
  accessible name — it is `color: transparent`.
- `.stacked-table`'s `::before` labels (35% ink) fail contrast on light
  surfaces and the route audit cannot see pseudo text — `ui-table` restyles
  them; `look-specimen.spec.js` measures `::before` text.
Tests: `ui/ui.test.jsx` (roles, keyboard, focus trap, states).

## Shared pieces added by the responsive/appearance work (2026-10)

Phase 8 merged proven duplicates; each keeps every caller's behaviour.

- **`auth/PasswordStrength.jsx`** — `PasswordStrengthIndicator({password,
  minLength = 8, strongLength = 12})` and `PasswordRequirements({password,
  minLength = 8})`. **Each form passes its own policy**: admin registration
  and the superadmin add-player form use 12/16, player-style forms 8. Don't
  "unify" the defaults — the differences are deliberate.
- **`admin/AdminKit.jsx`** — the admin screens' kit: `DarkCard`, `FadeIn`,
  `EmptyState`, `LoadingState`, `DarkSearch`, `DarkBtn`, drawn by the `ui`
  primitives. The old `design-system` twins are deleted; `EmptyState` still
  also exists in `@/components/ui` (see
  [05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md#same-names-different-components)).
- **`JudgeLogoutButton`** (exported from `pages/judge/judgeShared.jsx`,
  `{onLogout, compact}`) — the one judge logout control.
- **`layout/AppearanceMenu.jsx`** — the Light/Dark control: an icon button
  showing the RESOLVED appearance, opening a menu of Dark / Light / Match
  device (a menu, not a cycling button). Full keyboard support, announces the
  change through a polite live region, renders nothing outside an
  `AppearanceProvider`. Switching is an attribute flip — nothing remounts or
  reloads. `CornerAppearanceMenu` is the fixed corner version for pages with
  no header (`App.jsx` decides which pages). In the judge slip it sits in the
  header, never in the Submit bar.
- **`hooks/useBodyScrollLock(isLocked)`** — one counted lock, used by
  `ConfirmDialog`, `Navbar`'s drawer, `CompetitionSelector`, and the dialogs
  in the admin/coach/player/judge/superadmin screens.

## `auth/` — small shared primitives

**`SignOutOnBackDialog.jsx`** (2026-10-12) — props `open`, `onClose`. The
"Sign out?" `ConfirmDialog` (danger tone; "Sign out" / "Stay signed in") that
`hooks/useSignOutOnBack` raises when Back would leave the signed-in area —
see [03-ROUTING-AND-NAV.md](03-ROUTING-AND-NAV.md#sign-out-on-back). Calls
`logout()` **only**: logout already drops the stored meet and level, and
clearing the meet first makes the coach dashboard redirect mid-logout.

**`AccountLockoutMessage.jsx`** — props: `lockoutEndTime` (Date,
required, no default), `primaryColor` (string, default `'#FF6B6B'`).
Countdown banner after repeated failed logins; runs its own 1s
`setInterval` computed from `lockoutEndTime - now`, self-clears once
unlocked (`:20-42`). Purely presentational — does not itself re-enable a
locked form; a parent must react to unlock separately.

**`ConfirmDialog.jsx`** — props: `isOpen`/`onClose`/`onConfirm` (required,
`onConfirm` may be async), `title`/`message`/`confirmText`
(default `'Confirm'`)/`cancelText` (default `'Cancel'`)/
`confirmButtonClass`, `variant` (`'default'|'danger'|'success'`, default
`'default'`). Generic modal (framer-motion `AnimatePresence`) used
app-wide for destructive/success confirmations.
- Manages its own `loading`/`error` state around `onConfirm()`; on
  throw, shows `err.message` inline and logs via `logger.error` (`:42-54`)
  — dev-console only (see the logger note under "Logging" below).
- Focuses the Cancel button 50ms after open (`:28-32`); Escape closes
  unless `loading` (`:35-40`).
- `variant` drives icon (`Trash2`/`CheckCircle`/`AlertTriangle`) and
  accent color, not just styling.

**`Dropdown.jsx`** — the app's one custom select component (used
directly by `ScoreCategoryFilters` and `AddPlayerForm`, and indirectly
everywhere a styled select is needed). Props: `options`
(`{value,label}[]`, required), `value` (selected option object),
`onChange` (required), `placeholder`, `searchable` (default false),
`onSearch` (remote-search callback), `loading`, `disabled`, `className`/
`dropdownClassName`, `error` (bool), `label`.
- When `searchable`, fires `onSearch(searchTerm)` only once
  `searchTerm.length >= 2` (`:40-42`) — supports server-driven
  autocomplete, not just in-memory filtering (local filtering of the
  `options` array also happens independently).
- Closes on outside click / Escape; arrow-key navigation walks
  `nextElementSibling`/`previousElementSibling` in the DOM rather than
  index state (`:181-185`).

**`SafeText.jsx`** — props: `children` (string — **non-string children
pass through unsanitized**), `as` (default `'span'`), `className`, rest
spread onto the element. The app's XSS-safe text renderer for
user-generated strings (competition name, place, description, etc).
Confirmed to call `sanitizeInput` from `src/utils/security/sanitize.js`:
```js
DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim()
```
i.e. it strips **all** tags/attributes — a plain-text reducer, not a
"safe subset of HTML" allowlist. `sanitizeObject` also exists in the
same util (recursively `sanitizeInput`s every string value of an object)
but nothing in this component list calls it. **If `children` isn't a
string** (a number, a JSX node), sanitization is skipped entirely and
the value renders as-is (`SafeText.jsx:15-17`) — `SafeText` only
protects string content.

## `layout/`

**`ErrorBoundary.jsx`** — class component. Props: `children`,
`resetKey` (string, typically the route path), `title` (default
`'Something went wrong'`), `message`, `homePath` (renders an escape-hatch
link), `homeLabel` (default `'Back to dashboard'`).
- Catches standard React render-phase errors from its subtree only —
  not event-handler errors, not async errors (standard boundary
  limitation).
- Fallback UI: "Refresh Page" button (`window.location.reload()`) and,
  if `homePath` given, a **plain `<a>`**, deliberately not a router
  `<Link>` — it has to survive a crash inside the router subtree itself.
- **Logging**: `componentDidCatch` calls `logger.error('Error caught by
  boundary:', error, errorInfo)` (`:32`). No Sentry or other remote
  error-reporting integration exists anywhere in the codebase.
  `src/infrastructure/logger.js` is a thin dev-only wrapper — every
  method (`log`/`error`/`warn`/`info`) is a no-op unless
  `import.meta.env.MODE === 'development'`. **In production, a caught
  render error is not logged anywhere** — it only ever reaches the
  user-visible fallback; the raw error/stack is shown in the UI itself
  only in dev mode (`:82-92`, a `<details>` block).
- `resetKey` exists so the boundary can be mounted **per role-layout**,
  not just once around the whole app, and self-clear on route change
  (`componentDidUpdate`, `:36-43`) — the file's own header comment
  (`:6-20`) frames this as the fix for judges losing their socket
  connection/unsaved scores on a render crash anywhere in the app: one
  global boundary would have unmounted the whole tree including the
  live scoring session on any unrelated crash.

**`Navbar.jsx`** — props: `user` (object, falsy = logged out),
`userType` (role string), `onLogout` (called with `navigate`). Shared
top nav (desktop bar + separate mobile drawer) across all roles.
- **Does not hardcode a different link set per role in the logged-in
  state.** Logged out: fixed `Player`/`Coach`/`Admin` links plus a
  de-emphasized `Super Admin` link (`:45-49, 121-125`). Logged in: name/
  avatar, an optional `CompetitionSelector` (only when
  `Boolean(userType) && location.pathname.endsWith('/dashboard')`,
  `:50`), and Logout — identical regardless of which role is signed in.
  Role variation is really just (a) which login links show when logged
  out, (b) whether/where the competition selector renders.
- On logout, calls `clearCompetitionContext()` from `useCompetition()`
  **before** `onLogout(navigate)` (`:40-43`) — relevant to competition
  scoping: without this, a stale competition context could otherwise
  leak into the next session on the same tab.
- Locks page scroll while the mobile drawer is open (`useBodyScrollLock`).
- Carries the `AppearanceMenu` in its bar.

## `ordering/SortableList.jsx`

**No dedicated drag-and-drop library** — built on **framer-motion's
`Reorder.Group`/`Reorder.Item`/`useDragControls`** (framer-motion is
already a dependency elsewhere), a deliberate choice noted in the file's
top comment (`:6-8`) to avoid adding a new dependency. Props (via
PropTypes, `:124-139`):
- `items` (array, required), `onReorder` (required — fires continuously
  during drag with the live reordered array), `onCommit` (optional —
  fires once on pointer-up; **this**, not `onReorder`, is where
  persistence/API calls belong — the comment explicitly warns against
  persisting on every pointer move), `getKey` (required, stable
  identity), `renderItem` (required, `(item, index) => node`),
  `disabled` (default false — hides the drag handle, no-ops
  `onReorder`), `accent` (default `'#A855F7'`), `emptyMessage` (default
  `'Nothing to order yet.'`).
- **Handle-only dragging** — `useDragControls` + `dragListener={false}`
  on `Reorder.Item`; the grip button calls `controls.start(event)` on
  `onPointerDown`. Deliberately not whole-row-draggable: that would
  require `touch-action: none` on the row, which would break scrolling
  on long lists on a tablet (top comment, `:10-16`). Grip handle is a
  44px touch target.
- Uncontrolled between drags — `Reorder.Group` reorders locally on every
  pointer move; `onCommit` is the sync point back to the parent/server.
- Shape (`getKey`/`renderItem`/deferred `onCommit`) is clearly designed
  for the running-order/lot-drawing drag sequencing described in project
  memory, but the consuming page(s) weren't confirmed by import search in
  this pass — ⚠️ UNVERIFIED which screen(s) currently import it.

## `scores/`

**`scoreRows.js`** (confirmed `.js`, no JSX — pure functions). Exists
because three routes (`/scores`, `/admin/dashboard/scores`,
`/superadmin/dashboard/scores`) render the **same** board component from
**two different feed shapes** (public score docs vs. per-athlete
individual scores) — this module's whole job is normalizing both into
one row shape (`:1-18`).
```js
rowsFromPublicScores(scoreDocs = [])       // GET /public/scores payload → one row per performance
                                             // uid = `${doc._id}-${performance.playerId}-${performance.apparatus||''}`
rowsFromIndividualScores(players = [])      // GET {admin}/scores/individual payload → one row per performance
                                             // uid = `${player.playerId}-${performance.apparatus||''}-${performance._id||''}`
sortByRank(rows = [])                       // copy, sorts by rows[i].rank (server-assigned; MAX_SAFE_INTEGER
                                             // fallback), then finalScore desc as secondary
filterRows(rows = [], searchTerm = '')      // case-insensitive substring match on playerName/teamName/coach
```
Deliberately does **not** recompute `rank`/tie-break — that stays
server-side (`Server/src/utils/scoring/tie-breaker.util.js`) to avoid
the exact drift [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md#tie-break-math-is-deliberately-not-duplicated-on-the-client)
documents as deliberately avoided.

**`PlayerRankingBoard.jsx`** — props: `players` (array, required — each
row must already carry a server-assigned `rank`, optionally
`tieBreakInfo`). The public/admin/superadmin results board: top-3
podium (2nd-left / 1st-center-elevated / 3rd-right) plus a ranked list
below, both built from the same `PlayerCard` subcomponent. Also exports
named `SkeletonRow` and `RankBadge` (the placing in the display face; 1–3
take the medal colours).
- Imports and calls `sortByRank` from `./scoreRows` — does not sort itself.
- **One "Score Breakdown (Average)" at every panel size**: Difficulty /
  Combination / Execution / Originality averaged by
  `copRules.averageSlipBreakdown(judgeSlips, panelSize)` over the slips the
  panel rule counts — all three on a 3-judge panel, the **middle two
  evaluation slips by total** on a 4/5-judge one — with a
  `describeSlipAverage` note under it; rows without stored slips fall back to
  the row's own `scoreBreakdown`. (The old 3-judge-only averaging and raw
  per-judge pills are gone.) Presentational only, not ranking.
- Ties: reads `player.tieBreakInfo.method` against `TIE_BREAK_LABELS`, whose
  keys are the server engine's reason codes: `faster_time`, `base_score`,
  `four_judge_average`, `four_judge_average_with_chief`, `lucky_draw`
  ("Placed by lucky draw"), `identical_time`, `identical_panel_scores`,
  `time_unavailable`, `panel_scores_unavailable`. When
  `tieBreakInfo.awaitingLuckyDraw` it reads **"Tied — lucky draw to be held"**
  instead. A "Tied" badge shows when `tieBreakInfo.unresolved`. A new engine
  reason needs a label here, or the card shows no explanation.
- Displayed rank is `player.rank` if finite, else `index+1` fallback
  (`placeOf`, `:215`) — never silently renumbers a tie.

**`ScoreCategoryFilters.jsx`** — props: `competitionOptions`/
`ageGroupOptions`/`competitionTypeOptions`/`apparatusOptions` (arrays,
default `[]`), matching `selected*` values and `on*Change` callbacks,
`loadingCompetitions` (default false), `competitionLocked` (default
false — for plain-admin users whose competition comes from route
context; renders that control fixed+disabled), `onClearFilters`. The
5-filter picker (Competition → Gender → Age Group → Competition Type →
Apparatus) above every results board, built entirely from `Dropdown`.
All 5 dropdowns are **always mounted**, not progressively revealed —
the file header (`:6-15`) says this replaced an older UX where filters
appeared one at a time. Cascading is `disabled` + a placeholder naming
the prerequisite ("Select gender first"), not hidden controls.
Apparatus is deliberately last — pages only fetch once it's set.

**`LuckyDrawPanel.jsx`** (2026-10-18) — props: `rows` (the ranked rows),
`onRecord(group, order)`, `onClear(group)` (both async). Admin/superadmin
only, on Scores → Individual Rankings. Records the result of a **physical**
lucky draw (COP 1.12.4; the 3-judge "same time" rule) for every tie the
server flags: exported `luckyDrawGroups(rows)` groups rows by
`tieBreakInfo.tieGroupKey` where `awaitingLuckyDraw` or `method ===
'lucky_draw'`, sorted by place (recorded groups in drawn order). Each
`DrawGroup` is a raised `Panel` — "Level for 2nd on 8.25", a status tag
("Lucky draw needed" / "Lucky draw recorded"), an ordered list with
up/down `IconButton`s ("Move X up"), **Save draw result**, or **Change
order** / **Clear draw** once recorded. Renders nothing when there's no such
group; a `Notice` above the groups says how many still need a draw. It never
ranks anyone — the server applies the order and the page reloads. Test:
`LuckyDrawPanel.test.jsx`.

## `competition/`

**`CompetitionDisplay.jsx`** — props: `className`. Card showing the
currently-selected competition; reads `currentCompetition`/`isLoading`
from `useCompetition()`, returns `null` while loading or unselected.
Also consumes `useCompetitionLock({competition: currentCompetition})` —
if locked, overrides the normal ongoing/upcoming/completed status badge
with a red "Locked" badge regardless of the stored `status` field
(`:31-34`; comment at `:15-22` explains `status` is set manually and
often goes stale versus the calendar-derived lock fact). Uses `SafeText`
for name/place/description.

**`CompetitionLockBanner.jsx`** — props: `competition` (optional — pass
when the caller already has the record), `className`. The "This
competition has closed" banner. **Exact consumption chain**: calls
`useCompetitionLock({competition})` from `src/hooks/useCompetitionLock.js`
(not `SHARED-CONTRACTS.md`'s `competitionLock.js` directly), which
imports `describeCompetitionLock`/`formatLockDate` from
`src/utils/scoring/competitionLock.js` (`useCompetitionLock.js:38`). The
hook resolves "current competition" as: the explicit `competition` prop,
else `CompetitionContext.currentCompetition`, else (judges only) a
`secureStorage['judge_current_competition']` read + parse, failing soft
to unlocked on parse error (`:63-78`); then calls
`describeCompetitionLock(competition, userType)` →
`{locked, locksAt}`. Renders **nothing** (`return null`) when `!locked`
(`:32`) — implicitly including superadmins, whose write-exemption
presumably lives in `describeCompetitionLock` itself (not re-verified
line-by-line here — see [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md) for
the underlying lock util). Deliberately **not a toast** — file comment
(`:21-23`) says it must persist through scroll/navigation/tab-return
since it represents standing state, not a one-time event.

**`CompetitionSelector.jsx`** — props: `userType`. The navbar's
competition-switcher dropdown; reads/writes `useCompetition()`
(`currentCompetition`, `assignedCompetitions`, `switchCompetition`,
`isLoading`). Hidden for admins with ≤1 assigned competition and for
players with 0; always shown for coaches (adds a "Sign up for new
competition" row navigating to `/coach/select-competition`).

**`CompetitionSelectionScreen.jsx`** (~890 lines) — the post-login "choose
your meet" screen for admin/coach/player/judge (not superadmin). Props:
`userType`, `onCompetitionSelected` (optional). Per-role branching for
how a competition binds to the session: judges call
`judgeAPI.setCompetition` and re-derive their panel seat (`judgeType`/
`judgeNo`, `:338-408`); teamless players call `authAPI.setCompetition`
directly (`:410-425`); coaches register their team via
`coachAPI.registerTeamForCompetition` then hit `/auth/set-competition`
via a **raw `fetch()` with a manually-attached Bearer token**
(`:493-519`) — another hand-rolled fetch that must self-attach auth,
worth cross-referencing against the Logout CSRF Trap pattern in
[10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md); everyone else uses
`switchCompetition` from context. Auto-selects when exactly one
competition matches the chosen level (`:322-327`).

**`LevelSelectionScreen.jsx`** — props: `userType` (required). The
screen immediately before `CompetitionSelectionScreen`; picks a level
(`COMPETITION_LEVELS` from `@/utils/competition/levels`, see
[SHARED-CONTRACTS.md](SHARED-CONTRACTS.md#competition-levels-six-values-sync-tested-since-2026-09-26))
before narrowing to a competition. Not shown to superadmins. Fetches
per-role competition lists purely to compute a count badge per level
card. Comments stress the level is "a FILTER, not a permission"
(`:119-125`).

## `performance/PerformancePanel.jsx`

Props: `competitionId`, `competitionTypes` (array), `apparatusConfig`
(object), `teamId` (required — coach-view filter), `highlightPlayerId`
(optional — highlights the logged-in player's own row), `selfOnly`
(bool), `gender`/`ageGroup` (optional filters), `title`, `emptyLabel`.
Tabbed (by competition type) finalized-score panel used on coach/player
dashboards. Fetches via `publicAPI.getScores` per apparatus in parallel
(`Promise.allSettled`, so one apparatus failing doesn't blank the
others). Its client-side average-from-`judgeSlips` computation
(`parseBreakdown`, `:59-77`) is essentially the same pattern as
`PlayerRankingBoard`'s `getAverageBreakdown` — duplicated logic between
the two files, a plausible future dedup candidate, not fixed here.

## `superadmin/AddPlayerForm.jsx` (~820 lines)

Props: `teams` (array), `competitions` (array), `onSuccess` (declared
but — ⚠️ UNVERIFIED — not observed being called anywhere in the file;
possibly a dead prop), `onFetchTeams` (required, called on competition
selection change). Superadmin's "add a player directly to a team" form —
`react-hook-form` for text fields, `Dropdown` for selects. **Does not
submit directly**: on valid submit it computes the per-player fee via
`getCompetitionPlayerFeeRupees`, stashes a `checkoutPayload` (including
registration/fee-window dates — see
[SHARED-CONTRACTS.md](SHARED-CONTRACTS.md#the-fee-window-and-the-competition-lock-sync-tested-and-pinned-to-the-same-boundary-as-each-other))
into `sessionStorage` under key `mallakhamb_superadmin_player_checkout_v1`,
and navigates to `/superadmin/add-player-payment` — actual creation +
payment happens on that separate page. A comment at line 13 warns this
storage key must be **kept in sync with `SuperAdminAddPlayerPayment.jsx`**
by hand.

## Supporting file: `src/utils/security/sanitize.js`

```js
import DOMPurify from 'dompurify';
export const sanitizeInput = (input) =>
  typeof input !== 'string' ? input
    : DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
export const sanitizeObject = (obj) => { /* recursively sanitizeInput's every string value */ };
```
`SafeText` is the only component in this doc's scope that calls it.
`sanitizeObject` is exported but has no confirmed caller among the
components documented here.

## Since the last pass (2026-10-30, against `4201319`)

- `components/charts/` — chart primitives for the Stats/Fairness screens —
  [06-SCREENS/stats-and-fairness.md](06-SCREENS/stats-and-fairness.md).
- `components/finals/QualifiedFinals.jsx` — coach/player qualifier cards.
- `superadmin/AddPlayerForm.jsx` — Competition I only; COP age util.
