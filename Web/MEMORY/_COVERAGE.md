# Coverage worklist — Web/MEMORY

Every in-scope file under `Web/`, whether read (directly by the orchestrating
session, or via a delegated research agent whose report was folded into a
MEMORY doc), and which doc covers it. Built 2026-09-23, commit `f0bdc1d`.

Legend: `[x]` read and covered · `(direct)` · `(agent)`.

## Skeleton (read directly)
- [x] package.json, index.html, src/main.jsx, src/App.jsx (direct) → 01-ARCHITECTURE
- [x] src/routes/index.jsx, src/routes/lazy-pages.js (direct) → 03-ROUTING-AND-NAV
- [x] src/middleware/protected-route.jsx (direct, test pending agent) → 10-AUTH-AND-SECURITY
- [x] src/contexts/AuthContext.jsx, AuthProvider.jsx, RouteContext.jsx (direct) → 04-STATE-MANAGEMENT, 10-AUTH-AND-SECURITY
- [x] src/services/api-client.js, src/config/api.config.js (direct) → 08-API-INTEGRATION
- [x] vite.config.js, eslint.config.js (direct) → 16-BUILD-AND-CONFIG, 02-CONVENTIONS
- [x] eslint-rules/index.js, no-hardcoded-colors.js, no-hardcoded-spacing.js (direct) → 02-CONVENTIONS, 05-DESIGN-SYSTEM
- [x] src/pages/{admin,player,coach,judge,superadmin}/*Login.jsx (5 files, direct) → 03-ROUTING-AND-NAV (§3.4 resolved: all thin wrappers around UnifiedLogin)
- [x] src/pages/admin/AdminDashboard.jsx, src/pages/superadmin/SuperAdminDashboard.jsx (direct) → 03-ROUTING-AND-NAV (§3.4 resolved: thin wrappers around UnifiedDashboard)

## Existing docs / config not yet read
- [x] Web/README.md, docs/architecture.md, docs/web-guide.md (agent) → 01-ARCHITECTURE, 02-CONVENTIONS — major stale-doc findings: router v6→v7 wrong in 3 docs, react-query already removed but still documented, @heroicons/react doesn't exist, web-guide.md broadly superseded (triple-duplicated section, wrong auth/CSRF model, stale routing table)
- [x] .env_example, postcss.config.js, package.json full dependency list (agent) → 16-BUILD-AND-CONFIG
- [x] No CI pipeline confirmed (no .github/workflows, no .gitlab-ci.yml; render.yaml is deploy-only) → 16-BUILD-AND-CONFIG
- [x] docs/AUDIT.md, docs/CSP_NONCE_INTEGRATION.md (agent) → 10-AUTH-AND-SECURITY — MED-W6 confirmed fixed, HIGH-W3 stale-prose pattern flagged
- [x] docs/RESPONSIVE_UIUX_PLAN.md (agent) → 12-RESPONSIVE, 05-DESIGN-SYSTEM — corroborates 3-source token drift + more findings
- [x] e2e/README.md (agent) → 15-E2E-AND-SEEDING
- [x] tailwind.config.js (agent) → 05-DESIGN-SYSTEM (third independent token copy, confirmed)
- [x] postcss.config.js, playwright.config.js (agent, both angles: build/CI + blast-radius) → 16-BUILD-AND-CONFIG, 15-E2E-AND-SEEDING

## Auth & session (agent, complete) → 10-AUTH-AND-SECURITY, 04-STATE-MANAGEMENT
- [x] src/utils/auth/{authEvents,obfuscatedStorage,secureStorage,tokenUtils,roleFromPath}.js (direct, earlier in session)
- [x] src/utils/auth/{authEvents.crosstab,obfuscatedStorage,roleFromPath}.test.js (agent)
- [x] src/contexts/AuthProvider.test.jsx, src/middleware/protected-route.test.jsx (agent)
- [x] src/pages/shared/{ForgotPassword,ResetPassword}.jsx (agent) — email-validation drift + OTP re-verification gap found
- [x] src/components/auth/AuthLoadingSpinner.jsx, src/pages/shared/NotFound.jsx (agent) — new files added to doc scope
- Key finding: AdminScoring.jsx socket-token ternary bug (both branches identical) — real shipped defect, roleFromPath.test.js regression-tests it

## API + socket contract (agent, complete) → 08-API-INTEGRATION, 09-REALTIME
- [x] src/services/api.js, src/services/index.js (agent)
- [x] src/services/auth/auth.api.js, src/services/ordering/lots.api.js, src/services/public/{public,judge}.api.js (agent)
- [x] src/services/team/team.api.js, src/services/user/{admin,super-admin,coach,player}.api.js (agent)
- [x] src/services/api-client.csrf.test.js (agent)
- [x] socket.io-client usage — 6 independent connections, no shared context (agent)
- [x] cross-reference Server/src/routes/** (file list only), Server/src/socket/events/event-types.js (agent)
- Key finding: `scores_saved_error` listened client-side, zero server emitters (dead listener); large list of server-only events with no client listener (likely unbuilt notification-center feature)

## Shared contracts / scoring parity (done directly, not via agent) → SHARED-CONTRACTS, 11-SCORING-CLIENT — HIGH PRIORITY
- [x] src/utils/scoring/{copRules,copRulesSync,competitionFee,competitionLock,apparatus,judgePanel,scoringPropTypes}.js (direct, full read)
- [x] src/utils/scoring/*.test.js (7 files: copRules, copRulesSync, apparatus, judgePanel, scoringPropTypes, competitionFeeSync, competitionLockSync — direct, confirmed which import Server/src and which don't)
- [x] src/utils/ordering/performanceOrder.js + test (direct)
- [x] src/utils/competition/levels.js (direct)
- [x] cross-reference: Server/src/config/cop-rules.js, Server/src/utils/data/apparatus.util.js, Server/src/config/payment.config.js, Server/src/utils/security/competition-lock.util.js, Server/src/utils/scoring/calculation.util.js, Server/src/utils/scoring/tie-breaker.util.js (direct)
- Key finding: only 3 of 8 pairs are cross-stack-test-guarded (COP static tables, fee window, lock boundary). The panel-averaging methodology (calculateAverageMarks/resolveDifficultyValue vs calculateIndividualScore) and apparatus.js vs apparatus.util.js have NO automated drift detector — see SHARED-CONTRACTS.md.

## Design system + responsive (agent, complete) → 05-DESIGN-SYSTEM, 12-RESPONSIVE
- [x] src/styles/tokens.js, tailwind.config.js (agent) — 3 independent token copies confirmed, value-by-value
- [x] src/components/design-system/** (agent) — real name collision: index.jsx vs cards/animations/ornaments subfolders, 11 pages affected
- [x] src/hooks/useResponsive.js, src/utils/ui/{cn,responsive}.js (agent)
- [x] src/components/responsive/** (agent) — 5 of 8 dead (~2,161 lines), score-sheet no-sideways-scroll mechanism documented precisely, scope-limited to that one component

## Components inventory (agent, complete) → 07-COMPONENTS
- [x] src/components/auth/{AccountLockoutMessage,AuthLoadingSpinner,ConfirmDialog,Dropdown,SafeText}.jsx (agent)
- [x] src/components/layout/{ErrorBoundary,Navbar}.jsx (agent) — no Sentry, prod render errors unlogged
- [x] src/components/ordering/SortableList.jsx (agent) — framer-motion Reorder, no DnD library
- [x] src/components/scores/{PlayerRankingBoard,ScoreCategoryFilters,scoreRows}.js(x) (agent)
- [x] src/components/competition/{CompetitionDisplay,CompetitionLockBanner,CompetitionSelector,CompetitionSelectionScreen,LevelSelectionScreen}.jsx (agent, went beyond original scope — covered here, not by a separate screens agent)
- [x] src/components/performance/PerformancePanel.jsx, src/components/superadmin/AddPlayerForm.jsx (agent, went beyond original scope)

## Forms & validation (agent, complete) → 13-FORMS-AND-VALIDATION
- [x] src/validators/form.validator.js (agent) — full schema/helper inventory
- [x] react-hook-form + zod usage across 4 representative screens (agent)
- Key finding: zodResolver never used anywhere; 3-4 independent hand-copies of password/phone rules across form.validator.js, UnifiedRegister.jsx, AddPlayerForm.jsx

## Testing / vitest (complete) → 14-TESTING
- [x] src/setupTests.js (agent)
- [x] survey all 21 *.test.js/*.test.jsx files, grouped by subsystem (agent)
- [x] per-file behavior detail for pages/judge/*.test.js group (judgeCategoryOptions, judgeSeat, useJudgePanelData, scorerRows, JudgeScoring.hooks) — covered by the judge-screens agent, folded into the individual 06-SCREENS/judge-*.md docs (e.g. JudgeScoring.hooks.test.jsx's HIGH-W1 regression tests are documented in judge-scoring.md)

## E2E and seeding (agent, complete) → 15-E2E-AND-SEEDING — HIGH PRIORITY, blast radius
- [x] e2e/support/** (22 modules, agent)
- [x] e2e/*.spec.js (18 specs, 5 read in full, rest surveyed, agent)
- [x] e2e/README.md reconciliation (agent)
- [x] package.json seed:*/audit:*/test:e2e:* scripts cross-check, ranked by blast radius (agent)
- Key finding: only ONE programmatic env guard exists (admin-data.js's isLocal check on default creds) — player/coach/judge seeding has zero guard against a non-local E2E_BASE_URL

## Screen docs — Admin (agent, complete) → 06-SCREENS/admin-*
- [x] src/pages/admin/{AdminJudges,AdminScoring,AdminScores,AdminTransactions,AdminLots,AdminTeams,AdminRegister}.jsx (agent)
- Key finding: AdminJudges/AdminScores/AdminTransactions/AdminLots are NOT top-level routes — confirmed rendered as UnifiedDashboard.jsx tabs via switch(activeTab), resolves the UNVERIFIED note in 03-ROUTING-AND-NAV.md

## Screen docs — Judge (agent, complete) → 06-SCREENS/judge-*
- [x] src/pages/judge/{JudgeScoring,JudgeDashboard,judgeShared,JudgePanelReview,JudgeTeamPlayers,useJudgePanelData,JudgeProfile,JudgeSequence,judgeCategoryOptions}.js(x) (agent) — 8 docs written
- [x] src/pages/judge/*.test.js(x) (JudgeScoring.hooks, judgeCategoryOptions, judgeSeat, useJudgePanelData) (agent, what each locks in documented)
- Key finding: resolved the scores_saved_error ambiguity flagged by 09-REALTIME.md — confirmed via direct grep it's dead (no server emitter), same class as the already-cleaned-up score_update_error sibling
- JudgeLogin.jsx (11-line redirect shim) and ScorerScoring.jsx/scorerRows.js (covered by the other agent) deliberately not given separate judge-* docs

## Screen docs — Scorer/Coach/Player (agent, complete) → 06-SCREENS/{scorer-scoring,coach-*,player-*}
- [x] src/pages/judge/{ScorerScoring,scorerRows}.js(x) + scorerRows.test.js (agent) → scorer-scoring.md — disambiguated from components/scores/scoreRows.js
- [x] src/components/performance/PerformancePanel.jsx (agent, covered early in 07-COMPONENTS — skip)
- [x] src/pages/coach/{CoachDashboard,CoachPayment,CoachCreateTeam}.jsx (agent) — 3 docs; CoachPayment.jsx given the most detail (real-money flow)
- [x] src/pages/player/{PlayerDashboard,PlayerTeamSelection}.jsx (agent) — 2 docs; PlayerTeamSelection documents a known server-side-only defect (competitionId filter ignored)
- [x] src/components/superadmin/AddPlayerForm.jsx (agent, covered early in 07-COMPONENTS + 13-FORMS-AND-VALIDATION — skip; used by superadmin, not coach)

## Screen docs — SuperAdmin/Unified/Public (agent, complete) → 06-SCREENS/{superadmin-*,unified-*,public-*}
- [x] src/pages/superadmin/{SuperAdminManagement,SuperAdminAddPlayerPayment}.jsx (agent, Management read in chunks) — 2 docs
- [x] src/pages/unified/{UnifiedLogin,UnifiedRegister,UnifiedDashboard}.jsx (agent) — 3 docs
- [x] src/pages/public/{Home,PublicScores}.jsx (agent) — 1 combined doc
- [x] src/pages/shared/{ResetPassword,ForgotPassword,NotFound}.jsx — already covered in 10-AUTH-AND-SECURITY.md, deliberately not duplicated here
- Key finding: SuperAdminManagement.jsx has NO Teams/Judges section (corrects an initial hypothesis) — only Competitions/Admins/Coaches/Add Player; UnifiedDashboard.jsx confirmed admin/superadmin-only, not used by player/coach/judge

## Screen docs — Competition selection + context → 06-SCREENS/competition-*, 04-STATE-MANAGEMENT
- [x] src/components/competition/{CompetitionSelectionScreen,CompetitionSelector,LevelSelectionScreen}.jsx (agent, covered early in 07-COMPONENTS — skip)
- [x] src/contexts/CompetitionContext.jsx (direct) → 04-STATE-MANAGEMENT — documents the auto-select race bug (12-meet seed lost the second meet of every level before the fix)
- [x] src/components/responsive/{ResponsiveTable,ResponsiveRankings}.jsx (agent, covered in 12-RESPONSIVE — skip)
- [x] src/components/scores/PlayerRankingBoard.jsx (agent, covered in 07-COMPONENTS — skip)

## Deliberately not read (excluded per master prompt §1)
- node_modules/, .git/, coverage/, test-results/, dist/
- Web/package-lock.json
- Web/.env* — names only, via grep, never opened
- src/assets/* binaries — sizes recorded (BHA.png, Mallakhamb.png, main-home.jpg), bytes not read
