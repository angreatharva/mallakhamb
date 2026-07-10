# Mallakhamb Judging Software — Complete Build Specification
Based on: MFI Code of Points, November 2022 Edition

---

## 1. PURPOSE

Build a digital judging system that replicates the Mallakhamb Federation of India's
scoring workflow (Section 2 of the COP) across all apparatus (Pole, Hanging, Rope),
all competition types (I, II, III), and produces the same official paperwork
(Appendices A–C, E–H) digitally, with full audit trail.

---

## 2. CORE DOMAIN MODEL (Entities)

```
Championship
 ├─ id, name, venue, dates, edition_ref ("COP Nov 2022")
 └─ has many: Competitions

Competition
 ├─ type: ENUM [ "COMP_I_TEAM", "COMP_II_ALLROUND", "COMP_III_APPARATUS" ]
 ├─ sex: ENUM [ MALE, FEMALE ]
 ├─ age_group: ENUM [ U12, U14, U16, U18, A16, A18 ]   // per 1.8.3.1 table
 ├─ apparatus: ENUM [ POLE, HANGING, ROPE ]  // null/combined for II (all-round)
 ├─ qualification_threshold_pct: DECIMAL (default 60.0, admin-configurable per 1.11.A.i)
 └─ has many: Performances

JudgePanel
 ├─ competition_id (FK)
 ├─ panel_size: ENUM [ 3, 4, 5 ]   // see Section 4.2 — panel-size-dependent scoring
 ├─ chief_judge (FK -> Judge)      // required for 4- and 5-judge panels; not used in 3-judge panel
 ├─ judges: [Judge] (3, 4, or 5, one-per-state constraint enforced, see 1.7.2)
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
 ├─ judge_slips: [JudgeSlip] (3, 4, or 5, + chief where applicable)
 ├─ average_score (computed)
 ├─ base_score (computed, nullable — only when tolerance exceeded, 4/5-judge panels only)
 ├─ execution_deductions_notes: [DeductionEntry]   // folded into judge's own 4.40 rating, per-slip
 ├─ bonus_awarded: BOOLEAN, bonus_element_ref (nullable)
 └─ final_score (computed)

JudgeSlip
 ├─ performance_id, judge_role: ENUM [CHIEF, J1, J2, J3, J4, J5]
 ├─ difficulty_score (0.00–3.80)
 ├─ combination_score (0.00–1.60)
 ├─ execution_score (0.00–4.40)   // all in-set deductions (posture, form, falls, etc.)
 │                                   are already netted into this number by the judge
 ├─ bonus_score (0.00 or 0.20)
 ├─ total (computed, capped at 10.00)
 ├─ submitted_at (must be within 20 sec of set end — soft-enforced timer)
 └─ is_chief_prefilled: BOOLEAN  // enforces rule 2.2 item 4 (Chief scores before seeing others)

ElementSelection
 ├─ apparatus, phase: ENUM [MOUNT, HOLD, ACROBATIC, CATCH, DISMOUNT]
 ├─ element_name (from Difficulty Table, Section 3)
 ├─ class: ENUM [A, B, C]
 └─ value: DECIMAL (0.20 / 0.40 / 0.60 — auto-filled from class)
```

> **Note on deductions:** All deductions (posture faults, falls, coach interference,
> attire, timing overage, misconduct, etc.) are the judge's own call and are already
> reflected inside the Execution component (and, where relevant, the Difficulty/
> Combination components) of each judge's slip before it is submitted. The system
> does **not** apply any separate post-average deduction step — the submitted
> `total` on each `JudgeSlip` is the judge's final say on that performance, and the
> panel-level algorithm (Section 4) only ever averages/reconciles those totals.
> There is no Chief-Judge deduction catalog or deduction stage in this system.

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

#### 3.2.1 Overflow / Shortfall Cascade Rule (STRICT HIERARCHY — C → B → A)

A performer will rarely land exactly on the required A/B/C mix. When the
count of executed elements in a class differs from the required count, the
software must resolve the point value using a **strict top-down cascade**:
excess at the **C** level cascades down into **B**, and excess at the **B**
level (including anything cascaded from C) cascades down into **A**. A class
never receives a fractional/split contribution from two different source
classes' "extra" — an extra C-class element converts wholesale into a
single B-class-equivalent credit (not half-B/half-A, not a blended value).

**Algorithm:**
```python
def resolve_difficulty_value(counts: dict, required: dict) -> dict:
    """
    counts:   {"A": n, "B": n, "C": n}  -- elements actually executed
    required: {"A": n, "B": n, "C": n}  -- per 3.2 table for this competition type

    Returns per-class point contribution, applying the cascade:
      1. Score C first, capped at required["C"]. Any C elements beyond the
         required count do NOT score as extra C — each excess C element is
         instead offered as ONE full B-class slot (cascade down).
      2. Score B next: (executed B count) + (cascaded-down excess C count),
         capped at required["B"]. Any excess beyond required["B"] cascades
         down further into A.
      3. Score A last: (executed A count) + (cascaded-down excess from B),
         capped at required["A"]. Elements still unused beyond this point
         earn no further difficulty credit (A is the floor of the cascade;
         there is nothing below A to cascade into).
    """
    c_used = min(counts["C"], required["C"])
    c_excess = max(0, counts["C"] - required["C"])

    b_pool = counts["B"] + c_excess
    b_used = min(b_pool, required["B"])
    b_excess = max(0, b_pool - required["B"])

    a_pool = counts["A"] + b_excess
    a_used = min(a_pool, required["A"])

    return {
        "C": round(c_used * C_CLASS_VALUE, 2),
        "B": round(b_used * B_CLASS_VALUE, 2),
        "A": round(a_used * A_CLASS_VALUE, 2),
        "total": round(c_used * C_CLASS_VALUE + b_used * B_CLASS_VALUE + a_used * A_CLASS_VALUE, 2),
        "shortfall_flag": (c_used < required["C"]) or (b_used < required["B"]) or (a_used < required["A"])
    }
```

**Worked example (Competition I, required A:4 B:6 C:1):**
Performer executes `{A: 0, B: 5, C: 2}`.
```
Step 1 — C: required 1. Executed 2. c_used = 1 (→ 0.60). c_excess = 1.
Step 2 — B: pool = 5 (executed) + 1 (cascaded from C) = 6. required 6.
          b_used = 6 (→ 2.40). b_excess = 0.
Step 3 — A: pool = 0 (executed) + 0 (cascaded from B) = 0. required 4.
          a_used = 0 (→ 0.00). shortfall_flag = TRUE (short of the 4×A requirement).

TOTAL DIFFICULTY = 0.60 (C) + 2.40 (B) + 0.00 (A) = 3.00 / 3.80
```
The single extra C converts into exactly one B-credit — it is never split
partially into B and partially into A. The unmet A requirement is a genuine
shortfall (0 of 4 A-class elements performed) and is **not** backfilled by
anything cascading further down, because A is the bottom of the hierarchy.

This cascade applies identically to Competition II/III's `{A:1, B:6, C:2}`
requirement — same function, different `required` input.

### 3.3 Point Distribution (universal ceiling, all apparatus, all competitions)
```
DIFFICULTY   = 3.80
COMBINATION  = 1.60
EXECUTION    = 4.40
BONUS        = 0.20
TOTAL        = 10.00
```

### 3.4 Tolerance Limit Table (Chief Judge vs. avg-of-2-middle-scores — 4/5-judge panels only)
```
if avg_score in [9.00, 10.00]: tolerance = 0.10
elif avg_score in [8.00, 9.00): tolerance = 0.20
elif avg_score in [7.00, 8.00): tolerance = 0.30
elif avg_score in [6.00, 7.00): tolerance = 0.40
elif avg_score in [5.00, 6.00): tolerance = 0.50
else: tolerance = 1.00   # below 5.00
```

### 3.5 Time Deduction Reference (overage beyond 90 sec)
```
overage <= 3 sec:  deduction = 0.20
overage <= 5 sec:  deduction = 0.30
overage <= 9 sec:  deduction = 0.40
overage >= 10 sec: deduction = 0.50
```
This table is shown to judges as a reference while scoring so any time
overage can be folded directly into that judge's Execution score — it is not
applied as a separate system-level deduction step.

---

## 4. THE SCORING ALGORITHM (pseudocode — this is the heart of the system)

### 4.1 Panel-Size Rule (drives which algorithm branch runs)

The system supports three judge-panel sizes. **Panel size determines the
entire scoring path** — this must be modeled as three distinct, explicit
code paths (or a single function with a `panel_size` switch), never inferred
implicitly from how many slips happen to arrive.

| Panel size | Roles | Calculation method |
|---|---|---|
| **3 judges** | J1, J2, J3 (no Chief Judge) | Simple average of all 3 totals |
| **4 judges** | Sr. Judge (=Chief), J2, J3, J4 | Treated as a 5-judge-equivalent panel — see 4.2 |
| **5 judges** | Chief + J1, J2, J3, J4 | Standard COP method (drop high/low, average middle two, tolerance-check vs Chief) |

### 4.2 Branch A — 3-Judge Panel
```python
def score_3_judge_panel(slips: list[JudgeSlip]) -> dict:
    assert len(slips) == 3
    totals = [s.total for s in slips]
    avg_score = round(sum(totals) / 3, 3)
    return {
        "method": "3_JUDGE_SIMPLE_AVERAGE",
        "totals": totals,
        "avg_score": avg_score,
        "base_score": None,          # no tolerance/base-score concept at this panel size
        "final_score": avg_score
    }
```

### 4.3 Branch B — 4-Judge Panel (runs as a 5-judge-equivalent)

A 4-judge panel is explicitly treated as the 5-judge COP method: the
Sr. Judge on the panel fills the Chief Judge role, and J2/J3/J4 are the
evaluation judges. Internally this reuses the exact same function as the
5-judge Standard COP branch (4.4) — there is no separate math for 4 judges,
it simply *is* the 5-judge algorithm with the Sr. Judge acting as Chief.

```python
def score_4_judge_panel(slips: list[JudgeSlip]) -> dict:
    # Re-tag roles: the Sr. Judge on a 4-judge panel plays the Chief role.
    chief_slip = next(s for s in slips if s.judge_role == "SR_JUDGE")
    eval_slips = [s for s in slips if s.judge_role in ("J2", "J3", "J4")]
    assert len(eval_slips) == 3

    # Reuses the standard COP branch — same tolerance table, same base-score formula —
    # just with 3 evaluation judges instead of 4 (drop nothing, average all 3, since
    # there is no "drop high/low" step defined for a 3-evaluator sub-panel; the
    # 5-judge COP high/low-drop only applies when 4 full evaluation judges are present,
    # per 4.4 below).
    return score_5_judge_standard_cop(chief_slip, eval_slips, drop_high_low=False)
```

> **Implementation note:** because a 4-judge panel supplies only 3
> evaluation judges (Sr. Judge counted separately as Chief), there are not
> enough evaluation scores to perform a high/low drop. The panel is
> therefore run through the same Chief-vs-average / tolerance / base-score
> pipeline as the 5-judge branch, but with `drop_high_low=False` (average
> all 3 evaluation totals instead of dropping to a middle two). This keeps
> a single shared implementation (`score_5_judge_standard_cop`) rather than
> forking duplicate tolerance/base-score logic — the shared function takes
> a flag rather than becoming two near-identical copies.

### 4.4 Branch C — 5-Judge Panel (Standard COP Method, per Section 2.1–2.2 of the COP)
```python
def score_5_judge_standard_cop(chief_slip: JudgeSlip, eval_slips: list[JudgeSlip],
                                drop_high_low: bool = True) -> dict:
    totals = sorted(s.total for s in eval_slips)

    if drop_high_low:
        assert len(totals) == 4
        middle = totals[1:3]                       # drop lowest + highest of 4
        avg_score = round(sum(middle) / 2, 3)
    else:
        assert len(totals) == 3
        middle = totals                              # no drop — average all 3
        avg_score = round(sum(middle) / 3, 3)

    tolerance = get_tolerance(avg_score)
    diff = abs(chief_slip.total - avg_score)

    if diff <= tolerance:
        base_score = None
        final_score = avg_score
    else:
        base_score = round((avg_score + chief_slip.total) / 2, 3)
        final_score = base_score

    return {
        "method": "5_JUDGE_STANDARD_COP" if drop_high_low else "4_JUDGE_AS_5_JUDGE_EQUIVALENT",
        "middle_scores_used": middle,
        "avg_score": avg_score,
        "tolerance_used": tolerance,
        "diff_from_chief": diff,
        "base_score": base_score,
        "final_score": final_score
    }


def get_tolerance(score: float) -> float:
    if 9.00 <= score <= 10.00: return 0.10
    if 8.00 <= score < 9.00:   return 0.20
    if 7.00 <= score < 8.00:   return 0.30
    if 6.00 <= score < 7.00:   return 0.40
    if 5.00 <= score < 6.00:   return 0.50
    return 1.00


def get_time_deduction_reference(actual_seconds: float, limit_seconds: float = 90.0) -> float:
    """Reference lookup only — judges apply this within their own Execution score."""
    overage = actual_seconds - limit_seconds
    if overage <= 0: return 0.0
    if overage <= 3: return 0.20
    if overage <= 5: return 0.30
    if overage <= 9: return 0.40
    return 0.50


def score_performance(slips: list[JudgeSlip], panel_size: int) -> dict:
    """Top-level dispatcher — panel_size is the single source of truth for routing."""
    if panel_size == 3:
        return score_3_judge_panel(slips)
    elif panel_size == 4:
        return score_4_judge_panel(slips)
    elif panel_size == 5:
        chief_slip = next(s for s in slips if s.judge_role == "CHIEF")
        eval_slips = [s for s in slips if s.judge_role in ("J1", "J2", "J3", "J4")]
        return score_5_judge_standard_cop(chief_slip, eval_slips, drop_high_low=True)
    else:
        raise ValueError(f"Unsupported panel size: {panel_size}")
```

### 4.5 Judge Slip Internal Validation (per slip, before it can be submitted)
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
    # Apply the strict cascade (3.2.1) to compute the actual scorable value —
    # this is NOT a simple mismatch warning, it's the authoritative point calc.
    result = resolve_difficulty_value(counts, required)
    if result["shortfall_flag"]:
        return Warning(f"Element mix {counts} falls short of required {required} "
                        f"after cascade — scored value {result['total']} / 3.80")
    return result
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
  2. Score each performance via the panel-size-appropriate algorithm (Section 4).
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

---

## 7. QUALIFICATION & TIE-BREAK ENGINE (rule 1.12)

```python
def break_tie(candidates: list[Performance]) -> list[Performance]:
    # Step 1: compare base_score (if computed) or fall back to avg_score
    step1 = sort_by(candidates, key=lambda p: p.base_score or p.avg_score, desc=True)
    if not tied(step1): return step1

    # Step 2: average of the evaluation judges (excluding chief)
    step2 = sort_by(step1, key=lambda p: p.average_score, desc=True)
    if not tied(step2): return step2

    # Step 3: (avg of judges + chief judge score) / 2
    step3 = sort_by(step2, key=lambda p: (p.average_score + p.chief_score) / 2, desc=True)
    if not tied(step3): return step3

    # Step 4: lucky draw
    return random_shuffle(step3)  # log as "resolved by draw" in audit trail
```
Applies only to All-Round Individual (Comp II) and Apparatus Championship
(Comp III) placements — not to Team Championship ranking directly (which uses
summed team totals). Steps 2–3 assume a 4/5-judge panel (chief score
available); for a 3-judge panel, tie-break collapses to Step 1 (base/avg
score) then directly to Step 4 (lucky draw), since there is no chief score
to fall back on.

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
3. **Judge Panel Assignment** — assign panel size (3, 4, or 5 judges),
   Chief/Sr. Judge/Judges/Scorer/Timekeeper/Set Writer per apparatus per
   competition; enforce one-judge-per-state (1.7.2) and neutral-state
   Chief/Scorer rule (1.7.5).
4. **Live Scoring Console** (per judge, tablet-friendly):
   - Timer widget synced to Timekeeper (60s short signal, 90s long signal)
   - Slip entry: Difficulty (element picker from apparatus Element Bank, with
     the cascade calculator from 3.2.1 running live as elements are picked)
     + Combination (checklist-driven auto-calc) + Execution (judge enters
     their own net Execution score directly, informed by the deduction
     guidance figures — no separate deduction-application step in the
     system) + Bonus toggle
   - **Chief/Sr. Judge's screen must be locked until all other judges submit**,
     and the Chief/Sr. Judge's own score must be timestamped as submitted
     first (2.2 rule 4) — enforce via server-side ordering, not just UI
     convention. (3-judge panels have no Chief role, so this lock does not apply.)
5. **Scorer/Chief Dashboard** — shows all incoming slips, auto-computes the
   panel-size-appropriate result (simple average for 3-judge; avg-of-middle
   + tolerance-check + base-score for 4- and 5-judge panels), flags
   "BASE SCORE REQUIRED" when tolerance is exceeded, and locks the Final Score.
6. **Score Sheet Generator** — reproduces Appendix A (Judge's Score Sheet),
   B (Comp I slip), C (Comp II/III slip), E/F (Final Results Men/Women),
   G/H (All-Round Individual) as PDF exports with digital signatures
   (name + timestamp in lieu of wet signature, or e-signature pad).
7. **Qualification Engine Dashboard** — auto-lists Competition II/III
   qualifiers as Competition I data comes in, with override capability for
   Jury of Appeal decisions and the "Finalize from Competition I" fallback.
8. **Protest Module** — timestamped protest submission (30-min window,
   rule 1.17), fee tracking, Jury of Appeal decision log.
9. **Reports** — Team Championship standings, All-Round standings,
   Apparatus Championship standings, per rule 1.23 event list.

---

## 11. VALIDATION / EDGE CASES TO HANDLE EXPLICITLY

- Judge slip submitted >20 sec after set end → flag as late (soft warning,
  doesn't block, per real-world practicality — COP doesn't specify a penalty
  for lateness itself).
- Difficulty element list not matching required A/B/C mix for the
  competition type → run the 3.2.1 cascade to compute the actual scorable
  value and surface the shortfall, rather than a soft warning with no
  resolved number — judges should see the real point impact live.
- Team with <5 scored players on an apparatus → auto-exclude from Team
  Championship math but keep individual scores live for Comp II/III feed.
- Competition II/III tie at qualifying boundary → auto-run tie-break engine
  (Section 7) and surface the deciding factor in the UI, not just the result.
- Hanging Mallakhamb apparatus should never appear as selectable for a
  Women's competition (hard block, not warning — this is a strict rule,
  1.8.2/1.10).
- Panel size (3 / 4 / 5) must never be conflated across the three branches —
  keep these as three distinct, explicit code paths (with the 4-judge branch
  explicitly reusing the 5-judge function via a flag, per 4.3), not one
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
  → base score 9.225) as your first unit tests for the 5-judge scoring
  branch, plus the cascade worked example in 3.2.1 as your first unit test
  for the difficulty-resolution logic.
