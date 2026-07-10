# Mallakhamb Judging Software — Complete Build Specification
Based on: MFI Code of Points, November 2022 Edition

---

## 1. PURPOSE

Build a digital judging system that replicates the Mallakhamb Federation of India's
scoring workflow (Section 2 of the COP) across all apparatus (Pole, Hanging, Rope),
all competition types (I, II, III, Pyramid), and produces the same official paperwork
(Appendices A–H) digitally, with full audit trail.

---

## 2. CORE DOMAIN MODEL (Entities)

```
Championship
 ├─ id, name, venue, dates, edition_ref ("COP Nov 2022")
 └─ has many: Competitions

Competition
 ├─ type: ENUM [ "COMP_I_TEAM", "COMP_II_ALLROUND", "COMP_III_APPARATUS", "PYRAMID" ]
 ├─ sex: ENUM [ MALE, FEMALE ]
 ├─ age_group: ENUM [ U12, U14, U16, U18, A16, A18 ]   // per 1.8.3.1 table
 ├─ apparatus: ENUM [ POLE, HANGING, ROPE ]  // null/combined for II (all-round)
 ├─ qualification_threshold_pct: DECIMAL (default 60.0, admin-configurable per 1.11.A.i)
 └─ has many: Performances

JudgePanel
 ├─ competition_id (FK)
 ├─ panel_type: ENUM [ "STANDARD_4J1C", "PYRAMID_5J1C" ]  // 4+1 vs 5+1
 ├─ chief_judge (FK -> Judge)
 ├─ judges: [Judge] (4 or 5, one-per-state constraint enforced, see 1.7.2 / 1.7.8)
 ├─ scorer (FK -> Judge, must be neutral state, 1.7.5)
 ├─ timekeeper (FK -> Judge)
 └─ set_writer (FK -> Judge, optional)

Player
 ├─ id, name, dob, sex, state_unit, registration_number
 ├─ age_group (derived from dob + cutoff date 31 Dec, rule 1.8.3.2)
 └─ chosen_age_group (rule 1.8.3.3: can play up but never down again — needs a
     one-way lock flag: has_played_up_before = BOOLEAN)

Team
 ├─ state_unit, sex, age_group
 └─ has many: Player (max 6, min 5 per 1.9)

Performance (one row per player per apparatus per competition)
 ├─ player_id, competition_id, apparatus
 ├─ chest_no, sequence_no
 ├─ time_seconds (raw stopwatch reading)
 ├─ difficulty_elements: [ElementSelection]  // see Element Bank below
 ├─ judge_slips: [JudgeSlip] (4 or 5 + chief)
 ├─ average_score (computed)
 ├─ base_score (computed, nullable — only when tolerance exceeded)
 ├─ execution_deductions_notes: [DeductionEntry]   // from 2.4.1 / 2.4.2, folded into judge's own 4.40 rating
 ├─ final_score_deductions: [DeductionEntry]        // from 2.4.3 / 2.4.4, applied by Chief Judge post-average
 ├─ bonus_awarded: BOOLEAN, bonus_element_ref (nullable)
 └─ final_score (computed)

JudgeSlip
 ├─ performance_id, judge_role: ENUM [CHIEF, J1, J2, J3, J4, J5]
 ├─ difficulty_score (0.00–3.80)
 ├─ combination_score (0.00–1.60)
 ├─ execution_score (0.00–4.40)
 ├─ bonus_score (0.00 or 0.20)
 ├─ total (computed, capped at 10.00)
 ├─ submitted_at (must be within 20 sec of set end — soft-enforced timer)
 └─ is_chief_prefilled: BOOLEAN  // enforces rule 2.2 item 4 (Chief scores before seeing others)

ElementSelection
 ├─ apparatus, phase: ENUM [MOUNT, HOLD, ACROBATIC, CATCH, DISMOUNT]
 ├─ element_name (from Difficulty Table, Section 3)
 ├─ class: ENUM [A, B, C]
 └─ value: DECIMAL (0.20 / 0.40 / 0.60 — auto-filled from class)

DeductionEntry
 ├─ code (FK -> DeductionCatalog)
 ├─ amount (fixed or user-entered within "up to X" ceiling)
 └─ applied_by: ENUM [JUDGE, CHIEF_JUDGE]
```

---

## 3. CONSTANTS & LOOKUP TABLES (hardcode as seed data, but keep editable by Technical Committee per COP philosophy of periodic revision)

### 3.1 Element Class Values
```
A_CLASS_VALUE = 0.20
B_CLASS_VALUE = 0.40
C_CLASS_VALUE = 0.60
```

### 3.2 Difficulty Element Count Requirements (by Competition Type) — CRITICAL, drives validation
```
COMPETITION_I:      { A: 4, B: 6, C: 1 }   → 0.80 + 2.40 + 0.60 = 3.80
COMPETITION_II_III: { A: 1, B: 6, C: 2 }   → 0.20 + 2.40 + 1.20 = 3.80
```
Both sum to 3.80 but the software MUST validate against the correct mix per
competition type — do not just check the total.

### 3.3 Point Distribution (universal ceiling, all apparatus, all competitions)
```
DIFFICULTY   = 3.80
COMBINATION  = 1.60
EXECUTION    = 4.40
BONUS        = 0.20
TOTAL        = 10.00
```

### 3.4 Tolerance Limit Table (Chief Judge vs. avg-of-2-middle-scores)
```
if avg_score in [9.00, 10.00]: tolerance = 0.10
elif avg_score in [8.00, 9.00): tolerance = 0.20
elif avg_score in [7.00, 8.00): tolerance = 0.30
elif avg_score in [6.00, 7.00): tolerance = 0.40
elif avg_score in [5.00, 6.00): tolerance = 0.50
else: tolerance = 1.00   # below 5.00
```

### 3.5 Time Deduction Table (overage beyond 90 sec)
```
overage <= 3 sec:  deduction = 0.20
overage <= 5 sec:  deduction = 0.30
overage <= 9 sec:  deduction = 0.40
overage >= 10 sec: deduction = 0.50
```

### 3.6 Minor Deductions Catalog (2.4.1) — apply within judge's Execution score
```
[
 {code:"M01", desc:"Improper body posture", amount:0.10, fixed:true},
 {code:"M02", desc:"Not stretched palms/legs", amount:0.10, fixed:true},
 {code:"M03", desc:"Bending palms/elbows/knees", amount:0.10, fixed:true},
 {code:"M04", desc:"Unnecessary separation of hands/legs", amount:0.10, fixed:true},
 {code:"M05", desc:"Improper final position", amount:0.10, fixed:true},
 {code:"M06", desc:"Unessential pause >2 sec", amount:0.10, fixed:true},
 {code:"M07", desc:"Unnecessary touches to apparatus", amount:0.10, fixed:true},
 {code:"M08", desc:"Low height/flight at mount/dismount", amount:0.10, fixed:true},
 {code:"M09", desc:"Technically improper turning movements", amount:0.10, fixed:true},
 {code:"M10", desc:"Low amplitude", amount:0.10, fixed:true},
 {code:"M11", desc:"Slight touch of hands/legs to ground/mats", amount_max:0.20, fixed:false},
 {code:"M12", desc:"Extra swing where not required", amount_max:0.20, fixed:false},
 {code:"M13", desc:"Improper/slipped catches", amount_max:0.20, fixed:false},
 {code:"M14", desc:"Too low height/flight at mount/dismount", amount_max:0.20, fixed:false},
 {code:"M15", desc:"Tuck/pike/hollow where not required", amount_max:0.20, fixed:false},
 {code:"M16", desc:"Unnecessary break in continuity", amount_max:0.20, fixed:false}
]
```

### 3.7 Major Deductions Catalog (2.4.2)
```
[
 {code:"J01", desc:"Losing balance on apparatus", amount_max:0.50, fixed:false},
 {code:"J02", desc:"Physical help by coach", amount_max:0.50, fixed:false},
 {code:"J03", desc:"Fall on the ground", amount:0.50, fixed:true}
]
```

### 3.8 Final-Score Deductions Catalog (2.4.3) — applied by Chief Judge, AFTER average/base score
```
[
 {code:"F01", desc:"Not reporting to Chief Judge before/after set", amount:0.10},
 {code:"F02", desc:"Not maintaining sequence", amount:0.20},
 {code:"F03", desc:"Exceeding warm-up period", amount:0.20},
 {code:"F04", desc:"Set not started within 10 sec of start signal", amount:0.20},
 {code:"F05", desc:"Improper attire", amount:0.20},
 {code:"F06", desc:"Team not in uniform (applies to whole team total)", amount:0.50},
 {code:"F07", desc:"Time overage", amount:"lookup 3.5 table"},
 {code:"F08", desc:"Misbehaviour of competitor", amount:1.00},
 {code:"F09", desc:"Gross misconduct debarring individual/team", amount:0.10},
 {code:"F10", desc:"Coach present near apparatus during performance", amount:0.20},
 {code:"F11", desc:"Coach signals competitor during performance", amount:0.50},
 {code:"F12", desc:"Coach in improper uniform (deducted from ALL team members)", amount:0.50},
 {code:"F13", desc:"Fall, continued within 10 sec", amount:0.50, per_occurrence:true},
 {code:"F14", desc:"General indiscipline/misconduct (individual or team)", amount:0.50}
]
```
Flag F09 to admins: the source text lists 0.10 for an offense described as
severe enough to "debar" — likely a document inconsistency. Make this
value editable rather than trusting it blindly.

---

## 4. THE SCORING ALGORITHM (pseudocode — this is the heart of the system)

```python
def score_performance(slips: list[JudgeSlip], panel_type: str) -> dict:
    chief_slip = next(s for s in slips if s.judge_role == "CHIEF")

    if panel_type == "STANDARD_4J1C":
        exec_slips = [s for s in slips if s.judge_role in ("J1","J2","J3","J4")]
        assert len(exec_slips) == 4
        totals = sorted(s.total for s in exec_slips)
        # drop lowest (totals[0]) and highest (totals[3])
        middle_two = totals[1:3]
        avg_score = round(sum(middle_two) / 2, 3)

        tolerance = get_tolerance(avg_score)
        diff = abs(chief_slip.total - avg_score)

        if diff <= tolerance:
            base_score = None
            provisional_final = avg_score
        else:
            base_score = round((avg_score + chief_slip.total) / 2, 3)
            provisional_final = base_score

    elif panel_type == "PYRAMID_5J1C":
        # Pyramid: 5 evaluation judges + 1 chief; drop high+low of the 5, average remaining 3
        eval_slips = [s for s in slips if s.judge_role in ("J1","J2","J3","J4","J5")]
        assert len(eval_slips) == 5
        totals = sorted(s.total for s in eval_slips)
        middle_three = totals[1:4]
        avg_score = round(sum(middle_three) / 3, 3)
        base_score = None
        provisional_final = avg_score
        # Tie-break only (1.11.D.5): chief + avg(3) / 2 -- NOT used for primary scoring,
        # only invoked when resolving ties between pyramid teams.

    return {
        "middle_two_or_three": middle_two if panel_type=="STANDARD_4J1C" else middle_three,
        "avg_score": avg_score,
        "tolerance_used": tolerance if panel_type=="STANDARD_4J1C" else None,
        "diff": diff if panel_type=="STANDARD_4J1C" else None,
        "base_score": base_score,
        "provisional_final": provisional_final
    }


def apply_final_deductions(provisional_final: float, deductions: list[DeductionEntry]) -> float:
    total_deduction = sum(d.amount for d in deductions)
    final = round(provisional_final - total_deduction, 3)
    return max(final, 0.0)


def get_tolerance(score: float) -> float:
    if 9.00 <= score <= 10.00: return 0.10
    if 8.00 <= score < 9.00:   return 0.20
    if 7.00 <= score < 8.00:   return 0.30
    if 6.00 <= score < 7.00:   return 0.40
    if 5.00 <= score < 6.00:   return 0.50
    return 1.00


def get_time_deduction(actual_seconds: float, limit_seconds: float = 90.0) -> float:
    overage = actual_seconds - limit_seconds
    if overage <= 0: return 0.0
    if overage <= 3: return 0.20
    if overage <= 5: return 0.30
    if overage <= 9: return 0.40
    return 0.50
```

### 4.1 Judge Slip internal validation (per slip, before it can be submitted)
```python
def validate_slip(slip: JudgeSlip, competition_type: str):
    assert 0 <= slip.difficulty_score <= 3.80
    assert 0 <= slip.combination_score <= 1.60
    assert 0 <= slip.execution_score <= 4.40
    assert slip.bonus_score in (0.0, 0.20)
    assert round(slip.difficulty_score + slip.combination_score
                 + slip.execution_score + slip.bonus_score, 2) <= 10.00

def validate_difficulty_composition(elements: list[ElementSelection], competition_type: str):
    required = COMPETITION_I if competition_type == "COMP_I_TEAM" else COMPETITION_II_III
    counts = {"A":0, "B":0, "C":0}
    for e in elements:
        counts[e.class] += 1
    # Soft-warn if it doesn't match exactly; COP intends this as the standard,
    # but real routines vary -- recommend WARNING not HARD BLOCK, since judges
    # score holistically and a UI hard-block could stall live judging.
    if counts != required:
        return Warning(f"Element mix {counts} does not match expected {required}")
```

---

## 5. APPARATUS-SPECIFIC RULE SETS

Each apparatus needs its own **Element Bank** (Section 3 difficulty tables) and
its own **Combination Checklist** (used to validate/dock the 1.60 Combination
score). Store as structured, versioned data — not embedded in code — since COP
editions get revised (1980 → 2006 → 2017 → 2022 already, per Preface).

### 5.1 POLE MALLAKHAMB
- Applicable to: Men & Women (all age groups, per 1.10)
- Element bank sizes: Mounts (A7/B6/C5), Hold Parts (A13/B18/C12),
  Acrobatic (A7/B9/C9), Catches (A3/B12/C10), Dismounts (A5/B6/C10)
- Combination checklist (10 items, penalties sum to 1.60):
```
[
 {id:1, rule:"All parts of pole utilized", penalty:0.10},
 {id:2, rule:"One 'B' acrobatic element executed from both sides", penalty:0.20},
 {id:3, rule:"3 continuous acrobatic elements, ≥1 must be 'B'", penalty:0.20},
 {id:4, rule:"≥1 Vertical Hold part", penalty:0.20},
 {id:5, rule:"≥1 Horizontal Hold part", penalty:0.20},
 {id:6, rule:"1 Hold part demonstrating backbone flexibility", penalty:0.10},
 {id:7, rule:"≥1 B-class mount", penalty:0.10},
 {id:8, rule:"≥1 C-class dismount", penalty:0.20},
 {id:9, rule:"≥2 transitions between hold positions", penalty:0.20},
 {id:10, rule:"Minimum 16 elements in the set", penalty:0.10}
]
# sum of penalties = 1.60 = full Combination allocation
```

### 5.2 HANGING MALLAKHAMB
- Applicable to: Men ONLY (per 1.8.2 / 1.10 — no Hanging for women)
- Element bank sizes: Mounts (A4/B6/C6), Hold Parts (A9/B6/C2),
  Acrobatic (A8/B7/C4), Catches (A2/B4/C5), Dismounts (A3/B4/C5)
- Combination checklist (10 items — note: 14-element minimum, not 16; only 1
  transition required, not 2 — apparatus-specific, don't reuse Pole constants):
```
[
 {id:1, rule:"All parts of Hanging Mallakhamb utilized", penalty:0.10},
 {id:2, rule:"'A' acrobatic element from both sides", penalty:0.20},
 {id:3, rule:"3 continuous acrobatic elements, ≥1 must be 'B'", penalty:0.20},
 {id:4, rule:"≥1 Vertical Hold part", penalty:0.20},
 {id:5, rule:"≥1 Horizontal Hold part", penalty:0.20},
 {id:6, rule:"Backbone flexibility hold", penalty:0.10},
 {id:7, rule:"≥1 B-class mount", penalty:0.10},
 {id:8, rule:"≥1 C-class dismount", penalty:0.20},
 {id:9, rule:"≥1 transition between hold positions", penalty:0.20},
 {id:10, rule:"Minimum 14 elements in the set", penalty:0.10}
]
```

### 5.3 ROPE MALLAKHAMB
- Applicable to: Men & Women (all age groups)
- Element bank sizes: Mounts (A3/B4/C2), Hold Parts (A7/B20/C3),
  Acrobatic (A1/B3/C1), Catches (A3/B4/C13), Dismounts (A3/B2/C4)
- Combination checklist (only 7 items — heavier per-item penalties, 18-element minimum):
```
[
 {id:1, rule:"Rope held in legs at 4m height, at least once", penalty:0.20},
 {id:2, rule:"≥2 hold parts showing forward+backward flexibility (both required)", penalty:0.30},
 {id:3, rule:"≥1 Vertical AND ≥1 Horizontal hold part", penalty:0.30},
 {id:4, rule:"≥1 B-class mount", penalty:0.20},
 {id:5, rule:"≥1 C-class dismount", penalty:0.20},
 {id:6, rule:"≥1 Strength part", penalty:0.20},
 {id:7, rule:"Minimum 18 elements in the set", penalty:0.20}
]
# sum of penalties = 1.60
```

### 5.4 Apparatus Equipment Dimension Reference (for a "specifications" module, optional)
```
POLE (senior):    total length 3400-3700mm, above ground 2600-2800mm
POLE (sub-jr):    total length 3100-3400mm, above ground 2400-2600mm
HANGING:          height 1700-1900mm, structure height 4600-4800mm
ROPE (senior):    length 5000-5500mm, thickness 18-20mm
ROPE (sub-jr):    length 5000-5500mm, thickness 12-13mm
```
(Not required for scoring logic, but useful if the app also serves as an
equipment-compliance checklist for Directors of Competition per rule 1.6.3/1.22.)

---

## 6. COMPETITION-TYPE WORKFLOWS

### 6.1 Competition I — Team Championship (also Qualifying Round)
```
INPUT: All registered players, all teams (min 3 teams, min 5 players/team to count)
PROCESS:
  1. Each player performs on each applicable apparatus for their sex.
  2. Score each performance via standard 4+1 panel algorithm (Section 4).
  3. Per team per apparatus: take best 5 of the (max 6) player scores.
     - If a team has <5 scored players on an apparatus, EXCLUDE that team from
       Team Championship calc (but individual scores still count for qualification).
  4. Team Championship total = sum of best-5 scores across all applicable apparatus.
  5. Compute each player's aggregate % = (player's total across apparatus) / (max possible per 3.2 table)
  6. Players with aggregate % >= qualification_threshold_pct (default 60%) qualify
     for Competition II. Threshold is admin-editable (Technical Committee discretion).
OUTPUT:
  - Team Championship rankings (Appendix E/F final results, "Team Championship" row)
  - Qualified player list -> feeds Competition II eligibility
  - Per-apparatus qualified list (>=60% on that apparatus) -> feeds Competition III eligibility
```

### 6.2 Competition II — All-Round Individual Event Final
```
INPUT: Top 18 qualifiers from Competition I (by combined apparatus score),
       max 2 players per state unit.
TIE-BREAK FOR 18TH SLOT (rule 1.11.B.iii):
  1. If >2 same-state players tie for a boundary slot -> use Competition I base scores.
  2. If still tied -> lucky draw (chit).
PROCESS:
  Each qualifier performs fresh routines, scored with Competition II/III
  difficulty mix (1×A + 6×B + 2×C).
  Final ranking = sum of scores across all applicable apparatus for that sex.
OUTPUT: All-Round Individual Champion per age group (Appendix G/H)
```

### 6.3 Competition III — Apparatus Championship
```
INPUT: Top 8 qualifiers per apparatus (>=60% on THAT apparatus specifically
       from Competition I), max 2 players per state unit.
PROCESS: Fresh routine per apparatus, Competition II/III difficulty mix.
OUTPUT: Apparatus Champion per apparatus per age group (Appendix E/F)

FALLBACK RULE (1.11 Note): if II & III cannot be held due to unavoidable
circumstances, Jury of Appeal may declare Individual & Apparatus champions
directly from Competition I results. -> Build this as an admin override path:
"Finalize from Competition I" button that skips II/III entirely.
```

### 6.4 Pyramid Competition
```
INPUT: Teams that scored >=60% in Competition I. Team size 6-12, only actual
       team roster (no additional players allowed).
PANEL: 5 judges + 1 chief (different from standard panel!)
PROCESS: Single group performance per apparatus (Pole for M/W; Hanging for
  Men only; Rope for M/W), max duration 90 sec flat (no time-deduction
  table applies here per rule wording -- just a hard cap).
SCORING: Drop high+low of 5 judges, average remaining 3 = final score.
TIE-BREAK: (Chief Judge score + avg of 3 evaluation judges) / 2
INTEGRITY RULE: Any judge caught tallying opposing team scores during
  evaluation must be flagged for removal by Director of Competition (1.11.D.6)
  -> Build an audit flag / incident-log feature for this.
OUTPUT: Pyramid ranking (Appendix D score sheet)
```

---

## 7. QUALIFICATION & TIE-BREAK ENGINE (rule 1.12)

```python
def break_tie(candidates: list[Performance]) -> list[Performance]:
    # Step 1: compare base_score (if computed) or fall back to avg_score
    step1 = sort_by(candidates, key=lambda p: p.base_score or p.avg_score, desc=True)
    if not tied(step1): return step1

    # Step 2: average of the 4 execution judges (excluding chief)
    step2 = sort_by(step1, key=lambda p: p.average_score, desc=True)
    if not tied(step2): return step2

    # Step 3: (avg of 4 judges + chief judge score) / 2
    step3 = sort_by(step2, key=lambda p: (p.average_score + p.chief_score) / 2, desc=True)
    if not tied(step3): return step3

    # Step 4: lucky draw
    return random_shuffle(step3)  # log as "resolved by draw" in audit trail
```
Applies only to All-Round Individual (Comp II) and Apparatus Championship
(Comp III) placements — not to Team Championship ranking directly (which uses
summed team totals).

---

## 8. AGE GROUP & ELIGIBILITY ENGINE

```python
CUTOFF_DATE = "31 December" (of the competition year, rule 1.8.3.2)

AGE_GROUPS = {
  "MALE":   {"U12": (0,12), "U14": (0,14), "U18": (0,18), "A18": (18, 999)},
  "FEMALE": {"U12": (0,12), "U14": (0,14), "U16": (0,16), "A16": (16, 999)}
}

def compute_age_group(dob, sex, competition_year):
    cutoff = date(competition_year, 12, 31)
    age_at_cutoff = years_between(dob, cutoff)
    # player picks own group OR one above; never below once played up
    return eligible_groups(age_at_cutoff, sex)

def enforce_no_downgrade(player):
    if player.has_played_up_before:
        block_any_registration_below(player.locked_age_group)
```
National Games: no age limit (1.8.3.5) — bypass this engine entirely for that
championship type. Khelo India Youth Games: U18 mandatory for both sexes
(1.8.3.6) — single fixed bracket, skip the multi-bracket logic.

---

## 9. TEAM VALIDATION RULES

```python
def validate_team(team: Team) -> list[str]:
    errors = []
    if not (5 <= len(team.players) <= 6):
        errors.append("Team must have 5-6 players")
    return errors

def validate_team_championship_participation(teams: list[Team]) -> bool:
    valid_teams = [t for t in teams if len(t.scored_players) >= 5]
    return len(valid_teams) >= 3   # rule 1.11.A.ii
```

---

## 10. UI / MODULE BREAKDOWN

1. **Registration Module** — player registration, state unit, age-group lock,
   migration workflow (rule 1.19), medical certificate flag.
2. **Championship Setup Wizard** — pick championship type (National / Khelo
   India / National Games / Invitational / District-State), which auto-configures
   age groups, apparatus list, and whether age-limit engine applies.
3. **Judge Panel Assignment** — assign Chief/Judges/Scorer/Timekeeper/Set
   Writer per apparatus per competition; enforce one-judge-per-state (1.7.2)
   and neutral-state Chief/Scorer rule (1.7.5).
4. **Live Scoring Console** (per judge, tablet-friendly):
   - Timer widget synced to Timekeeper (60s short signal, 90s long signal)
   - Slip entry: Difficulty (element picker from apparatus Element Bank) +
     Combination (checklist-driven auto-calc) + Execution (deduction picker
     from Minor/Major catalogs, live-subtracted from 4.40) + Bonus toggle
   - **Chief Judge's screen must be locked until all 4/5 judges submit**, and
     Chief's own score must be timestamped as submitted first (2.2 rule 4) —
     enforce via server-side ordering, not just UI convention.
5. **Scorer/Chief Dashboard** — shows all incoming slips, auto-computes
   avg-of-middle-two (or three for pyramid), auto-computes tolerance check,
   flags "BASE SCORE REQUIRED" when exceeded, lets Chief apply Final Score
   deductions (2.4.3/2.4.4) before locking the Final Score.
6. **Score Sheet Generator** — reproduces Appendix A (Judge's Score Sheet),
   B (Comp I slip), C (Comp II/III slip), D (Pyramid sheet), E/F (Final
   Results Men/Women), G/H (All-Round Individual) as PDF exports with
   digital signatures (name + timestamp in lieu of wet signature, or
   e-signature pad).
7. **Qualification Engine Dashboard** — auto-lists Competition II/III
   qualifiers as Competition I data comes in, with override capability for
   Jury of Appeal decisions and the "Finalize from Competition I" fallback.
8. **Protest Module** — timestamped protest submission (30-min window,
   rule 1.17), fee tracking, Jury of Appeal decision log.
9. **Reports** — Team Championship standings, All-Round standings,
   Apparatus Championship standings, Pyramid standings, per rule 1.23 event list.

---

## 11. VALIDATION / EDGE CASES TO HANDLE EXPLICITLY

- Judge slip submitted >20 sec after set end → flag as late (soft warning,
  doesn't block, per real-world practicality — COP doesn't specify a penalty
  for lateness itself).
- Difficulty element list not matching required A/B/C mix for the
  competition type → warning, not hard block (judges use holistic judgment).
- Competitor takes >10 sec to start → auto-suggest F04 deduction (0.20) but
  require Chief Judge confirmation before applying.
- Fall + continuation within 10 sec → prompt "apply per-fall 0.50 deduction?"
  each time triggered (F13), don't auto-stack silently.
- Team with <5 scored players on an apparatus → auto-exclude from Team
  Championship math but keep individual scores live for Comp II/III feed.
- Competition II/III tie at qualifying boundary → auto-run tie-break engine
  (Section 7) and surface the deciding factor in the UI, not just the result.
- Hanging Mallakhamb apparatus should never appear as selectable for a
  Women's competition (hard block, not warning — this is a strict rule,
  1.8.2/1.10).
- Pyramid panel size (5+1) must never be conflated with standard panel (4+1)
  scoring math — keep these as two distinct code paths, not one
  parameterized function with a silent default.

---

## 12. SUGGESTED TECH APPROACH

- **Backend:** any typed language (TypeScript/Node or Python) — the scoring
  math is simple arithmetic but the *validation and workflow state machine*
  (qualification → Comp II/III → tie-break → final results) is the real
  complexity. Model Competition Type as a strategy pattern so each type's
  rules are isolated, testable modules rather than branching if/else scattered
  through one scoring function.
- **Data:** Store the Element Bank (Section 3 tables) and Combination
  Checklists (Section 5 above) as structured JSON/DB seed data, versioned by
  COP edition, so a future rules revision doesn't require a code rewrite —
  just a new data version.
- **Frontend:** tablet-optimized scoring console (judges will be scoring
  live, courtside) + a separate large-screen "Scorer/Chief" dashboard for
  the head table.
- **Testing:** use the two worked examples from Section 2.1.3 of the COP
  (8.30/7.50/7.90/8.30/8.40 → 8.10 within tolerance; 9.40/8.90/9.10/9.00/9.50
  → base score 9.225) as your first unit tests for the scoring engine.