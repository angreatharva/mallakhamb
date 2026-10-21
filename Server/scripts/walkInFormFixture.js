/**
 * Writes the walk-in form (one form for every competition) — its page layouts
 * as JSON and, with --pdf, the printed PDF — for the OCR self-test
 * (ocr/mkwi_ocr/selftest.py). Reads no database.
 *
 *   node scripts/walkInFormFixture.js <out-dir> [--pdf]
 */
const fs = require('fs');
const path = require('path');
const { buildFormLayout } = require('../src/utils/walk-in/form-layout.util');
const { renderFormPdf } = require('../src/services/walk-in/form-pdf.service');

async function main() {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: node scripts/walkInFormFixture.js <out-dir> [--pdf]');
    process.exit(2);
  }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'layout.json'), JSON.stringify(buildFormLayout(), null, 2));
  if (process.argv.includes('--pdf')) {
    fs.writeFileSync(path.join(out, 'form.pdf'), await renderFormPdf());
  }
  console.log(`wrote ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
