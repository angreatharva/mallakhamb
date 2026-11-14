#!/usr/bin/env node
'use strict';

/**
 * Generator 1: gen-enums (07 §1), report mode.
 *
 * Reads every Mongoose enum field and the Node config modules, groups them
 * into the kernel's `WireEnum` concepts, and writes:
 *
 *   generated/vocabulary.json     every concept: wire values, Java constant
 *                                 names, behaviour, named subsets, the fields
 *                                 that use it. Stage 2 emits the Java enums
 *                                 from this file.
 *   generated/VOCABULARY-DRIFT.md every place Node's definitions disagree,
 *                                 with a proposed decision per row (08 §16).
 *
 * Output is deterministic (no timestamps), so CI can check it is current.
 * Exits 1 if a Mongoose enum field belongs to no concept.
 */

const { loadModels, requireServer, writeGenerated } = require('../lib/server');
const { collectEnumFields } = require('../lib/schema-enums');
const { CONCEPTS, RULE_DATA_FIELDS } = require('./enum-concepts');

/** `Under10` → `UNDER_10`, `Senior Judge` → `SENIOR_JUDGE`, `J1` → `J1`, `email-change` → `EMAIL_CHANGE`. */
function javaConstant(value, numberPrefix) {
  if (typeof value === 'number') return `${numberPrefix || 'VALUE'}_${String(value).replace('.', '_')}`;
  return value
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([a-z])(\d)/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

const sameSet = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
const leafName = (fieldPath) => fieldPath.split('.').filter((part) => !part.startsWith('$')).pop().replace('[]', '');
const code = (value) => `\`${value}\``;
const list = (values) => values.map(code).join(', ');

function collectFields() {
  const fields = [];
  for (const { name, model, file } of loadModels()) {
    for (const field of collectEnumFields(model.schema)) {
      fields.push({ ...field, id: `${name}.${field.path}`, model: name, file });
    }
  }
  return fields;
}

function assign(fields) {
  const byConcept = new Map(CONCEPTS.map((concept) => [concept.name, []]));
  const ruleData = [];
  const unassigned = [];

  for (const field of fields) {
    const rule = RULE_DATA_FIELDS.find((entry) => entry.field.test(field.id));
    if (rule) {
      ruleData.push({ ...field, rulebook: rule.rulebook });
      continue;
    }
    const matches = CONCEPTS.filter((concept) => concept.fields.some((regex) => regex.test(field.id)));
    if (matches.length !== 1) {
      unassigned.push({ field, matches: matches.map((concept) => concept.name) });
      continue;
    }
    byConcept.get(matches[0].name).push(field);
  }
  return { byConcept, ruleData, unassigned };
}

/** Map a field's values onto the concept's canonical values (identity, or through an alternative form). */
function toCanonical(values, canonical, forms) {
  if (values.every((v) => canonical.includes(v))) return { form: 'wire', values };
  for (const formName of forms ? Object.keys(Object.values(forms)[0] || {}) : []) {
    const back = new Map(canonical.map((v) => [forms[v][formName], v]));
    if (values.every((v) => back.has(v))) return { form: formName, values: values.map((v) => back.get(v)) };
  }
  return { form: 'unknown', values };
}

function buildConcept(concept, fields) {
  if (fields.length === 0) throw new Error(`Concept ${concept.name} matches no Mongoose field; fix enum-concepts.js`);

  const forms = concept.forms ? null : undefined;
  let canonical = concept.source ? [...concept.source(requireServer)] : null;
  if (!canonical) {
    canonical = [];
    for (const field of fields) for (const v of field.values) if (!canonical.includes(v)) canonical.push(v);
  }
  const formTable = concept.forms ? concept.forms(requireServer, canonical) : forms;
  const behaviour = concept.behaviour ? concept.behaviour(requireServer, canonical) : {};
  const subsets = concept.subsets ? concept.subsets(requireServer) : {};

  const drift = [];
  const usages = fields.map((field) => {
    const mapped = toCanonical(field.values, canonical, formTable);
    const usage = {
      field: field.id,
      file: field.file,
      form: mapped.form,
      nullable: field.nullable,
      isArray: field.isArray,
      values: field.values,
    };
    if (mapped.form === 'unknown') {
      const extra = field.values.filter((v) => !canonical.includes(v));
      drift.push({ kind: 'extra', field: field.id, detail: `allows ${list(extra)}, which the canonical list doesn't have` });
    } else {
      if (mapped.form !== 'wire') {
        drift.push({ kind: 'form', field: field.id, detail: `stores the ${mapped.form} form (${list(field.values)}) instead of the wire value` });
      }
      if (!sameSet(mapped.values, canonical)) {
        const missing = canonical.filter((v) => !mapped.values.includes(v));
        const named = Object.entries(subsets).find(([, members]) => sameSet(mapped.values, members));
        usage.subset = named ? named[0] : null;
        drift.push({ kind: 'subset', field: field.id, detail: `doesn't allow ${list(missing)}${named ? ` (= named set \`${named[0]}\`)` : ''}` });
      }
    }
    if (concept.fieldName && leafName(field.path) !== concept.fieldName) {
      drift.push({ kind: 'name', field: field.id, detail: `the field is called ${code(leafName(field.path))}, not ${code(concept.fieldName)}` });
    }
    return usage;
  });

  return {
    name: concept.name,
    wireType: typeof canonical[0] === 'number' ? 'number' : 'string',
    canonicalSource: concept.source ? 'node-config' : 'union-of-fields',
    values: canonical.map((wire) => ({
      constant: javaConstant(wire, concept.numberPrefix),
      wire,
      ...(formTable ? formTable[wire] : {}),
      ...(behaviour[wire] || {}),
    })),
    subsets,
    unlisted: concept.unlisted || null,
    usages,
    drift: drift.map((row) => ({ ...row, proposal: (concept.decisions || {})[row.kind] || null })),
  };
}

function renderDrift(concepts, ruleData, totalFields) {
  const withDrift = concepts.filter((concept) => concept.drift.length > 0);
  const unlisted = concepts.filter((concept) => concept.unlisted);
  const lines = [
    '# Vocabulary drift report',
    '',
    '<!-- GENERATED by tools/node/gen/gen-enums.js. Do not edit; fix the generator or enum-concepts.js. -->',
    '',
    'Every place where the Node backend defines one concept in more than one way,',
    'read from the live Mongoose schemas and config modules (08 §16). Each row',
    'needs a decision from the lead before milestone 2a. No decision may change a',
    'stored or wire value. Decisions are recorded in `MIGRATION-STATUS.md`.',
    '',
    '## Summary',
    '',
    `- Enum-constrained Mongoose fields: **${totalFields}** in ${new Set(concepts.flatMap((c) => c.usages.map((u) => u.field.split('.')[0]))).size} models (the plan counted 77).`,
    `- Kernel enums: **${concepts.length}** (the plan lists 28).`,
    `- Fields that are COP rule values, not vocabulary: **${ruleData.length}**.`,
    `- Concepts with drift: **${withDrift.length}**, drift rows: **${withDrift.reduce((n, c) => n + c.drift.length, 0)}**.`,
    '',
    '| Kind | Meaning |',
    '|---|---|',
    '| `subset` | The field allows fewer values than the concept has |',
    '| `form` | The field stores another spelling of the same value |',
    '| `name` | The field has a different name from the same concept elsewhere |',
    '| `extra` | The field allows a value the canonical list doesn\'t have |',
    '',
  ];

  for (const concept of withDrift) {
    lines.push(`## ${concept.name}`, '');
    lines.push(`Canonical values (${concept.canonicalSource === 'node-config' ? 'from the Node config module' : 'union of the fields'}): ${list(concept.values.map((v) => v.wire))}`, '');
    const kinds = [...new Set(concept.drift.map((row) => row.kind))];
    for (const kind of kinds) {
      const rows = concept.drift.filter((row) => row.kind === kind);
      // Fields with the same detail are one decision; group them.
      const groups = new Map();
      for (const row of rows) groups.set(row.detail, [...(groups.get(row.detail) || []), row.field]);
      lines.push(`**${code(kind)}**`, '');
      lines.push('| Fields | What differs |', '|---|---|');
      for (const [detail, fields] of groups) lines.push(`| ${fields.map(code).join('<br>')} | ${detail} |`);
      lines.push('');
      lines.push(`Proposed: ${rows[0].proposal || '_none yet; needs the lead._'}`, '');
    }
  }

  lines.push('## Enums the plan doesn\'t list', '');
  if (unlisted.length === 0) lines.push('None.', '');
  for (const concept of unlisted) {
    lines.push(`- **${concept.name}** (${list(concept.values.map((v) => v.wire))}), used by ${concept.usages.map((u) => code(u.field)).join(', ')}. ${concept.unlisted}`);
  }
  if (unlisted.length > 0) lines.push('');

  lines.push('## Enum fields that are rule data', '');
  lines.push('These go to the rulebook (generator 3, 09), not to a kernel enum.', '');
  lines.push('| Field | Values | Rulebook entry |', '|---|---|---|');
  for (const field of ruleData) lines.push(`| ${code(field.id)} | ${list(field.values)} | ${field.rulebook} |`);
  lines.push('');

  lines.push('## Not checked here', '');
  lines.push('Drift this generator can\'t see from schemas and config (08 §1):', '');
  lines.push('- Error codes used by routes but missing from `error-codes.js`: see `CATALOGUE-REPORT.md` (gen-catalogues).');
  lines.push('- Whether a superadmin\'s token says `userType: \'admin\'` or `\'superadmin\'` on each login path: confirmed from the Stage-1 recordings.');
  lines.push('- Category naming copies (Competition I–III vs I–V) in `socket.manager.js` and `scoring-room.util.js`: resolved by `Rooms` and `CompetitionType.fromAny` (08 §4, §7).');
  return lines.join('\n');
}

function main() {
  const fields = collectFields();
  const { byConcept, ruleData, unassigned } = assign(fields);

  if (unassigned.length > 0) {
    for (const { field, matches } of unassigned) {
      const why = matches.length === 0 ? 'matches no concept' : `matches ${matches.join(' and ')}`;
      console.error(`gen-enums: ${field.id} ${JSON.stringify(field.values)} ${why}`);
    }
    console.error('gen-enums: add or fix the concept in tools/node/gen/enum-concepts.js');
    process.exit(1);
  }

  const concepts = CONCEPTS.map((concept) => buildConcept(concept, byConcept.get(concept.name)));
  const vocabulary = {
    generatedBy: 'tools/node/gen/gen-enums.js',
    fieldCount: fields.length,
    concepts,
    ruleDataFields: ruleData.map(({ id, values, rulebook }) => ({ field: id, values, rulebook })),
  };

  const jsonFile = writeGenerated('vocabulary.json', JSON.stringify(vocabulary, null, 2));
  const driftFile = writeGenerated('VOCABULARY-DRIFT.md', renderDrift(concepts, ruleData, fields.length));
  const driftRows = concepts.reduce((n, concept) => n + concept.drift.length, 0);
  console.log(`gen-enums: ${fields.length} fields → ${concepts.length} enums, ${driftRows} drift rows`);
  console.log(`  ${jsonFile}\n  ${driftFile}`);
}

main();
