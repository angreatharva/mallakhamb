/**
 * The two score seeders must describe the SAME meet.
 *
 * `Web/e2e/score-all.spec.js` judges the meet through the browser and
 * `Server/scripts/seedScores.js` judges it through the API. They produce the
 * same database and are used interchangeably, but they cannot share a module —
 * the two stacks have different module systems, which is the same reason
 * `Web/e2e/support/admin-data.js` restates the admin credentials rather than
 * importing them.
 *
 * So the constants are duplicated, and duplication drifts. The failure mode is
 * the one `panel-plan.js` already warns about: a panel scored by the wrong
 * method produces a BELIEVABLE number rather than an error. Seed a database with
 * the API script, check it against an expectation written for the UI script, and
 * the disagreement shows up as a wrong result nobody can explain.
 *
 * This reads both files as text and compares what they claim. Parsing source is
 * an unusual thing for a test to do; it is worth it here because the alternative
 * is trusting that two files stay in step by everyone remembering.
 */

const fs = require('node:fs');
const path = require('node:path');

const UI_SPEC = path.join(__dirname, '..', '..', '..', 'Web', 'e2e', 'score-all.spec.js');
const PANEL_PLAN = path.join(__dirname, '..', '..', '..', 'Web', 'e2e', 'support', 'panel-plan.js');
const API_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'seedScores.js');

/** @param {string} file */
const read = (file) => {
  if (!fs.existsSync(file)) throw new Error(`Expected to find ${file}`);
  return fs.readFileSync(file, 'utf8');
};

/**
 * Pull one captured value out of a source file.
 * @param {string} source
 * @param {RegExp} pattern - with exactly one capture group
 * @param {string} what - for the failure message
 */
function extract(source, pattern, what) {
  const match = pattern.exec(source);
  if (!match) {
    throw new Error(
      `Could not find ${what}. This test parses source, so a rename breaks it — `
      + 'update the pattern here rather than deleting the check.'
    );
  }
  return match[1];
}

describe('the browser and API score seeders agree', () => {
  const ui = read(UI_SPEC);
  const plan = read(PANEL_PLAN);
  const api = read(API_SCRIPT);

  it('marks the routine the same', () => {
    // 3.80 difficulty + 1.60 combination + execution = the slip total.
    expect(extract(api, /EVAL_MARK = ([\d.]+)/, 'EVAL_MARK in the API script'))
      .toBe(extract(ui, /EVAL_MARK = ([\d.]+)/, 'EVAL_MARK in the UI spec'));

    expect(extract(api, /CHIEF_MARK = ([\d.]+)/, 'CHIEF_MARK in the API script'))
      .toBe(extract(ui, /CHIEF_MARK = ([\d.]+)/, 'CHIEF_MARK in the UI spec'));
  });

  it('breaks the same checklist item to create a slip mismatch', () => {
    // The item's penalty differs by apparatus (0.10 on Pole, 0.20 on Rope), so
    // a different item is a different score, not just a different label.
    expect(extract(api, /ITEM_UNMET = (\d+)/, 'the unmet item in the API script'))
      .toBe(extract(ui, /ITEM_7_UNMET = \[(\d+)\]/, 'the unmet item in the UI spec'));
  });

  it('expects the same two final scores', () => {
    const uiFinals = extract(ui, /finalScore: breaches \? '([\d.]+)' : '([\d.]+)'/, 'the finals in the UI spec');
    const uiBreach = /finalScore: breaches \? '([\d.]+)' : '([\d.]+)'/.exec(ui);
    const apiBreach = /expectedFinal: breaches \? ([\d.]+) : ([\d.]+)/.exec(api);

    expect(uiFinals).toBeTruthy();
    expect(apiBreach).toBeTruthy();

    // Compared as numbers: the UI holds them as strings because it matches a
    // toast, the API as numbers because it compares stored values.
    expect(Number(apiBreach[1])).toBe(Number(uiBreach[1])); // tolerance breached
    expect(Number(apiBreach[2])).toBe(Number(uiBreach[2])); // clean
  });

  it('rotates the four scenarios in the same order', () => {
    const rotation = /\['clean', 'mismatch', 'tolerance', 'both'\]\[index % 4\]/;
    const pair = /\['clean', 'mismatch'\]\[index % 2\]/;

    // A 3-seat panel has no chief to measure against and therefore no tolerance
    // concept, so it alternates between the two states that exist for it.
    expect(rotation.test(ui)).toBe(true);
    expect(rotation.test(api)).toBe(true);
    expect(pair.test(ui)).toBe(true);
    expect(pair.test(api)).toBe(true);

    expect(/size >= 4/.test(ui)).toBe(true);
    expect(/size >= 4/.test(api)).toBe(true);
  });

  it('seats the panel in the same order, and calls the same people evaluators', () => {
    const seats = /EVALUATION_SEATS = (\[[^\]]+\])/;
    expect(extract(api, seats, 'EVALUATION_SEATS in the API script'))
      .toBe(extract(plan, seats, 'EVALUATION_SEATS in the panel plan'));

    // Everyone but the chief. Getting this wrong changes the averaging method.
    const evaluators = /evaluatorSeats = \(size\) => EVALUATION_SEATS\.slice\((1, size)\)/;
    expect(evaluators.test(api)).toBe(true);
    expect(evaluators.test(plan)).toBe(true);
  });

  it('makes Judge 1 the one who records a different routine', () => {
    // Which seat mismatches decides which slip the chief has to correct.
    expect(/seat === 'Judge 1'/.test(ui)).toBe(true);
    expect(/'Judge 1'/.test(api)).toBe(true);
  });

  it('reads the panel sizes from the committed plan rather than restating them', () => {
    // The sizes are the one thing neither file is allowed to hold its own copy
    // of — a panel seated as 4 and scored as 5 is the believable-wrong-number
    // case in full.
    expect(/panel-plan\.json/.test(api)).toBe(true);
    expect(/from '\.\/support\/panel-plan/.test(ui) || /panel-plan/.test(ui)).toBe(true);
  });
});
