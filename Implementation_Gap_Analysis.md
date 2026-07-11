# Mallakhamb Judging Software v2.md - Implementation Gap Analysis

This document outlines the differences, missing implementations, and architectural gaps between the current codebase and the specifications defined in `Mallakhamb Judging Software v2.md`.

## 1. Core Domain Model Gaps

The most significant deviations from the specification are found in the data models (`Server/models/`). The current implementation heavily relies on embedding arrays and flattening data into the `Score` model, whereas the specification requires distinct relational entities.

### Missing `Championship` vs `Competition`
- **Spec:** Defines a `Championship` (e.g., "National Games") which has many `Competition` entities (e.g., "Comp I - Team", "Comp II - All-Round").
- **Current Implementation:** There is no `Championship` model. The `Competition.js` model acts as the Championship, storing an array of `competitionTypes` (`['competition_1', 'competition_2', 'competition_3']`) rather than creating distinct Competition child entities with their own specific rules (type, sex, age group, apparatus).

### Missing `JudgePanel` Entity
- **Spec:** Requires a `JudgePanel` model that enforces panel sizes (3, 4, or 5), requires a chief judge for 4/5-judge panels, and enforces state neutrality.
- **Current Implementation:** No `JudgePanel` model exists. Judges are dynamically assigned and stored as a JSON map (`judgeDetails`) inside the `Score` document.

### Missing `Performance` Entity
- **Spec:** Dictates a `Performance` entity representing one row per player per apparatus per competition.
- **Current Implementation:** No `Performance` model exists. Player performances are stored as an array of subdocuments (`playerScores`) embedded within a massive `Score` document for the entire team.

### Missing `JudgeSlip` Entity
- **Spec:** Each `Performance` should have an array of `JudgeSlip` entities (one per judge). Each slip contains its own difficulty, combination, execution, and bonus scores.
- **Current Implementation:** The `playerScoreSchema` inside `Score.js` stores only **one** unified `scoreBreakdown` (Difficulty, Combination, Execution, Originality) per player performance, rather than an array of individual `JudgeSlip` breakdowns. It only stores a simple map of final totals for the judges (`judgeScores: { seniorJudge, judge1, judge2, judge3, judge4 }`). This prevents individual judges from submitting their own detailed score breakdowns.

### Missing `ElementSelection` Entity
- **Spec:** Judges should select specific elements from the Element Bank (e.g., A-class mounts, B-class acrobatic elements) which are stored as `ElementSelection` rows on the performance.
- **Current Implementation:** The system only stores the raw count of executed elements (`aClass`, `bClass`, `cClass` inside `scoreBreakdown.difficulty`). It does not store which specific elements were performed.

## 2. Scoring Algorithm & Logic Gaps

### Post-Average Deductions vs Judge-Applied Deductions
- **Spec:** Section 2 explicitly states: *"The system does **not** apply any separate post-average deduction step... any time overage can be folded directly into that judge's Execution score."*
- **Current Implementation:** The `Score` model and `calculation.service.js` apply system-level post-average deductions (`averageMarks - deduction - otherDeduction = finalScore`). This directly contradicts the spec.

### Chief Judge Pre-fill Enforcement
- **Spec:** Rule 2.2 item 4 dictates that the Chief Judge scores before seeing others. The system should lock the Chief Judge's slip until submitted, and lock out the evaluation judges' scores from the Chief until then.
- **Current Implementation:** The backend does not enforce a temporal lock on the Chief Judge's submission.

## 3. What is Properly Configured

The core Code of Points (COP) mathematics have been correctly ported and reside in both the frontend (`Web/src/utils/scoring/copRules.js`) and backend (`Server/src/config/cop-rules.js` and `Server/src/utils/scoring/calculation.util.js`):

- **Panel Size Logic:** The backend correctly implements the 3, 4, and 5 judge panel calculation branches (averaging vs dropping high/low vs tolerance checks).
- **Difficulty Cascade:** The `resolveDifficultyValue` algorithm (C -> B -> A cascade) is perfectly implemented.
- **Tolerance Limits:** The tiered tolerance table (0.10 for >=9.00, etc.) is correctly configured.
- **Combination Checklists:** Apparatus-specific checklists for Pole, Hanging, and Rope are correctly configured with their respective penalties.

## 4. Recommendations for Alignment

To fully align the software with `v2.md`, the following architectural refactors are needed:
1. **Database Migration:** Break apart `Score.js` into distinct `Performance` and `JudgeSlip` collections.
2. **Scoring API Update:** Update the scoring APIs to accept arrays of `ElementSelection` from the frontend, rather than just A/B/C counts.
3. **Deduction Removal:** Remove the `deduction` and `otherDeduction` fields from the final score calculation pipeline, allowing judges to manually adjust their execution scores based on the time reference table.
