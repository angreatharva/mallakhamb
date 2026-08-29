/**
 * Allow-list projections for user-shaped documents.
 *
 * Extracted from admin.service.js (task 3.1) so the scoring service can share
 * them rather than keep a second copy. These lists are a security control —
 * they are what stops CRIT-4 (coach and minor-athlete credentials and PII
 * reaching the wire) from recurring — and a duplicated security control is one
 * that drifts. There must be exactly one definition.
 *
 * Every field here was chosen against a real consumer; the citations are kept
 * so nobody widens or narrows a list on a guess.
 */

// Judge panel roster — the ASSIGNMENT, plus the reference to the person.
//
// `name`/`username`/`password` are no longer projected: identity moved to
// JudgeAccount, and the display name now arrives by populating `judgeAccount`
// and flattening it (see flattenJudgeAccount below), so consumers that read
// `judge.name` keep working while nothing reads a credential off this document
// ever again.
const JUDGE_PUBLIC_FIELDS = [
  '_id',
  'judgeAccount',
  'competition',
  'competitionTypes',
  'gender',
  'ageGroup',
  'apparatus',
  'judgeNo',
  'judgeType',
  'isActive',
  'createdAt',
  'updatedAt',
].join(' ');

// The person behind an assignment, as shown on a panel card or in the admin's
// assignment search. No phone, no photo, no credentials.
const JUDGE_ACCOUNT_CARD_FIELDS = [
  '_id',
  'firstName',
  'lastName',
  'email',
  'stateUnit',
  'certificationLevel',
].join(' ');

/**
 * A person's display name, composed from the two stored halves.
 *
 * People are stored as `firstName` + `lastName` — one field could not be split
 * back apart reliably, and the registration forms ask for both. Everything that
 * DISPLAYS a person still wants one string, so composition happens once, here,
 * at the response boundary.
 *
 * @param {Object|null} doc
 * @returns {string}
 */
const fullName = (doc) =>
  [doc?.firstName, doc?.lastName].filter(Boolean).join(' ').trim();

/**
 * Flatten a populated `judgeAccount` onto the assignment.
 *
 * Every judge-facing consumer reads `judge.name` — the panel-size lookup in
 * useJudgePanelData, the admin judge list, the dashboard's "minimum judges"
 * gate. Rather than change all of them to reach into a nested object, the
 * populated account's display fields are copied up, and the account object is
 * kept alongside for callers that need the id.
 *
 * @param {Object} judge - Assignment document with `judgeAccount` populated
 * @returns {Object}
 */
const flattenJudgeAccount = (judge) => {
  if (!judge) return judge;
  const account = judge.judgeAccount;
  if (!account || typeof account !== 'object') {
    return { ...judge, name: '', email: null };
  }
  return {
    ...judge,
    judgeAccount: account._id,
    account,
    firstName: account.firstName || '',
    lastName: account.lastName || '',
    name: fullName(account),
    email: account.email || null,
  };
};

// Coach shown on a submitted-team card. Only the display name is consumed
// (JudgeDashboard.jsx:309,426 and AdminScores.jsx:318,401) — `name` is not a
// stored field any more, it is composed by projectFields below, which is why
// the FIELD_LIST names it and the select does not.
const SUBMITTED_TEAM_COACH_FIELDS = ['_id', 'firstName', 'lastName', 'isActive'].join(' ');

// Athlete shown on a submitted-team card. Deliberately omits `email`,
// `dateOfBirth`, `password` and the reset-token pair: these rosters include
// minors. Consumers only read _id/firstName/lastName/gender
// (JudgeTeamPlayers.jsx:251-258, ScorerScoring.jsx:218-222,
// JudgeDashboard.jsx:221).
const SUBMITTED_TEAM_PLAYER_FIELDS = [
  '_id',
  'firstName',
  'lastName',
  'gender',
  'ageGroup',
  'isActive',
  'stateUnit',
  'registrationNumber',
].join(' ');

const SUBMITTED_TEAM_PLAYER_FIELD_LIST = SUBMITTED_TEAM_PLAYER_FIELDS.split(' ');
// `name` is derived, not selected — see projectFields.
const SUBMITTED_TEAM_COACH_FIELD_LIST = [...SUBMITTED_TEAM_COACH_FIELDS.split(' '), 'name'];

/**
 * Reduce a populated document (Mongoose doc or plain object) to an allow-listed
 * set of fields.
 *
 * Note: `.toObject()` does NOT run a schema `toJSON` transform, so this is the
 * only thing standing between a populated coach/player and the wire when the
 * populate projection is bypassed or a document arrives pre-hydrated.
 *
 * @param {Object|null|undefined} doc - Populated document or plain object
 * @param {string[]} allowedFields - Field names to keep
 * @returns {Object|null|undefined} Projected plain object
 */
function projectFields(doc, allowedFields) {
  if (!doc || typeof doc !== 'object') {
    return doc;
  }

  // An unpopulated ref is a bare ObjectId — carry it through untouched.
  if (doc._bsontype || Buffer.isBuffer(doc)) {
    return doc;
  }

  const source = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const projected = {};

  for (const field of allowedFields) {
    // `name` is composed, not stored: people are `firstName` + `lastName` now,
    // while roughly twenty consumers across both stacks render `coach.name`.
    // Composing it here — the one place every coach card passes through —
    // keeps all of them working without twenty edits that could each go wrong.
    if (field === 'name' && source.name === undefined) {
      const composed = fullName(source);
      if (composed) projected.name = composed;
      continue;
    }
    if (source[field] !== undefined) {
      projected[field] = source[field];
    }
  }

  return projected;
}

/**
 * Fields that must never reach a client, whatever a query happened to select.
 *
 * The schema `toJSON` transforms are NOT a safety net: BaseRepository queries
 * use `.lean()`, so results are plain objects the transform never sees, and
 * `.toObject()` does not run a toJSON transform either. Login deliberately
 * re-selects `password`, `loginAttempts` and `lockUntil`, so the response has
 * to be stripped explicitly.
 */
const SENSITIVE_USER_FIELDS = [
  'password',
  'resetPasswordToken',
  'resetPasswordExpires',
  'loginAttempts',
  'lockUntil',
];

/**
 * Remove every sensitive field from a user object destined for a response.
 * @param {Object} userObject
 * @returns {Object} a copy without the sensitive fields
 */
function stripSensitiveFields(userObject) {
  const safe = { ...userObject };
  for (const field of SENSITIVE_USER_FIELDS) {
    delete safe[field];
  }
  return safe;
}

/**
 * Drop the per-slip `breakdown` from a playerScores row.
 *
 * `judgeSlips[].breakdown` holds the A/B/C element counts and the combination
 * checklist state — everything needed to re-open a slip for EDIT and restore
 * the exact selections. Only the judge who owns the slip does that.
 *
 * Every other reader wants the section totals, which live alongside it as
 * `difficultyScore` / `combinationScore` / `executionScore` / `bonusScore`. So
 * the read endpoints ship the totals and drop the selections. Measured on a
 * 1000-team fixture it is 43% of a playerScores row, and those rows are 87% of
 * the public results payload.
 *
 * The slips themselves are kept: the public results page renders one column per
 * judge from them.
 *
 * @param {Object} playerScore
 * @returns {Object}
 */
function stripSlipBreakdowns(playerScore) {
  const row = typeof playerScore?.toObject === 'function' ? playerScore.toObject() : playerScore;
  if (!row || !Array.isArray(row.judgeSlips) || row.judgeSlips.length === 0) return row;

  return {
    ...row,
    judgeSlips: row.judgeSlips.map(({ breakdown, ...slip }) => slip),
  };
}

module.exports = {
  JUDGE_PUBLIC_FIELDS,
  JUDGE_ACCOUNT_CARD_FIELDS,
  flattenJudgeAccount,
  fullName,
  stripSlipBreakdowns,
  SENSITIVE_USER_FIELDS,
  stripSensitiveFields,
  SUBMITTED_TEAM_COACH_FIELDS,
  SUBMITTED_TEAM_PLAYER_FIELDS,
  SUBMITTED_TEAM_COACH_FIELD_LIST,
  SUBMITTED_TEAM_PLAYER_FIELD_LIST,
  projectFields,
};
