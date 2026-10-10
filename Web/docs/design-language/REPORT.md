# Prime Time, site-wide: the final report

The design-language plan ([PLAN.md](PLAN.md)) set out to draw the whole site in the landing page's "Prime Time" look, without rewriting any behaviour, and to leave an architecture where the next restyle is a token edit. This is what was done, how it was checked, and what is left.

**Status (2026-10-11):** every phase is complete on stacked branches ending at `look/phase-6-retire-classic`. **Nothing is merged or deployed.** Merging to `master` (which deploys to Render) is the owner's decision; the judge screens should not go live on a competition day.

## What changed

| Phase | Result |
|---|---|
| 0 | Pixel, lint and phone-speed baselines on the unchanged build |
| 1 | Token architecture: look packs → `generated/looks.css`, a `data-look` axis beside appearance and role, Tailwind reading tokens. Zero pixel change. |
| 2 | Type steps and fonts (Archivo, Teko), loaded only with what draws them |
| 3 | The primitives (`components/ui`), the `/__look` specimen and its spec; Home on the shared layer |
| 4 | The shell (`AppHeader`, `PageHeader`, `TabNav`, `AccountControls`), the brand sweep ("Mallakhamb India", the pole mark, favicons), toasts and `theme-color` from tokens |
| W1 | `/scores`, every sign-in, registration and password screen, the 404, the level and competition choosers |
| W2 | Every player and coach screen, the shared masthead |
| W3 | Every admin and superadmin screen |
| W4 | Every judge screen (token level; see "Left to do") |
| 6 | Classic retired: prime-time is the default and only look; the old design-system components, the hover lift and the legacy palettes deleted |
| 7 | [LOOKS.md](LOOKS.md) (the playbook), the README, Web/MEMORY and project memory |

New pieces a future screen should use: `Notice`, `RunningOrder`, `TextLink`, `AuthLayout`, `Heading asIs`, the picker/popover styles, the results board (`scores/board.css`). See [README.md](README.md).

## How it was verified

Each wave ran the plan's §10 gates before its route group switched.

- **Unit tests:** 474/474 after Phase 6. The count fell from 489 because the per-look contrast cases for classic went with it; 176 judge tests pass unchanged through W4.
- **Lint:** no errors; the warning ratchet holds and was lowered: hard-coded colours 855 → 474, hard-coded spacing 490 → 298. `no-hardcoded-colors` is an **error** in every folder now at zero.
- **Pixel gate (threshold 0):**
  - W1 vs the Phase-4 reference (v4): differences only on W1 routes and on the admin/superadmin scores tabs, which share the restyled board and filters. One 7 px antialiasing change on a glyph of the judge-profile avatar, a screen W4 later rebuilt.
  - After Phase 6, the whole site was recorded as the new reference (`.mallakhamb-visual-baseline-look-v5`), and a second, independent run compared against it.
- **Browser audits, on the full prime-time build, one at a time:**

| Audit | W4 build | Phase 6 build (pass 1) | Phase 6 build (pass 2) |
|---|---|---|---|
| look-specimen (contrast, overflow, 44 px targets, masthead) | 2/2 | 2/2 | see below |
| contrast-audit (real backgrounds, both appearances) | 6/6 | 6/6 | |
| appearance-everywhere / -persistence | 1/1 | 1/1 · 1/1 | |
| focus-visible | 6/6 | 6/6 | |
| responsive-audit | 6/6 | | |
| responsive-tablet, responsive-modals | — | | |
| deep-screens | 1 failure, fixed | | |
| responsive-score-sheet | 2/2 | | |
| responsive-judge-walk | 1/1 | | |
| judge-deep-screens | 1/1 | | |
| Home 41-device audit | — | | |

The responsive audit's only findings were two links in Home's footer (a phone number and "Super Admin", under 44 px), unchanged from before the rollout. The one deep-screens failure was real: the admin masthead's mark-only wordmark was a 13 px-wide link at 768 px. It now keeps a 44 px target.

## Left to do

None of these block a merge, but each is real:

1. **Judge screens, anatomy.** W4 moved every judge colour, fill and motion onto the look, but kept the screens' structure: the judge headers are still hand-built (not `AppHeader`), and the slip rows do not yet read like Home's slip (`display-s` section titles, the 3px active rule, the total in `num-l`). Plan §7 describes the target. Do it on a day with no competition, and re-run judge-walk, score-sheet and judge-deep-screens.
2. **Inline styles that remain.** About 470 colour and 300 spacing warnings remain, mostly in the judge screens (246 colour warnings), the responsive tables, `SuperAdminManagement` and `AddPlayerForm`. Their values are token strings (via `ADMIN_COLORS` and `alpha()`), so they follow the look, but they are page-level visual decisions. The ratchet stops them growing; convert them file by file, then delete the `COLORS`/`ADMIN_COLORS` proxies.
3. **Home's footer targets.** The phone link (118×16) and "Super Admin" (78×28) are under 44 px on phones.
4. **Font budget.** 104.4 KB with every type step on screen, over the 100 KB target. The lever is a weight-only Archivo (−54 KB), at the cost of the width axis.
5. **The API's socket CORS** refuses the `vite preview` origins (:4174/:4175) in local runs. This is harmless to the audits, but the console is noisy.

## Rolling it out

1. Merge `look/phase-6-retire-classic` into `master`; it carries every phase.
2. Let Render deploy on a day with no competition.
3. Check live in Chromium and WebKit: a sign-in, `/scores`, a coach dashboard, an admin tab, and a judge slip on a phone.
4. If the judge screens misbehave on the day, the quickest rollback is reverting the merge. The route-level kill switch went with classic, because there is no other look left to switch to.
