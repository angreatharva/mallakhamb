/**
 * The walk-in Excel template: its sheets and columns, in ONE place, so the
 * template the desk hands out and the reader that takes it back can never
 * disagree. Bump TEMPLATE_VERSION when a column changes; an old file is then
 * refused with a clear message instead of being read into the wrong fields.
 *
 * @module utils/walk-in/excel-layout.util
 */

const { APPARATUS, AGE_GROUPS_BY_GENDER, ageGroupLabel } = require('../../config/cop-rules');

const TEMPLATE_VERSION = 'MKXL1';
const MAX_ROWS = 200;
const TEMPLATE_ROWS = 60;
const MAX_BYTES = 1024 * 1024;

const SHEETS = Object.freeze({ coach: 'Coach', players: 'Players', readMe: 'Read me' });

/** Coach sheet: one label per row in column A, the value in column B. */
const COACH_FIELDS = Object.freeze([
  { key: 'firstName', label: 'Coach first name' },
  { key: 'lastName', label: 'Coach last name' },
  { key: 'email', label: 'Coach email' },
  { key: 'phone', label: 'Coach phone' },
  { key: 'teamName', label: 'Team name' },
]);

/** Short apparatus column titles: "Pole", "Hanging", "Rope". */
const apparatusTitle = (a) => a.replace(/ Mallakhamb$/, '');

const PLAYER_COLUMNS = Object.freeze([
  { key: 'firstName', header: 'First name', width: 20 },
  { key: 'lastName', header: 'Last name', width: 20 },
  { key: 'dateOfBirth', header: 'Date of birth (DD-MM-YYYY)', width: 26 },
  { key: 'gender', header: 'Gender (Male / Female)', width: 22 },
  { key: 'ageGroup', header: 'Age group (optional)', width: 20 },
  ...APPARATUS.map((a) => ({ key: `app:${a}`, header: `${apparatusTitle(a)} (Yes / No)`, width: 16, apparatus: a })),
]);

/** Every age group the COP runs, as the template's drop-down shows them. */
const AGE_GROUP_CHOICES = Object.freeze([...new Set([...AGE_GROUPS_BY_GENDER.Male, ...AGE_GROUPS_BY_GENDER.Female])]);

/** "Under 12" / "Under12" / "under 12" → 'Under12'; '' → null; anything else → undefined. */
const ageGroupFromLabel = (text) => {
  const t = String(text || '').replace(/\s+/g, '').toLowerCase();
  if (!t) return null;
  return AGE_GROUP_CHOICES.find((g) => g.toLowerCase() === t || ageGroupLabel(g).replace(/\s+/g, '').toLowerCase() === t);
};

module.exports = {
  TEMPLATE_VERSION,
  MAX_ROWS,
  TEMPLATE_ROWS,
  MAX_BYTES,
  SHEETS,
  COACH_FIELDS,
  PLAYER_COLUMNS,
  AGE_GROUP_CHOICES,
  ageGroupFromLabel,
  apparatusTitle,
};
