---
name: cop-update
description: Read a new Mallakhamb Code of Points (COP) PDF and propose a new rulebook edition for the backend - extract the rules into the rulebook schema with page and section quotes, diff against the current edition, run the checks, and write a change report for a person to approve. Use when given a new or revised COP PDF, or asked what changed between COP editions.
---

# Propose a new COP rulebook edition

You produce a **draft** rulebook and a change report. You never publish an
edition, never edit an existing edition file, and never change engine code.
A person approves every change against the PDF.

Design reference: `docs/springboot-migration/09-COP-RULEBOOK-ENGINE.md`.

## Inputs
- The COP PDF path (ask for it if not given).
- The current edition: the newest file in `backend/engines/src/main/resources/rulebooks/`.
- The schema: `backend/engines/src/main/resources/rulebooks/rulebook.schema.json`.

## Steps

1. **Extract.** Use the `pdf` skill to pull text and tables page by page into
   `backend/.cop/<sha256-prefix>/pages/`. Record the file's sha256. List any
   page you can't read confidently (scans, broken tables); don't guess them.
2. **Read, section by section.** For each section of the rulebook schema, find
   the matching COP section and fill the fields. **Every value needs
   `{page, section, quote}`** in the sidecar `evidence.json`; the quote is the
   exact sentence or table cell. No quote, no value: leave the field out and
   list it under "could not read".
   - Text shown to judges (checklists, rule wording) is copied **verbatim**,
     including punctuation. Note anything that looks like a typo in the PDF;
     don't fix it silently.
   - Procedures (averaging method, tie-break steps, substitution order,
     rounding) must be one of the names the schema allows. If the COP
     describes something none of them express, **don't force it**: record it
     under "needs code" with the section and quote.
3. **Verify.** Run a second, independent read with a subagent that sees only
   the pages and the schema (not your draft). Compare field by field. List
   every disagreement with both quotes.
4. **Diff** against the current edition:
   `node backend/tools/node/cop/diff.js <current.json> <draft.json>` (numbers,
   lists, and word-level text).
5. **Check:**
   `./gradlew :tools:copCheck --rulebook=<draft.json>` (from `backend/`) runs the schema, the semantic checks,
   the COP's worked examples (extract each example's inputs and stated answer
   into `examples.json` with its page), and the impact run on past score
   sheets **from a restored backup or staging copy, never production**. Report failures as they are; never adjust a value to make a check pass.
6. **Report.** Write `backend/.cop/<sha256-prefix>/COP-CHANGE-REPORT.md`:
   - a summary line: N changes (kind 1: x, kind 2: y, kind 3: z), M unresolved;
   - a table: field, old → new, kind, COP page and section, quote, affected engines and screens;
   - disagreements between the two reads;
   - "could not read", "needs code", "needs a decision";
   - check results and the impact numbers.
7. **Stop.** Tell the user the report is ready and what needs their decision.
   Only after they approve (they may correct values): write
   `rulebooks/cop-<yyyy>-<mm>.json` with `approvedBy`/`approvedAt` and the
   evidence sidecar as `cop-<yyyy>-<mm>.evidence.json`, run
   `./gradlew :tools:goldenVectors --edition=<id>`, and prepare the change on a
   branch for a pull request.

## Rules
- Never modify a published edition file. A correction is a new edition id (`-r1`).
- Never invent a value, section number or quote.
- Kind-3 changes (new procedures) become a developer task described in the report; don't write engine code in this skill.
- Self-test: run on `Server/docs/COP Mallakhamb.pdf`; the draft must equal `cop-2022-11.json` with zero differences. If it doesn't, the skill or the schema needs fixing before it's trusted on a new PDF.
