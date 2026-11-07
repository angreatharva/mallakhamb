# Demo data seed — plan

Status: **BUILT** (2026-11-05): `Server/scripts/seedDemo.js` + `Server/scripts/demo/`.
A full clean local run took **7 min 42 s** with 0 failures, and every verify check
passed.

## As built (what changed from the plan below)

- **One club per coach.** The product reads a coach's *first* team everywhere:
  the dashboard, player search and the competition chooser. So the build has
  12 coaches with one club each, and each club enters 2–4 levels.
  Multi-level players change club per level through the team-per-level rule.
- **Cast:** 180 athletes (49 at 3+ levels, 42 who play for more than one club),
  28 judges who each sit 4–6 meets, 4–5 teams per meet, and at least 4 athletes in
  every category. School (DSO) meets run junior categories; university meets
  run seniors.
- **Names:** `[DEMO] <City> <Level> Championship`. The app adds the year
  itself.
- **Judges share one set of seats per meet**, the same pattern as the e2e plan. Judges agree on D
  and C and differ only on Execution. Execution is the truth, plus the judge's strictness, plus the
  judge's lean toward a club, plus noise, rounded half-down to 0.1.
- **Ties:** 3 are planted. In addition, every tie the marks produce by chance gets
  a recorded lucky draw in the `ties` step, except the one planted in the live meet.
- **Runs against:** launch config `api-demo-local` (:5002, local `mallakhamb_demo`)
  for rehearsal, or `api-demo-staging` (:5003, reads `Server/.env.demo`) for the
  staging database. `--allow-db=<name>` is required for any database whose name
  does not contain "demo".

```
DEMO_MONGODB_URI=... DEMO_DISCOUNT_CODE=... DEMO_SUPERADMIN_PASSWORD=... \
  DEMO_API_URL=http://127.0.0.1:5003 node scripts/seedDemo.js --drop --yes [--allow-db=<name>]
```

Goal: one command that fills a **separate demo database** with a believable
season, so every screen has real data for a walk-through: player career graphs,
coach squad graphs, judge marking insights, the admin Fairness (partiality)
board, individual and team rankings, qualification finals and the public
results.

```
npm --prefix Server run seed:demo -- --yes            # full season (default size)
npm --prefix Server run seed:demo -- --size=small     # quick version (~10 min)
npm --prefix Server run seed:demo -- --from=scores    # resume at a step
```

## 1. Why the existing seeds can't do this

| Need for the demo | What the current seeds give |
|---|---|
| Graphs that move | `seedScores.js` only ever produces **8.40 or 9.40**: every athlete gets the same marks so that test results are easy to check. Every career line would be flat. |
| Players at several levels | The e2e roster puts each team, and every athlete in it, at **one** level. |
| Coaches at several levels | Each e2e coach owns **one** team. |
| A partiality story | All judges mark the same values, so nobody leans and the Fairness board stays empty. A judge is flagged only with **≥ 6 *recorded* slips** for one team, a lean of at least 0.30, and a 90% confidence interval that excludes 0. |
| A season timeline | All meets sit on the same future dates, so "career over time" has no order. |

The e2e roster (`Web/e2e/support/*`, `seed/meets.json`, `seed/panel-plan.json`)
is a **test fixture** that both stacks read. The demo **must not touch it**. The
demo gets its own generator and its own output folder.

## 2. Where it runs — safety first

- Default target: a dedicated database, **`mallakhamb_demo`**, behind its own
  local API (launch config `api-demo`, port 5002, `MONGODB_URI` pointing at that
  database). The demo database is therefore never `BRMC_dev`, never the
  e2e database, and never production.
- The script **refuses to run** if the database name is not on an allow-list
  (`mallakhamb_demo`, or `--db=<name>` matching `*demo*`). It also refuses any
  name containing `prod`, and any Atlas host on the production cluster.
- `--drop` drops only that database. It asks for confirmation unless `--yes` is given.

## 3. The cast (default size)

Everything is generated **deterministically** from `--seed=2026`: the same
command always produces the same people, marks and stories. The generated plan
is written to `scripts/seed/demo/plan.json` so it can be inspected
(gitignored).

### Competitions: 20 in total

| Level | Meets | Season window (2026) |
|---|---|---|
| District | 3 (Mumbai, Pune, Thane) | Jan – Feb |
| DSO (school) | 3 | Mar |
| State | 3 | Apr – May |
| University | 3 | Jun |
| National | 3 | Jul – Aug |
| International | 3 | Sep – Oct |
| **Live** | 1 national meet dated **today**: partly scored, with some categories still open | the "competition day" screens |
| **Upcoming** | 1 state meet in December: registration and the fee window are open, no scores yet | registration and lot-draw screens |

- Competition types rotate **I / I+II / I+III / I+II+III**, so the
  qualification-finals screens have every case.
- `maxTeamSize` alternates between 4 and 6, so the team championship shows both
  the best-3 and the best-5 rule.
- Apparatus are set per gender. Women never get Hanging (COP §11).

### Coaches and teams

- **10 coaches** run **~30 teams**. A coach owns one team **per level** at 2–4
  levels, for example "Shivaji Vyayamshala – District", "– State", "– National".
  The data model already allows several teams per coach (team names are unique
  per coach).
- **4–6 teams per meet.** Rankings then have a real middle, and the team
  championship isn't a two-horse race.

### Players: ~160

| Group | Count | Career |
|---|---|---|
| **Ladder climbers** | ~25 | District → State → National, and ~8 "stars" reach International. They have **6–12 meets across 3–4 levels**, for a different team at each level. That is legal under the team-per-level rule, which locks only one team *per level*. |
| Regulars | ~90 | 1–2 levels, 2–4 meets |
| School / university only | ~40 | DSO or University meets |
| No-email players | ~6 | registered by a guardian or by the coach, so those flows appear too |

Every gender × age group has **at least 4 athletes in every meet**, so no
ranking board is empty or has a single entrant. Dates of birth follow the COP
age rule (cut-off 31 Dec of the meet year). Every meet is in 2026, so nobody
changes age group mid-season.

### Judges: 28

- `stateUnit` is spread over ~6 states, so the "home-state" signal on the
  Fairness board means something.
- Each judge sits on 5–10 meets in different seats. Panel sizes of **3, 4 and
  5** are drawn per meet with the existing `planPanels` logic and written to the
  demo folder, not to `seed/panel-plan.json`.
- The Time Keeper is sometimes the same person as the Scorer (the role-popup
  case) and sometimes a separate person.

Admins: the super admin plus **2 admins**, each owning half the meets, so
admin scope is visible.

## 4. The score model — what makes the graphs worth showing

Each athlete has hidden traits:

- **ability**, 6.8–9.4
- **apparatus affinity**: ±0.3 per apparatus. Some athletes are rope specialists.
- **growth per meet**: −0.02 to +0.08. Most improve over the season; a few dip
  and then recover.
- **weak section**. Some lose points on Combination by missing checklist items,
  others on Execution.

Each performance is built from those traits **inside the COP rules**:

- **D:** an A/B/C element mix that varies, rather than always the maximum.
- **C:** 0–2 checklist items missed.
- **E:** 2.4–4.3.
- **Time:** mostly 60–90 s, with ~8% outside the window to show time deductions.

Each judge's slip is built as: the truth, plus that judge's strictness, plus a
small per-performance noise. It is then rounded the way the slip rounds
(Execution half-down to 0.1).

### Planted stories: each one is something a demo can point at

1. **The partial judge.** One judge leans **+0.35 toward a team from their home
   state**, over 8+ performances. The Fairness board flags exactly this pair.
2. **The strict-but-fair judge** marks 0.20 low for *everyone*. This judge shows
   up as "strict" and is **not** flagged, which shows the board tells strictness
   apart from bias.
3. **The thin-data judge** has a lean, but too few marks. That cell is hatched
   "not enough data".
4. **The star**. A climber with a personal best at Nationals and a podium at
   International. This is the showcase player profile.
5. **The rising squad**. One coach's team improves meet after meet, so the coach
   team-championship trend goes up.
6. **The tie**. Two athletes are level, and the tie is settled by COP §1.12. A
   second tie is waiting for a lucky draw, which the admin records during the demo
   (the draw is never random in code).
7. **Panel events**. A few tolerance breaches that the chief resolves, and a few
   difficulty mismatches that are corrected. The panel-review screens then
   have history.

## 5. How the data gets in

Everything goes **over HTTP through the real endpoints**, as the logged-in user
who would do it. The demo then passes through the same rules as real data: team
per level, age rule, apparatus per gender, slip authorship
(`attribution: recorded`, which the Fairness board needs), the end-date lock
and the published-score rule. The one exception is the bootstrap step
(migrations plus the first super admin), as in every chain.

**The time-travel problem.** A finished meet is locked: nobody but the super
admin can write to it. So every meet is first created with **future** dates.
Everything is registered, scored, published and finalized while the meets are
open. A last step then has the super admin **move each meet's dates back** to
its slot in the season (`PUT /api/superadmin/competitions/:id`). The meets
become completed and read-only on their own, and the graphs come out in season
order.

### Steps (resumable with `--from`, `--only` and `--to`, on the existing `setup-chain.js` runner)

| # | Step | Reuses |
|---|---|---|
| 1 | preflight: database guard, API probe, discount code on | `setup-chain.js` |
| 2 | plan: generate the cast, stories and panel draw → `demo/plan.json` | new `lib/demo/*` |
| 3 | bootstrap: migrations + super admin | existing |
| 4 | admins + 20 meets (future dates) | `competition-document.js`, `admin-api.js` |
| 5 | judges register + profiles | `seedApi.js judges` helpers |
| 6 | coaches register, then teams per level | `seedApi.js coaches` |
| 7 | players: self, guardian and coach-registered | `seedApi.js players` |
| 8 | squads per meet, entered by the coach for the right team | `seedApi.js squads` |
| 9 | pay with the 100% discount code | `payWithDiscount.js` |
| 10 | seat panels from the demo panel draw | `seatPanels.js` logic |
| 11 | lot draw / running order | existing admin endpoint |
| 12 | **score Competition I** with the score model above, as each judge's own account; the chief finalizes, the Scorer locks | the slip/resolve flow factored out of `seedScores.js` into `lib/` so both use one copy |
| 13 | publish; record the planted lucky draw (only the one tie, the other is left waiting) | existing |
| 14 | finalize qualification finals → score Comp II and III | existing finals endpoints |
| 15 | **back-date** the 18 season meets | super admin edit |
| 16 | live meet: score ~half; upcoming meet: leave registration open | step 12 with a stop point |
| 17 | verify, then write `DEMO-ACCOUNTS.md` | new |

`DEMO-ACCOUNTS.md` (gitignored) is the presenter's cheat sheet. It lists who to
log in as for each screen: the star player, the rising coach, the partial
judge, the strict judge, admin A and the super admin. Passwords follow the usual
`<Firstname>@2026` convention. It also gives the meet, category and apparatus
where each story can be seen.

### Verify (step 17 fails loudly if any check is false)

- The star has published scores at **≥ 3 levels and ≥ 6 meets**.
- Every Comp I category of every season meet is published, and has ≥ 4 athletes.
- `GET /api/stats/judge-fairness` (super admin, all meets) flags **exactly** the
  planted pair and does **not** flag the strict judge.
- Team-championship rows exist for both team sizes (4 and 6).
- Finals exist for all four type mixes.
- The live meet reads `ongoing` and the season meets read `completed`.

## 6. Size and run time

| Preset | Meets | Players | Judges | Slips (≈) | Time (≈) |
|---|---|---|---|---|---|
| `small` | 6 + live | ~60 | 12 | ~1,200 | 10–15 min |
| default | 18 + live + upcoming | ~160 | 28 | ~6,000 | 45–75 min |

The time is mostly slip posting: the last full chain posted 796 slips in about
10 minutes. Meets are scored in parallel (`--workers=4`). Each step does only
the work still owed, so an interrupted run resumes where it stopped.

## 7. Files

- `Server/scripts/seedDemo.js`: the chain.
- `Server/scripts/lib/demo/cast.js`, `scores.js`, `stories.js`, `rng.js`: the
  generator.
- `Server/scripts/lib/slip-flow.js`: the slip post, resolve, finalize and lock
  logic, moved out of `seedScores.js`. Behaviour stays unchanged for the e2e
  seed.
- `Server/scripts/seed/demo/`: `plan.json` and `DEMO-ACCOUNTS.md` (both
  gitignored).
- `.claude/launch.json`: an `api-demo` entry.
- `Server/package.json`: `seed:demo`.
- **`Server/.gitignore` allow-list**: every new `scripts/*` and `scripts/lib/*`
  file must be named there, or it is silently not committed.

## 8. Decisions for the owner

1. **Target database.** The recommendation is a dedicated local `mallakhamb_demo`.
   The alternatives are `BRMC_dev` (mixes with the TRIALS data) or the sslip
   staging site (shows on a phone, but writes to a shared VM database).
2. **Size.** The recommendation is the default (20 meets) for the real demo, with
   `small` for rehearsals.
3. **Names.** The recommendation is realistic Indian names, with a `[DEMO]` prefix
   only on the meet names. The alternative is visibly fake names everywhere.
