# GOTCHAS

Traps, dead code, stale-docs conflicts, and things that will bite an agent
who assumes the obvious. Grouped by subsystem. Every item traces to a source
citation in the doc it links to. Verified against commit `f0bdc1d`,
2026-09-23.

## Read this first if you're about to trust a project doc

`Web/README.md`, `Web/docs/architecture.md`, and `Web/docs/web-guide.md`
all currently claim `react-router-dom` is **v6**. It is pinned at
**`^7.18.2`** in `package.json` — confirmed directly, and independently
corroborated by `docs/AUDIT.md` and `docs/RESPONSIVE_UIUX_PLAN.md` (both
correctly say v7). `README.md` also lists `@tanstack/react-query` as
"installed but unused" and `@heroicons/react` as an in-use icon
library — **neither package exists in `package.json` at all**;
react-query was deliberately removed (`docs/AUDIT.md`'s own finding
MED-W4), and heroicons was apparently never really there. **`docs/web-guide.md`
is the least trustworthy document in the repo** — it describes a
pre-httpOnly-cookie auth model, claims CSRF is "not applicable" (false;
CSRF is load-bearing precisely because cookies are now the credential of
record), has a stale flat `utils/` directory listing, a stale routing
table predating the `Unified*` consolidation, an internally
inconsistent last-updated date, and a literal three-times-duplicated
"Deployment Checklist" section. See
[01-ARCHITECTURE.md](01-ARCHITECTURE.md#corrected-stack--several-project-docs-disagree-with-the-actual-code-here)
for the full breakdown. **Prefer `docs/AUDIT.md` and
`docs/RESPONSIVE_UIUX_PLAN.md`, or this MEMORY tree, over the other three
docs for any current-state claim.**

## Dead / unreachable code (confirmed, not just suspected)

- **`scores_saved_error` socket listener has no server emitter.**
  Listened for in both `useJudgePanelData.js:501` and
  `AdminScoring.jsx:171` — grepped all of `Server/src` for the literal
  string and a `SCORES_SAVED_ERROR` constant, zero matches either way.
  A **sibling** dead event, `score_update_error`, was already found and
  removed from `useJudgePanelData.js` in an earlier cleanup (confirmed
  by that file's own comment and independently by
  `Server/tests/integration/socket/scoring-socket.test.js:219`'s
  comment) — but `scores_saved_error` was never caught by that same
  pass, and now exists in two files instead of one. See
  [09-REALTIME.md](09-REALTIME.md#a-client-only-event-scores_saved_error-has-no-server-emitter--confirmed-and-theres-a-sibling-that-already-got-cleaned-up).
- **A large list of server-declared socket events have no client
  listener anywhere in `Web/src`** — `room_joined`, `room_left`,
  `score_update`, `score_saved`/`SCORE_SAVED_REST`, `score_submitted`,
  `score_deleted`, `notification`, `competition_update`, `team_update`,
  `player_update`, `team_created/updated`, `team_player_added/removed`,
  `competition_created/updated/status_updated`, `team_approved/rejected`,
  `player_status_updated`, `scores_unlocked/locked`,
  `age_group_started/ended`, `join_competition_room`,
  `leave_competition_room`, `leave_scoring_room`. Most plausibly a
  notification-center feature that was never built client-side (no
  `NotificationBell`/toast-on-socket component exists anywhere), plus a
  mid-session-competition-switch mechanism that isn't wired up (a judge
  switching meets today gets a fresh page load, not a live room hop).
  See [09-REALTIME.md](09-REALTIME.md#server-defined-events-with-no-client-listener).
- `DesignTokenAudit.jsx` and the nine dead `components/responsive/*`
  components were **deleted** in the responsive work (2026-10). Still unused
  per the design-language plan §2 (re-verify before deleting): `TiltCard`,
  `CoachOrnament`, `ThemedTextarea`, `LiveRegion`.
- **`usesEmail === false` branch in `UnifiedLogin.jsx`** — renders a
  Username field/label, but `usesEmail: true` is hardcoded for every
  current role; this branch is unreachable in practice (⚠️ UNVERIFIED
  whether any role config elsewhere ever flips it).
- **A large "Judges Assignment Status" block in
  `UnifiedDashboard.jsx:486-546`** is entirely commented out, alongside
  an unused `JudgeGroupCard` component defined in the same file.

## Real, previously-shipped bugs worth knowing as precedent

These are fixed, but the pattern each one represents is exactly the
kind of mistake this codebase has made more than once — know them
before touching adjacent code.

- **A socket auth token read from the wrong storage key.**
  `AdminScoring.jsx` used to compute its token-storage key with
  `routePrefix === '/superadmin' ? 'admin_token' : 'admin_token'` — both
  branches identical — so a superadmin's live-scoring socket handshake
  went out with the wrong key. Fixed by deriving the key via
  `getRoleFromPath(routePrefix)`. See
  [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md#rolefrompathjs--the-one-source-for-pathrole-mapping).
  **If any screen ever derives an auth/storage key by hand-comparing a
  route prefix instead of calling `getRoleFromPath`, that's this bug
  again.**
- **A competition auto-select that raced the user's own choice.**
  `CompetitionContext`'s auto-select-when-exactly-one-assigned logic
  used to fire even while a coach was standing on the
  select-level/select-competition chooser — since `/auth/set-competition`
  re-scopes the whole session via an httpOnly cookie, this cost "the
  second meet of every level" in a 12-meet seed, four silent losses with
  nothing failing. Fixed with a pathname guard
  (`/\/select-(level|competition)$/`). See
  [04-STATE-MANAGEMENT.md](04-STATE-MANAGEMENT.md#the-auto-select-race--a-real-expensive-bug-now-fixed-with-a-specific-guard).
  **Any new side-effecting API call that fires on mount needs the same
  "not while the user is actively choosing" consideration.**
- **Apparatus silently defaulted to Pole when unset**, in at least two
  places (`JudgeTeamPlayers.jsx`, `JudgeDashboard.jsx`) — "Above16 Rope
  athletes were judged on the ten-item Pole checklist because of this
  line." Fixed by treating an empty/unset apparatus as "whatever the
  athlete is registered for," never a hardcoded default. See
  [judge-team-players.md](06-SCREENS/judge-team-players.md#empty-apparatus-is-not-the-same-as-pole).
- **A hook-order crash from a conditional early return.** `JudgeScoring.jsx`
  used to branch Scorer-vs-Judge with an early return before ~17 hooks
  ran; if the branch flipped mid-instance-life (a storage eviction could
  cause this), React threw "Rendered more hooks than during the
  previous render." Fixed with a hooks-free dispatcher pattern — read
  the branching value fresh every render, never memoize it. See
  [judge-scoring.md](06-SCREENS/judge-scoring.md#the-high-w1-fix--why-the-dispatcher-exists-and-the-constraint-it-imposes).
  Regression-tested by `JudgeScoring.hooks.test.jsx`.
- **A `storage` event listener that could never fire.** Cross-tab
  logout sync used to listen for the browser `storage` event, which
  only fires for `localStorage` writes — but session data lives in
  `sessionStorage`. Replaced with a `BroadcastChannel`. See
  [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md#autheventsjs--cross-tab-sync-full-export-map).
- **A render-body storage mutation under React 19 StrictMode.**
  `protected-route.jsx` used to call `secureStorage.removeItem` during
  render; StrictMode's double-invocation could discard a render after
  the side effect already ran. Fixed by deriving the redirect decision
  purely from a read, moving eviction into a `useEffect`. See
  [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md#route-guard-protected-routejsx).

## Unguarded client/server duplication — no automated drift detector

Only **3 of 8** client/server value-duplication pairs in this codebase
have an automated cross-stack test (one that literally imports the
server module and asserts identical output): the COP static tables, the
fee window, and the competition-lock boundary. The rest are either
hand-verified-identical-in-prose or genuinely untested:

- **The panel-averaging methodology itself is not sync-tested** —
  `calculateAverageMarks`/`resolveDifficultyValue` (client) vs.
  `calculateIndividualScore` (server) are only guarded by hardcoded-
  expectation unit tests on each side, not a cross-import comparator.
  If someone changes the averaging algorithm on one side without the
  other, nothing in CI will catch it. **This is the single most
  important finding in the entire Web/MEMORY build** — see
  [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md#the-averaging-methodology-is-not-sync-tested--the-highest-value-gap-in-this-whole-file).
- `apparatus.js` (client) vs. `apparatus.util.js` (server) — no
  cross-stack test either; verified identical by direct reading only.
- Three to four independent hand-maintained copies of password/phone
  validation rules exist across `form.validator.js`, `UnifiedRegister.jsx`'s
  `PASSWORD_RULES`/`PHONE_RULES`, and `AddPlayerForm.jsx`'s inline
  rules — they don't fully agree (`AddPlayerForm.jsx`'s password rule
  is weaker than the other two). See
  [13-FORMS-AND-VALIDATION.md](13-FORMS-AND-VALIDATION.md#the-net-effect-three-to-four-hand-maintained-copies-of-password-complexity-and-phone-format).
- Breakpoints and z-index have **one** source since 2026-09-29
  (`src/styles/breakpoints.js`); colours live as CSS variables in
  `src/index.css`. What's still copied by hand: the two custom ESLint
  rules each ship their own partial copy of colour/spacing values, which
  only affects lint suggestions. See
  [05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md#one-breakpoint-and-z-index-source).
- `?competitionId=` one-shot-URL-param handling is duplicated
  near-verbatim across **three** independent files —
  `CoachDashboard.jsx`, `PlayerDashboard.jsx`, and
  `UnifiedDashboard.jsx` — not shared into a common hook. A bugfix to
  one likely needs the identical fix in the other two.

## ~~A real component-name collision~~ — resolved by deletion (Phase 6)

The non-barrel `components/design-system/index.jsx` and its duplicate
`GlassCard`/`FadeIn`/`GradientText`/`SaffronButton` are gone; only
`accessibility/LiveRegion` remains. `AdminKit.jsx` keeps its old export
names (`DarkCard`, `FadeIn`, `EmptyState`…) drawn by the `ui` primitives,
and `EmptyState` also exists in `@/components/ui` — check the import path.
See [05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md#same-names-different-components).

## Open blockers for moving production off Render (`deploy/COMMON.md`, 2026-10-11)

Both work on `*.onrender.com` today and break on the planned
`mallakhambcompetition.com` hosts:
- **F1 — socket URL.** Seven files build it with
  `VITE_API_URL.replace('/api','')`, which mangles an `api.` hostname. See
  [09-REALTIME.md](09-REALTIME.md#connection-setup--identical-across-all-six).
- **F2 — CSP.** `connect-src` in `index.html` allows only `'self'`,
  Razorpay, `*.onrender.com`, ngrok and loopback. Add the new
  `https://`/`wss://` API hosts and **keep** the onrender entries until
  decommission (rollback needs them).

## Styling traps (responsive/appearance work, 2026-10)

- **Never glue an alpha byte onto a colour** (`` `${c}NN` ``). Once a value is
  `rgb(var(--x))` it emits invalid CSS, silently dropped. Use `alpha()`.
  `colourHygiene.test.js` fails CI on it — even inside a comment.
- **`text-white` / `bg-white` fail CI.** `ink` follows the appearance;
  `snow` is the deliberate always-white.
- **Don't call dark/light "theme".** `ThemeProvider` is the role accent;
  dark/light is Appearance.
- **`data-role` only on `<html>`** — an inner `data-role` never reaches
  `--accent`.
- **The in-app preview browser can't measure mobile layout**; use the
  Playwright audits. And its hidden tab freezes framer-motion at
  `opacity: 0`, which reads as false contrast failures.
- **Tailwind config edits need a dev-server restart.**
- **Password policies differ on purpose** (admin 12/16, player 8) —
  `PasswordStrength` takes them as props.

## Safety-critical: the e2e/seed harness writes to a real database

`Web/e2e/` is not primarily a test suite — every script writes to
whatever database the Server API is pointed at, with **no mock layer**.
Only one programmatic environment guard exists in the entire harness
(`admin-data.js`'s `isLocal` check on default admin/superadmin
credentials); player/coach/judge seeding has **zero** guard against a
misconfigured `E2E_BASE_URL`. `seed:scores` finalizes/locks ~620 judge
slips irreversibly; `seed:pay` irreversibly submits+pays up to 60 team
entries. See
[15-E2E-AND-SEEDING.md](15-E2E-AND-SEEDING.md#blast-radius-ranked-most-destructive-first)
before running any `seed:*`/`test:e2e:*` script against anything but
your own machine.

## Stale/aspirational docs beyond the router-version issue

- **`docs/CSP_NONCE_INTEGRATION.md`** is entirely conditional/aspirational
  — nothing in `Web/` implements it, and per its own "Current Setup
  Notes," nonce-based CSP is **topologically blocked** under this
  deployment's shape (SPA and API are different origins), not just
  unimplemented.
- **`docs/architecture.md`**'s directory tree lists `src/errors/`,
  `src/constants/`, and a Web-root `tests/` directory — **none exist**.
- **`AUDIT.md`'s own numbered finding prose is written in present tense
  describing the pre-fix state**, not struck through, even where its
  own progress log says the finding is resolved (HIGH-W4, MED-W1,
  MED-W2, MED-W6 are all confirmed fixed; HIGH-W3 claims full closure in
  the progress log but the "## High" section prose above it doesn't
  reflect that — not independently re-verified module-by-module). **Read
  the progress log section first, never just the numbered finding
  headers.**

## Other traps worth knowing

- **`SuperAdminManagement.jsx` has no Teams or Judges section** —
  `deleteTeam`/`deleteJudge` are never called from that file, despite
  being real `superAdminAPI` functions. ⚠️ UNVERIFIED where those two
  destructive actions actually live in the UI — don't assume this file
  is the place to look.
- **`UnifiedDashboard.jsx` is admin/superadmin-only.** Player, coach,
  and judge each have fully separate dashboard files that do not import
  or wrap it — there is no "no-tabs" branch for those three roles
  inside that file.
- **`AdminJudges`/`AdminScores`/`AdminTransactions`/`AdminLots` are not
  top-level routes** — they're tabs inside `UnifiedDashboard.jsx`'s
  `switch(activeTab)`, reached only via `dashboard/:tab`.
- **`PlayerTeamSelection.jsx`'s team list ignores the competition
  filter server-side** — the client sends `competitionId` correctly,
  but `PlayerService.getAvailableTeams` (server) ignores it and returns
  every active team across all competitions. The **join** action does
  correctly scope by competition; only the displayed list is too broad.
  This is a server-only fix — don't attempt a client workaround. See
  [player-team-selection.md](06-SCREENS/player-team-selection.md#a-known-live-defect--server-side-not-this-screens-fault).
- **`JudgeSequence.jsx`'s `category` is computed once via
  `useMemo(() => ({...}), [])`** — if the judge's selected category
  changes elsewhere while this screen stays mounted, this value would
  not update. ⚠️ UNVERIFIED whether this is intentional (moot if the
  screen always remounts on category change) or a latent bug.
- **There is no CI pipeline in this repository** — `playwright.config.js`
  is `process.env.CI`-aware, but nothing checked into the repo
  (`.github/workflows`, `.gitlab-ci.yml`) actually sets that variable or
  runs lint/test/e2e as a gate. `render.yaml` is deploy-only.

## Design-language rollout traps (2026-10-10/11)

- **e2e/seed flows read the markup.** Ids (`#coach-reg-email`), headings
  ("Sign In", "Choose Your Level", "Choose Your Arena", "Select Your Team"),
  button names ("Logout", /^district/, "Add Player", "Save Team") and h3s
  inside choice cards (`card.locator('h3')`). A restyle keeps every one;
  grep `e2e/` before renaming.
- **`Field` puts its `id` on the control via cloneElement**: give the id to
  `Field`, not the `Input`, or the input loses the id the flows fill.
- **A JS `//` comment inside a JSX tag** survives in source but breaks any
  naive attribute rewriter (a codemod joined the next prop onto the comment
  line). Read the result.
- **Stored names in display steps** get uppercased by the type utility; use
  `asIs` / the running order's titles (text-transform:none with higher
  specificity than the `type-*` utility).
- **A mark-only wordmark** must keep `min-width: 44px` (`brand-wordmark--compact`);
  deep-screens caught a 13px-wide home link on admin tabs at 768.
- **A new colour literal fails lint now** (`no-hardcoded-colors` is `error`
  since `c32815c`). Don't add a file to the exemption list to get past it —
  only the stopwatch, Home's WebGL runtime and the colour-defining files are
  exempt, by name. See [02-CONVENTIONS.md](02-CONVENTIONS.md).
- **Grid items stretch by default, so a Tag in a grid did too** ("Overview"
  spanned its whole panel). `ui/text.css` gives the tag `justify-self: start`
  (`a79c8cb`) and `max-width: 100%`, and `.ui-stat__label` gets
  `overflow-wrap: anywhere` (`529e52f`); with shrinkable stat-grid columns in
  `UnifiedDashboard.jsx` that's what made the superadmin overview fit a 320px
  phone (it had scrolled sideways by 63px at 320 and 360).
- **Home's small links are 44px targets below the laptop layout**, not only
  below 768 — the tablet audit flagged the footer and photo-credit links
  (`99c4372`, `529e52f`, `81207da`: at least 44px tall AND wide).

## Home is the laptop layout on every device (2026-10-10/11)

- **Phones and tablets get `width=1280` on `/`**, scaled to fit — never the
  narrow layout. Two places set it: an inline script in `index.html`
  (before first paint, so the hero never lays out narrow and jumps) and
  `useDesktopViewport()` in `src/pages/public/home/desktopViewport.js`
  (arriving at `/` from inside the app; restores
  `width=device-width, initial-scale=1.0` on leaving). **Keep
  `DESKTOP_VIEWPORT` identical to the string in `index.html`.** Pinch-zoom
  stays on; desktop browsers ignore the tag.
- **So a portrait phone is a 1280×~2770 frame and a sideways one 1280×534.**
  Layout bugs show up as "laptop rules in a tall/short frame", not as narrow
  breakpoints: the pole's height label was pushed onto the text (the 3D
  offset now moves right as the frame gets taller; frames at least as wide
  as tall keep `-0.05`), and the unpinned stopwatch overflowed a landscape
  phone (its dial is now capped by viewport height too). `npm run audit:home`
  (41 devices) is the check — 0 problems at `3c5c725`.
