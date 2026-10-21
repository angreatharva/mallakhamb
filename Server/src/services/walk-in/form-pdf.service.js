/**
 * Prints the walk-in registration form for one meet as an A4 PDF.
 *
 * Every coordinate comes from utils/walk-in/form-layout — this file only
 * decides how things LOOK. Two rules matter to the OCR and must survive any
 * restyling:
 *
 *   - the four corner markers are solid black and nothing else on the page is
 *     a large solid dark square;
 *   - the write-in boxes are thin and mid-grey, so the reader can tell the
 *     printed box from the ink inside it.
 *
 * @module services/walk-in/form-pdf.service
 */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const {
  APPARATUS_SHORT,
  COLUMNS,
  SECTION_TITLE_H,
  buildFormLayout,
} = require('../../utils/walk-in/form-layout.util');

const MM = 72 / 25.4;
const pt = (mm) => mm * MM;

const BOX_GREY = '#8a8a8a';
const TEXT_DARK = '#111111';

function drawQr(doc, text, { x, y, size }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;
  const quiet = 2;
  const cell = size / (count + quiet * 2);
  doc.save().fillColor('#000000');
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (qr.modules.get(r, c)) {
        doc.rect(pt(x + (c + quiet) * cell), pt(y + (r + quiet) * cell), pt(cell) + 0.05, pt(cell) + 0.05).fill();
      }
    }
  }
  doc.restore();
}

function box(doc, { x, y, w, h }) {
  doc.save().lineWidth(0.6).strokeColor(BOX_GREY).rect(pt(x), pt(y), pt(w), pt(h)).stroke().restore();
}

function text(doc, value, x, y, { size = 8, bold = false, width, align = 'left', color = TEXT_DARK } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color)
    .text(value, pt(x), pt(y), { width: width ? pt(width) : undefined, align, lineBreak: false });
}

function drawHeader(doc, page) {
  text(doc, 'MALLAKHAMB - WALK-IN REGISTRATION FORM', 22, 10, { size: 12, bold: true });
  text(doc, `Page ${page.page} of ${page.pages}  -  fill in only the sections you need; blank pages need not be handed in`, 22, 16.5, { size: 7.5, width: 140 });
  // The same form serves every meet: the coach writes it in, the desk chooses it.
  text(doc, 'Competition: ____________________________________________________', 22, 22, { size: 8 });
  text(doc, 'Team: ____________________________   Coach: ____________________________', 22, 28, { size: 8 });
  const note = { size: 7, color: '#333333' };
  text(doc, 'Names in CAPITAL LETTERS (A-Z) only. Date of birth: ONE DIGIT PER BOX, e.g. 0 7 | 0 3 | 2 0 1 5.', 22, 35, note);
  text(doc, 'Tick each apparatus the player will perform.', 22, 39, note);
  text(doc, 'Do not fold or write over the black squares or the code.', 22, 43, { size: 7, color: '#333333' });
}

function drawSection(doc, section) {
  text(doc, section.title, 12, section.top + 1, { size: 9.5, bold: true });

  const head = section.headY;
  const headText = (value, col) => text(doc, value, COLUMNS[col].x, head + 0.8, { size: 6.5, bold: true, width: COLUMNS[col].w, align: 'center' });
  headText('#', 'rowNo');
  headText('FIRST NAME', 'firstName');
  headText('LAST NAME (SURNAME)', 'lastName');
  headText('DD', 'dobDay');
  headText('MM', 'dobMonth');
  headText('YYYY', 'dobYear');

  section.rows[0]?.ticks.forEach((tick) => {
    text(doc, APPARATUS_SHORT[tick.apparatus] || tick.apparatus, tick.x - 1, head + 0.8, { size: 5.5, bold: true, width: tick.w + 2, align: 'center' });
  });

  for (const row of section.rows) {
    text(doc, String(row.rowNo), COLUMNS.rowNo.x, row.fields.firstName.y + 1.6, { size: 9, bold: true, width: COLUMNS.rowNo.w, align: 'center' });
    box(doc, row.fields.firstName);
    box(doc, row.fields.lastName);
    Object.values(row.cells).flat().forEach((cell) => box(doc, cell));
    row.ticks.forEach((tick) => box(doc, tick));
  }

  // A hairline under the title keeps sections visually apart on a busy page.
  doc.save().lineWidth(0.4).strokeColor('#bbbbbb')
    .moveTo(pt(12), pt(section.top + SECTION_TITLE_H - 0.5)).lineTo(pt(198), pt(section.top + SECTION_TITLE_H - 0.5)).stroke().restore();
}

/**
 * The one walk-in form, the same for every competition.
 * @returns {Promise<Buffer>} the PDF
 */
function renderFormPdf() {
  const layout = buildFormLayout();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, info: {
      Title: 'Mallakhamb walk-in registration form',
      Creator: 'Mallakhamb competition platform',
    } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (const page of layout.pages) {
      doc.addPage({ size: 'A4', margin: 0 });
      page.markers.forEach((m) => doc.save().fillColor('#000000').rect(pt(m.x), pt(m.y), pt(m.size), pt(m.size)).fill().restore());
      drawQr(doc, page.qrText, page.qr);
      drawHeader(doc, page);
      page.sections.forEach((section) => drawSection(doc, section));
      text(doc, `${page.version}`, 22, 284, { size: 6, color: '#777777' });
    }
    doc.end();
  });
}

module.exports = { renderFormPdf };
