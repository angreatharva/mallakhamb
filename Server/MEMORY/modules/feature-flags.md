---
doc: modules/feature-flags
covers: []
read_when: "you're looking for the feature-flag system and wondering where it went"
depends_on: [modules/public]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Removed 2026-09-23

`src/services/feature-flags/` no longer exists. `FeatureFlagService` was
fully implemented (config-driven flags, percentage rollout via consistent
hash, user/role include/exclude lists) but had **zero live callers**
anywhere in the app — its only consumer, `feature-flag.middleware.js`, was
deleted in the 2026-08 audit, and nothing replaced it. Rather than leave a
fully-wired, uncalled service sitting in the DI container, it was removed
outright: the class file, its `bootstrap.js` registration, and the
config-manager surface that fed it (`getFeatureFlags()`,
`config.features.flags`, the `FEATURES_FLAGS` env var) are all gone. See
[modules/public.md](public.md#feature-flags--removed-2026-09-23) and
GOTCHAS.md's "Fixed since this MEMORY build" section for the full story.

Several `docs/*.md` files (`architecture.md`, `deployment-guide.md`,
`api-documentation.md`, `system-handbook.md`, `README.md`) still describe
this system as if it exists — those were already flagged as stale in
GOTCHAS.md before this removal, and are now additionally wrong on this one
point. Not independently re-edited by this pass.

If a real need for feature flags comes up again: this is a from-scratch
design decision, not a revival — figure out what needs gating (a route? a
service call? both?) and build the consumption path *first*, so the
service that gets written has an actual caller from day one.
