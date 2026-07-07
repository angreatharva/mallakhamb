---
name: project-status-and-history
description: Mallakhamb remediation history (audit-driven Phases 0-3) and current WIP — the just-landed judge login→dashboard→live-scoring flow.
metadata: 
  node_type: memory
  type: project
  originSessionId: ead61525-38f1-4119-a9ca-11b68c534fc8
---

Development state of [[project-overview]] as of 2026-07-06.

**Audit-driven remediation.** The codebase went through a security/quality audit (`unified_platform_audit_v2.md`) tracked in `implementation_plan.md` (6 systemic + 3 critical + 6 high + 15 med + 15 low findings). Status:
- **Phase 0 (emergency) — DONE:** credential rotation + git-history scrub, admin-registration auth guard, crypto-random OTP, atomic OTP verify, ProtectedRoute token-expiry check, Vite allowedHosts, Judge.comparePassword.
- **Phase 1 (refactors) — DONE:** X-New-Token rotation, event-driven auth redirects (`AUTH_EXPIRED`), role-name standardization to `superadmin`, extracted `AuthProvider`, role-scoped storage clear, design-system extraction from Home.jsx, CORS/logger consolidation. (Verification items 1.V1–1.V7 left unchecked in the plan.)
- **Phase 2 (production hardening) — DONE:** httpOnly cookies + refresh-token rotation, CSP nonces, Redis-backed token invalidation, TanStack Query install, bundle splitting, thin server.js, frontend+backend test infra, admin audit logging. (Item 2.8 bootstrap DI grouping still open.)
- **Phase 3 (long-term) — MOSTLY NOT DONE:** TypeScript migration, design-token cleanup, per-route error boundaries, account lockout enforcement (config exists, not enforced), API versioning (`/api/v1`), full WebSocket feature-out, CI/CD, APM — all pending.

**Current feature work (HEAD = `b61d205` "judge login to dashboard changes"):** the judge live-scoring flow just landed. NOTE: the session-start git snapshot showed these as modified/untracked, but they were committed in `b61d205`; working tree is otherwise clean (only a plugin `data/state_store.db` binary changed).
- `JudgeDashboard.jsx`: loads `judge_user`, category-selection modal (gender+ageGroup fixed, judge picks competition type + apparatus), `GET /public/submitted-teams`, searchable team accordion → navigate to scoring with player via `location.state`.
- `JudgeScoring.jsx`: opens Socket.IO, joins `scoring_${gender}_${ageGroup}_${competitionType}` room; 4-section scoring model (Difficulty max 3.80 via A/B/C element weights, Combination max 1.60, Execution max 4.40, Originality max 0.20; total 10.00); submit `POST /public/save-score` + `socket.emit('score_update')`.

**Recent commit themes:** competition-switch fixes for coach/player, admin login→competition-selection→dashboard flow, apparatus + fees changes, multi-role Razorpay payment + scoring architecture. Scoring, competition-switching, and payment flows are the active problem areas.
