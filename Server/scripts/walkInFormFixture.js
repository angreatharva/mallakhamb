/**
 * Writes the walk-in form for a synthetic meet — its page layouts as JSON and,
 * with --pdf, the printed PDF — for the OCR self-test (ocr/mkwi_ocr/selftest.py).
 * Reads no database.
 *
 *   node scripts/walkInFormFixture.js <out-dir> [--pdf]
 */
const fs = require('fs');
const path = require('path');
const { buildFormLayout } = require('../src/utils/walk-in/form-layout.util');
const { renderFormPdf } = require('../src/services/walk-in/form-pdf.service');

const FIXTURE_MEET = {
  _id: '000000000000000000000001',
  name: 'OCR Self-Test Meet',
  place: 'Fixture',
  year: 2026,
  startDate: new Date('2026-12-10T00:00:00Z'),
  maxTeamSize: 6,
  competitionTypes: ['competition_1'],
  apparatusConfig: { competition_1: ['Pole Mallakhamb', 'Rope Mallakhamb', 'Hanging Mallakhamb'] },
  ageGroups: [
    { gender: 'Male', ageGroup: 'Under12' },
    { gender: 'Male', ageGroup: 'Under14' },
    { gender: 'Female', ageGroup: 'Under12' },
    { gender: 'Female', ageGroup: 'Above16' },
  ],
};

async function main() {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: node scripts/walkInFormFixture.js <out-dir> [--pdf]');
    process.exit(2);
  }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'layout.json'), JSON.stringify(buildFormLayout(FIXTURE_MEET), null, 2));
  if (process.argv.includes('--pdf')) {
    fs.writeFileSync(path.join(out, 'form.pdf'), await renderFormPdf(FIXTURE_MEET));
  }
  console.log(`wrote ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
