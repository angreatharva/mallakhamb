# Port kit: Node tools

Tools for the Spring Boot migration that read the live Node backend
(`Server/`). Design: [07-CODEGEN-AND-AGENT-KIT.md](../../../docs/springboot-migration/07-CODEGEN-AND-AGENT-KIT.md).

`Server/` is never changed by these tools. They have their own
`package.json`, and they need `Server/node_modules` to be installed because
they load the Mongoose models and config modules. No database is used.

## Setup

```bash
cd Server && npm ci
```

```bash
cd mallakhamb-backend/tools/node && npm ci
```

## Commands (run in `mallakhamb-backend/tools/node`)

| Command | Does |
|---|---|
| `npm run gen` | Runs every generator below |
| `npm run gen:enums` | Generator 1, report mode: `generated/vocabulary.json`, `generated/VOCABULARY-DRIFT.md` |
| `npm run gen:catalogues` | Generator 2, report mode: `generated/catalogues.json`, `generated/CATALOGUE-REPORT.md` |
| `npm run golden` | Writes the committed golden vectors to `golden/cop-2022-11/` |
| `npm run golden:verify` | Replays the committed vectors against Node; fails on any difference |
| `npm run golden:full` | Writes the 100,000-per-engine set to `build/golden-full/` (not committed) and records its hashes in `manifest.full.json` |
| `npm test` | Fails if the committed reports are stale, an enum field has no concept, or a golden vector no longer replays |

## Files

| File | Purpose |
|---|---|
| `gen/enum-concepts.js` | The one hand-written input: which Mongoose enum fields are the same concept, and the proposed decision for each kind of drift |
| `gen/gen-enums.js` | Reads the schemas and config modules, writes the vocabulary and the drift report |
| `gen/gen-catalogues.js` | Babel AST pass over `Server/src`: error codes, statuses, messages, socket events, cookies, headers, stray `process.env` reads |
| `golden/generate.js` | Runs the Node engine functions on fixed and seeded-random inputs and writes `{id, args, result}` or `{id, args, throws}` lines |
| `golden/suites/*.js` | One file per engine: the functions, their fixed cases and their random input builders |
| `golden/lib/codec.js` | JSON encoding for `undefined`, `NaN`, `-0`, `Infinity` and dates |
| `golden/lib/rng.js` | The seeded random source |
| `lib/server.js` | Paths, model loading, output writing |
| `lib/schema-enums.js` | Walks a Mongoose schema for enum fields |

## Rules

- Output is deterministic: no timestamps, sorted keys, LF endings. `npm test` and CI rely on that.
- Report mode writes no Java. In Stage 2 the same generators emit the kernel enums and catalogues from `vocabulary.json` and `catalogues.json`.
- A new Mongoose enum field with no concept makes `gen-enums` exit 1. Add it to `gen/enum-concepts.js`.
- A golden case never relies on "now": every function that defaults to the current time is called with an explicit one.
- After any change in `Server/`, run `npm run gen` and `npm run golden`, and commit the result. The diff of `generated/` is the to-do list for the Java side.
