/**
 * Walk-in Excel: the template the desk hands out, and the reader for a filled one.
 *
 * Reading never creates anything: it returns the coach's details and the
 * player rows, with an error per bad cell. The rows then go into a desk
 * draft and through the same review as a scanned page (D6 of
 * docs/walk-in-desk-v2-plan.md). Passwords are never in the file (D4).
 *
 * @module services/walk-in/excel.service
 */

const ExcelJS = require('exceljs');
const { ValidationError } = require('../../errors');
const { APPARATUS, ageGroupLabel } = require('../../config/cop-rules');
const L = require('../../utils/walk-in/excel-layout.util');

const VERSION_CELL = 'Z1';

/** A cell's value as plain text (or a Date) — formulas give their result, rich text its words. */
function cellText(cell) {
  let v = cell?.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) v = v.result;
    else if (Array.isArray(v.richText)) v = v.richText.map((r) => r.text).join('');
    else if ('text' in v) v = v.text;
    else if ('hyperlink' in v) v = v.hyperlink;
    else v = '';
  }
  if (v instanceof Date) return v;
  return v === null || v === undefined ? '' : String(v).trim();
}

const pad = (n) => String(n).padStart(2, '0');

/** A date cell, or "DD-MM-YYYY" / "DD/MM/YYYY" / "YYYY-MM-DD" text → "YYYY-MM-DD", or null. */
function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Excel stores a date as midnight UTC of that day.
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  const text = String(value || '').trim();
  let m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  let y; let mo; let d;
  if (m) [, d, mo, y] = m.map(Number);
  else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text))) [, y, mo, d] = m.map(Number);
  else return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const YES = new Set(['yes', 'y', '1', 'true', 'x']);
const NO = new Set(['', 'no', 'n', '0', 'false', '-']);

function genderOf(text) {
  const t = String(text || '').trim().toLowerCase();
  if (['male', 'm', 'boy', 'boys'].includes(t)) return 'Male';
  if (['female', 'f', 'girl', 'girls'].includes(t)) return 'Female';
  return null;
}

const tidy = (v) => String(v || '').toUpperCase().replace(/\s+/g, ' ').trim();

class WalkInExcelService {
  /** The blank template, as an .xlsx buffer. */
  async template() {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Mallakhamb India walk-in desk';
    wb.created = new Date();

    const players = wb.addWorksheet(L.SHEETS.players, { views: [{ state: 'frozen', ySplit: 1 }] });
    players.columns = L.PLAYER_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    players.getRow(1).font = { bold: true };
    players.getCell(VERSION_CELL).value = L.TEMPLATE_VERSION;
    players.getColumn('Z').hidden = true;
    const groupList = `"${L.AGE_GROUP_CHOICES.map((g) => ageGroupLabel(g)).join(',')}"`;
    for (let r = 2; r <= L.TEMPLATE_ROWS + 1; r += 1) {
      L.PLAYER_COLUMNS.forEach((c, i) => {
        const cell = players.getRow(r).getCell(i + 1);
        if (c.key === 'dateOfBirth') cell.numFmt = 'dd-mm-yyyy';
        if (c.key === 'gender') cell.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Male,Female"'] };
        if (c.key === 'ageGroup') cell.dataValidation = { type: 'list', allowBlank: true, formulae: [groupList] };
        if (c.apparatus) cell.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
      });
    }

    const coach = wb.addWorksheet(L.SHEETS.coach);
    coach.columns = [{ width: 22 }, { width: 40 }];
    L.COACH_FIELDS.forEach((f, i) => {
      const row = coach.getRow(i + 1);
      row.getCell(1).value = f.label;
      row.getCell(1).font = { bold: true };
      row.getCell(2).border = { bottom: { style: 'thin' } };
    });
    coach.getCell(VERSION_CELL).value = L.TEMPLATE_VERSION;
    coach.getColumn('Z').hidden = true;
    // The Coach sheet comes first in the tab bar: fill it first.
    coach.orderNo = 0;
    players.orderNo = 1;

    const help = wb.addWorksheet(L.SHEETS.readMe);
    help.getColumn(1).width = 110;
    [
      'Mallakhamb walk-in registration - Excel template',
      '',
      'One coach per file. Fill the Coach sheet, then one player per row on the Players sheet.',
      'Names in English letters (A-Z). Capitals are fine; the desk tidies them.',
      'Date of birth as DD-MM-YYYY (for example 05-08-2014).',
      'Gender: Male or Female. Age group may be left empty - the desk picks the youngest group the player fits.',
      'Age is counted on 31 December of the competition year (COP 1.8.3.2). A player may play up, never down.',
      'Apparatus: Yes for each one the player enters.',
      'Do NOT write any password in this file. The coach types passwords at the desk.',
      "Players get no email: each gets a Player ID and starts with the coach's default player password.",
      `At most ${L.MAX_ROWS} players per file.`,
    ].forEach((line, i) => {
      help.getCell(`A${i + 1}`).value = line;
    });
    help.getCell('A1').font = { bold: true, size: 14 };

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * Read a filled template.
   * @param {Buffer} buffer
   * @returns {Promise<{coach: Object, rows: Array, errors: Array}>}
   */
  async parse(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ValidationError('Choose the filled Excel file');
    if (buffer.length > L.MAX_BYTES) throw new ValidationError('The Excel file is larger than 1 MB');
    // .xlsx is a zip ("PK"). An old .xls, a CSV or a password-protected workbook is not.
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new ValidationError('This is not an .xlsx file. Use the Excel template from the desk, and do not protect it with a password.');
    }
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch {
      throw new ValidationError('Could not open this Excel file. Save it as .xlsx and try again.');
    }
    const coachSheet = wb.getWorksheet(L.SHEETS.coach);
    const sheet = wb.getWorksheet(L.SHEETS.players);
    if (!sheet || !coachSheet) throw new ValidationError('This is not the walk-in template: the Coach and Players sheets are missing.');
    if (cellText(sheet.getCell(VERSION_CELL)) !== L.TEMPLATE_VERSION) {
      throw new ValidationError('This is an older or different template. Download the current Excel template and copy the players onto it.');
    }
    const wrong = L.PLAYER_COLUMNS.find((c, i) => cellText(sheet.getRow(1).getCell(i + 1)) !== c.header);
    if (wrong) throw new ValidationError(`The Players sheet's columns were changed ("${wrong.header}" is missing). Use the template as it is.`);

    const coach = {};
    L.COACH_FIELDS.forEach((f, i) => {
      const v = cellText(coachSheet.getRow(i + 1).getCell(2));
      coach[f.key] = v instanceof Date ? '' : String(v || '').trim();
    });
    coach.email = coach.email.toLowerCase();

    const rows = [];
    const errors = [];
    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const raw = Object.fromEntries(L.PLAYER_COLUMNS.map((c, i) => [c.key, cellText(row.getCell(i + 1))]));
      if (Object.values(raw).every((v) => v === '')) continue;
      if (rows.length >= L.MAX_ROWS) throw new ValidationError(`At most ${L.MAX_ROWS} players per file. Split it into two.`);
      const err = (field, message) => errors.push({ excelRow: r, field, message });

      const dob = isoDate(raw.dateOfBirth);
      if (raw.dateOfBirth === '') err('dateOfBirth', 'Date of birth is empty');
      else if (!dob) err('dateOfBirth', `Could not read "${raw.dateOfBirth}" as a date (use DD-MM-YYYY)`);
      const gender = genderOf(raw.gender);
      if (!gender) err('gender', raw.gender ? `"${raw.gender}" is not Male or Female` : 'Gender is empty');
      const group = L.ageGroupFromLabel(raw.ageGroup);
      if (group === undefined) err('ageGroup', `"${raw.ageGroup}" is not an age group`);
      const apparatus = [];
      for (const c of L.PLAYER_COLUMNS.filter((x) => x.apparatus)) {
        const v = String(raw[c.key] || '').trim().toLowerCase();
        if (YES.has(v)) apparatus.push(c.apparatus);
        else if (!NO.has(v)) err('apparatus', `${c.header}: "${raw[c.key]}" - write Yes or No`);
      }
      if (!tidy(raw.firstName)) err('firstName', 'First name is empty');
      if (!tidy(raw.lastName)) err('lastName', 'Last name is empty');

      rows.push({
        excelRow: r,
        firstName: tidy(raw.firstName),
        lastName: tidy(raw.lastName),
        dateOfBirth: dob || '',
        dobRaw: dob || raw.dateOfBirth instanceof Date ? '' : String(raw.dateOfBirth || ''),
        gender,
        ageGroup: group || null,
        apparatus: apparatus.filter((a) => APPARATUS.includes(a)),
      });
    }
    if (rows.length === 0) errors.push({ excelRow: null, field: null, message: 'The Players sheet has no players' });
    return { coach, rows, errors };
  }
}

module.exports = WalkInExcelService;
module.exports.isoDate = isoDate;
module.exports.VERSION_CELL = VERSION_CELL;
