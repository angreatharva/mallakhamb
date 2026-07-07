---
name: project-overview
description: "What the Mallakhamb project is — a Mallakhamb competition management platform, monorepo layout, tech stack, and the 5 user roles."
metadata: 
  node_type: memory
  type: project
  originSessionId: ead61525-38f1-4119-a9ca-11b68c534fc8
---

**Mallakhamb India** — a competition management platform for Mallakhamb (an Indian gymnastic sport on pole/rope). Handles competitions, team registration, entry-fee payments, judge scoring, and public leaderboards.

Monorepo at `D:\Mallakhamb-Repo\Mallakhamb-master` with two independent apps:
- `Server/` — Node.js + Express + MongoDB (Mongoose 8) REST API. Package name `sports-event-backend`. See [[backend-architecture]].
- `Web/` — React 19 + Vite 7 + Tailwind 3 SPA. Package name `mallakhambindia`. See [[frontend-architecture]].

**5 user roles** (hierarchy in `Server/src/services/auth/authorization.service.js`): `player:1, coach:2, judge:3, admin:4, superadmin:5`. `superadmin` is NOT a separate collection — it is an `Admin` document with `role: 'superadmin'`. Each role has its own login/dashboard/storage-prefix on both stacks.

**Core domain flow:** superadmin/admin creates competitions → coaches register + build teams of players → coaches pay entry fees (Razorpay) → teams submitted → judges score players per apparatus/category over Socket.IO live scoring → scores aggregated → public leaderboards.

**Competition structure:** apparatus = Pole/Hanging/Rope Mallakhamb; 3 categories `competition_1` (Team) / `competition_2` (Individual) / `competition_3` (Apparatus); split by gender + ageGroup.

Run/deploy details in [[run-and-deploy]]; remediation history + current state in [[project-status-and-history]]; known discrepancies in [[known-gotchas]].

Extensive in-repo docs exist: root `USER_GUIDE.md`, `implementation_plan.md`, `unified_platform_audit_v2.md`, `codebase_review-server`, `codebase-review-web`, `rules-set.md`; `Server/API_DOCUMENTATION.md` + `Server/docs/*`; per-directory `README.md` files.
