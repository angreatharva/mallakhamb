/**
 * Walk-in registration form — the ONE description of where everything sits.
 *
 * The printed PDF (services/walk-in/form-pdf.service) draws from this, and the
 * API sends the very same page layout to the OCR sidecar with every photo
 * (ocr/), so the reader never carries a copy of the geometry that could drift
 * from what was printed. Change a number here and both ends move together;
 * bump FORM_VERSION when you do, so a form printed before the change is refused
 * by its QR code instead of being read against the wrong boxes.
 *
 * Units are millimetres on an A4 portrait page, origin top-left.
 *
 * Page anatomy:
 *   - four solid square MARKERS in the corners: the OCR finds them, and maps
 *     their centres onto MARKER_CENTRES to undo the camera's perspective;
 *   - a QR code naming the version, the meet and the page;
 *   - up to SECTIONS_PER_PAGE sections, one per gender + age group the meet
 *     runs, each with one row per squad place (the meet's team size, 6 when
 *     unset — COP 1.9).
 *
 * A row is: number · FIRST NAME box · LAST NAME box · DD · MM · YYYY · one tick
 * box per apparatus the meet offers that gender.
 *
 * @module utils/walk-in/form-layout
 */

const { AGE_GROUPS_BY_GENDER, AGE_GROUP_RANGES, ageCutoffYear } = require('../../config/cop-rules');
const { offeredApparatus } = require('../data/competition-apparatus.util');
const { effectiveTeamSize } = require('../scoring/team-championship.util');

const FORM_VERSION = 'MKWI1';

const PAGE = Object.freeze({ width: 210, height: 297 });

/** Marker squares: top-left corner and size. */
const MARKER_SIZE = 10;
const MARKERS = Object.freeze([
  Object.freeze({ id: 'tl', x: 8, y: 8, size: MARKER_SIZE }),
  Object.freeze({ id: 'tr', x: 192, y: 8, size: MARKER_SIZE }),
  Object.freeze({ id: 'bl', x: 8, y: 279, size: MARKER_SIZE }),
  Object.freeze({ id: 'br', x: 192, y: 279, size: MARKER_SIZE }),
]);

const QR = Object.freeze({ x: 166, y: 20, size: 24 });

const SECTION_TOP = 48;
const SECTION_GAP = 4;
const SECTION_TITLE_H = 7;
const COLUMN_HEAD_H = 5;
const ROW_H = 10;
const FIELD_INSET_Y = 1.5;
const SECTIONS_PER_PAGE_MAX = 3;
/** Nothing may print below this line: the bottom markers start at 279. */
const CONTENT_BOTTOM = 276;

/** Column x positions and widths. */
const COLUMNS = Object.freeze({
  rowNo: Object.freeze({ x: 12, w: 6 }),
  firstName: Object.freeze({ x: 19, w: 54 }),
  lastName: Object.freeze({ x: 75, w: 54 }),
  dobDay: Object.freeze({ x: 131, w: 9 }),
  dobMonth: Object.freeze({ x: 142, w: 9 }),
  dobYear: Object.freeze({ x: 153, w: 17 }),
});
const TICK_X0 = 173;
const TICK_STEP = 8;
const TICK_SIZE = 6;

/** Short column heads for the tick boxes. */
const APPARATUS_SHORT = Object.freeze({
  'Pole Mallakhamb': 'POLE',
  'Rope Mallakhamb': 'ROPE',
  'Hanging Mallakhamb': 'HANG',
});

const GENDER_WORD = Object.freeze({ Male: 'BOYS', Female: 'GIRLS' });

const ageGroupLabel = (group) => group.replace(/^(Under|Above)(\d+)$/, (_, kind, n) => `${kind.toUpperCase()} ${n}`);

/**
 * "Born 2015 or later" — printed under each section title so the coach can
 * see where a child belongs without doing the COP arithmetic.
 */
function birthYearHint(ageGroup, cutoffYear) {
  const range = AGE_GROUP_RANGES[ageGroup];
  if (!range || !cutoffYear) return '';
  if (Number.isFinite(range.max) && range.min === 0) return `born ${cutoffYear - range.max} or later`;
  return `born ${cutoffYear - range.min} or earlier`;
}

/**
 * The meet's sections in print order: boys before girls, youngest first, only
 * the pairs the meet actually runs (and that the gender plays at all).
 */
function formSections(competition) {
  const configured = (competition?.ageGroups || []).map((entry) => `${entry.gender}:${entry.ageGroup}`);
  const runs = (gender, group) => configured.length === 0 || configured.includes(`${gender}:${group}`);
  const types = competition?.competitionTypes?.length ? competition.competitionTypes : ['competition_1'];
  const cutoffYear = ageCutoffYear(competition);

  const sections = [];
  for (const gender of ['Male', 'Female']) {
    const apparatus = [...new Set(types.flatMap((type) => offeredApparatus(competition, type, gender)))]
      .sort((a, b) => Object.keys(APPARATUS_SHORT).indexOf(a) - Object.keys(APPARATUS_SHORT).indexOf(b));
    for (const ageGroup of AGE_GROUPS_BY_GENDER[gender]) {
      if (!runs(gender, ageGroup)) continue;
      sections.push({
        key: `${gender}:${ageGroup}`,
        gender,
        ageGroup,
        title: `${GENDER_WORD[gender]} - ${ageGroupLabel(ageGroup)}`,
        hint: birthYearHint(ageGroup, cutoffYear),
        apparatus,
      });
    }
  }
  return sections;
}

function rect(x, y, w, h) {
  return { x, y, w, h };
}

/** One row's boxes, top at `y`. */
function rowLayout(rowNo, y, apparatus) {
  const fy = y + FIELD_INSET_Y;
  const fh = ROW_H - 2 * FIELD_INSET_Y;
  const field = (col) => rect(COLUMNS[col].x, fy, COLUMNS[col].w, fh);
  return {
    rowNo,
    strip: rect(COLUMNS.rowNo.x, y, TICK_X0 + apparatus.length * TICK_STEP - COLUMNS.rowNo.x, ROW_H),
    fields: {
      firstName: field('firstName'),
      lastName: field('lastName'),
      dobDay: field('dobDay'),
      dobMonth: field('dobMonth'),
      dobYear: field('dobYear'),
    },
    ticks: apparatus.map((name, i) => ({
      apparatus: name,
      ...rect(TICK_X0 + i * TICK_STEP, y + (ROW_H - TICK_SIZE) / 2, TICK_SIZE, TICK_SIZE),
    })),
  };
}

function sectionHeight(rows) {
  return SECTION_TITLE_H + COLUMN_HEAD_H + rows * ROW_H;
}

/**
 * The whole form for one meet, page by page.
 *
 * @param {Object} competition - needs _id, ageGroups, competitionTypes,
 *   apparatusByGender/apparatusConfig, maxTeamSize, startDate/ageCutoffYear
 * @returns {{version: string, competitionId: string, rowsPerSection: number,
 *   cutoffYear: number|null, pages: Object[]}}
 */
function buildFormLayout(competition) {
  const competitionId = String(competition?._id || '');
  const rowsPerSection = effectiveTeamSize(competition?.maxTeamSize);
  const height = sectionHeight(rowsPerSection);
  const fit = Math.floor((CONTENT_BOTTOM - SECTION_TOP + SECTION_GAP) / (height + SECTION_GAP));
  const perPage = Math.max(1, Math.min(SECTIONS_PER_PAGE_MAX, fit));

  const sections = formSections(competition);
  const pageCount = Math.max(1, Math.ceil(sections.length / perPage));
  const pages = [];

  for (let p = 0; p < pageCount; p += 1) {
    const onPage = sections.slice(p * perPage, (p + 1) * perPage);
    let y = SECTION_TOP;
    const laidOut = onPage.map((section) => {
      const top = y;
      const headY = top + SECTION_TITLE_H;
      const rowsTop = headY + COLUMN_HEAD_H;
      const rows = Array.from({ length: rowsPerSection }, (_, i) =>
        rowLayout(i + 1, rowsTop + i * ROW_H, section.apparatus));
      y += height + SECTION_GAP;
      return { ...section, top, headY, rows };
    });

    pages.push({
      version: FORM_VERSION,
      competitionId,
      page: p + 1,
      pages: pageCount,
      qrText: qrPayload(competitionId, p + 1, pageCount),
      size: PAGE,
      markers: MARKERS,
      qr: QR,
      sections: laidOut,
    });
  }

  return { version: FORM_VERSION, competitionId, rowsPerSection, cutoffYear: ageCutoffYear(competition), pages };
}

/** What the QR code on a page says. */
function qrPayload(competitionId, page, pages) {
  return `${FORM_VERSION}|${competitionId}|${page}|${pages}`;
}

/**
 * Read a QR payload back. Null for anything that is not one of ours.
 * @param {string} text
 * @returns {{version: string, competitionId: string, page: number, pages: number}|null}
 */
function parseQrPayload(text) {
  const parts = String(text || '').split('|');
  if (parts.length !== 4 || parts[0] !== FORM_VERSION) return null;
  const page = Number(parts[2]);
  const pages = Number(parts[3]);
  if (!Number.isInteger(page) || !Number.isInteger(pages) || page < 1 || page > pages) return null;
  return { version: parts[0], competitionId: parts[1], page, pages };
}

module.exports = {
  FORM_VERSION,
  PAGE,
  MARKERS,
  QR,
  COLUMNS,
  APPARATUS_SHORT,
  ROW_H,
  COLUMN_HEAD_H,
  SECTION_TITLE_H,
  ageGroupLabel,
  birthYearHint,
  formSections,
  buildFormLayout,
  qrPayload,
  parseQrPayload,
};
