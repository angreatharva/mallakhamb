/**
 * Walk-in registration form — the ONE description of where everything sits.
 *
 * There is ONE form for every competition. The meet is chosen at the desk
 * before any page is photographed, so nothing on the paper names it: a club
 * can print a stack once and use it all season. The form therefore carries
 * every age group either gender plays and every apparatus that gender may
 * perform; whatever a particular meet does not run is caught on the review
 * screen ("this competition does not run that age group / apparatus"), where
 * the admin fixes the row.
 *
 * The printed PDF (services/walk-in/form-pdf.service) draws from this, and the
 * API sends the very same page layouts to the OCR sidecar with every photo
 * (ocr/), so the reader never carries a copy of the geometry that could drift
 * from what was printed. Change a number here and both ends move together;
 * bump FORM_VERSION when you do, so a form printed before the change is refused
 * by its QR code instead of being read against the wrong boxes.
 *
 * Units are millimetres on an A4 portrait page, origin top-left.
 *
 * Page anatomy:
 *   - four solid square MARKERS in the corners: the OCR finds them, and maps
 *     their centres onto the marker centres to undo the camera's perspective;
 *   - a QR code naming the form version and the page;
 *   - up to SECTIONS_PER_PAGE sections, one per gender + age group, each with
 *     ROWS_PER_SECTION rows (6 — the COP 1.9 maximum squad).
 *
 * A row is: number · FIRST NAME box · LAST NAME box · D D · M M · Y Y Y Y (one
 * box per digit) · one tick
 * box per apparatus the gender may perform.
 *
 * @module utils/walk-in/form-layout
 */

const { AGE_GROUPS_BY_GENDER, APPARATUS, isApparatusAllowedForGender } = require('../../config/cop-rules');

/** MKWI1 was printed per competition (its QR named the meet); MKWI2 is the one form for all. */
const FORM_VERSION = 'MKWI2';
const QR_PREFIX = 'MKWI';

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
const SECTIONS_PER_PAGE = 3;
const ROWS_PER_SECTION = 6;

/** Column x positions and widths. */
const COLUMNS = Object.freeze({
  rowNo: Object.freeze({ x: 12, w: 6 }),
  firstName: Object.freeze({ x: 19, w: 54 }),
  lastName: Object.freeze({ x: 75, w: 54 }),
  dobDay: Object.freeze({ x: 131, w: 9 }),
  dobMonth: Object.freeze({ x: 142, w: 9 }),
  dobYear: Object.freeze({ x: 153, w: 18 }),
});
/**
 * The date is written one digit per box (DD MM YYYY = 2 + 2 + 4 cells of
 * 4.5 mm), and each box is read on its own: a lone digit cannot be confused
 * with its neighbour, and the box lines are never read as a "1". Names stay
 * one box each — per-letter boxes for 15-letter names do not fit beside the
 * date and apparatus at a size a child can write in, and the reader already
 * reads a line of capitals well.
 */
const DIGIT_W = 4.5;
const DIGIT_CELLS = Object.freeze({ dobDay: 2, dobMonth: 2, dobYear: 4 });
const TICK_X0 = 173;
const TICK_STEP = 8;
const TICK_SIZE = 6;

/** Short column heads for the tick boxes, in print order. */
const APPARATUS_SHORT = Object.freeze({
  'Pole Mallakhamb': 'POLE',
  'Rope Mallakhamb': 'ROPE',
  'Hanging Mallakhamb': 'HANG',
});

const GENDER_WORD = Object.freeze({ Male: 'BOYS', Female: 'GIRLS' });

const ageGroupLabel = (group) => group.replace(/^(Under|Above)(\d+)$/, (_, kind, n) => `${kind.toUpperCase()} ${n}`);

/**
 * Every section of the form, in print order: boys before girls, youngest
 * first, each with the apparatus that gender may perform (no Hanging for girls).
 */
function formSections() {
  const sections = [];
  for (const gender of ['Male', 'Female']) {
    const apparatus = Object.keys(APPARATUS_SHORT)
      .filter((name) => APPARATUS.includes(name) && isApparatusAllowedForGender(name, gender));
    for (const ageGroup of AGE_GROUPS_BY_GENDER[gender]) {
      sections.push({
        key: `${gender}:${ageGroup}`,
        gender,
        ageGroup,
        title: `${GENDER_WORD[gender]} - ${ageGroupLabel(ageGroup)}`,
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
    // One rect per digit box, left to right (see DIGIT_CELLS).
    cells: Object.fromEntries(Object.entries(DIGIT_CELLS).map(([col, count]) => [
      col,
      Array.from({ length: count }, (_, i) => rect(COLUMNS[col].x + i * DIGIT_W, fy, DIGIT_W, fh)),
    ])),
    ticks: apparatus.map((name, i) => ({
      apparatus: name,
      ...rect(TICK_X0 + i * TICK_STEP, y + (ROW_H - TICK_SIZE) / 2, TICK_SIZE, TICK_SIZE),
    })),
  };
}

/** What the QR code on a page says. */
function qrPayload(page, pages) {
  return `${FORM_VERSION}|${page}|${pages}`;
}

let cached = null;

/**
 * The form, page by page. The same for every competition (and so built once).
 *
 * @returns {{version: string, rowsPerSection: number, pages: Object[]}}
 */
function buildFormLayout() {
  if (cached) return cached;
  const height = SECTION_TITLE_H + COLUMN_HEAD_H + ROWS_PER_SECTION * ROW_H;
  const sections = formSections();
  const pageCount = Math.ceil(sections.length / SECTIONS_PER_PAGE);
  const pages = [];

  for (let p = 0; p < pageCount; p += 1) {
    let y = SECTION_TOP;
    const laidOut = sections.slice(p * SECTIONS_PER_PAGE, (p + 1) * SECTIONS_PER_PAGE).map((section) => {
      const top = y;
      const headY = top + SECTION_TITLE_H;
      const rowsTop = headY + COLUMN_HEAD_H;
      const rows = Array.from({ length: ROWS_PER_SECTION }, (_, i) =>
        rowLayout(i + 1, rowsTop + i * ROW_H, section.apparatus));
      y += height + SECTION_GAP;
      return { ...section, top, headY, rows };
    });

    pages.push({
      version: FORM_VERSION,
      page: p + 1,
      pages: pageCount,
      qrText: qrPayload(p + 1, pageCount),
      size: PAGE,
      markers: MARKERS,
      qr: QR,
      sections: laidOut,
    });
  }

  cached = Object.freeze({ version: FORM_VERSION, rowsPerSection: ROWS_PER_SECTION, pages });
  return cached;
}

/**
 * Read a QR payload back. Null for anything that is not one of our forms; a
 * form of another version comes back with `current: false`, so the desk can
 * say "print the new form" instead of misreading it.
 *
 * @param {string} text
 * @returns {{version: string, current: boolean, page: number|null, pages: number|null}|null}
 */
function parseQrPayload(text) {
  const parts = String(text || '').split('|');
  if (!parts[0] || !parts[0].startsWith(QR_PREFIX)) return null;
  if (parts[0] !== FORM_VERSION) return { version: parts[0], current: false, page: null, pages: null };
  const page = Number(parts[1]);
  const pages = Number(parts[2]);
  if (parts.length !== 3 || !Number.isInteger(page) || !Number.isInteger(pages) || page < 1 || page > pages) return null;
  return { version: parts[0], current: true, page, pages };
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
  ROWS_PER_SECTION,
  DIGIT_CELLS,
  ageGroupLabel,
  formSections,
  buildFormLayout,
  qrPayload,
  parseQrPayload,
};
