/**
 * Render the e2e walk-in step's paper-form photos from the REAL printed form.
 *
 *   npm --prefix Server run walkin:fixtures
 *   OCR_PYTHON=/path/to/python npm --prefix Server run walkin:fixtures
 *
 * Prints the form (services/walk-in/form-pdf.service) and its page layouts to a
 * temporary folder, then has `ocr/scripts/render_fixtures.py` write the values in
 * tests/fixtures/walk-in/forms.json into its boxes and save each page as a JPEG
 * beside that file. Re-run after any change to the form's geometry, and commit
 * the images. Reads no database.
 *
 * The Python needs the sidecar's packages plus PyMuPDF; by default it is the
 * sidecar's own virtualenv (ocr/.venv).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildFormLayout } = require('../src/utils/walk-in/form-layout.util');
const { renderFormPdf } = require('../src/services/walk-in/form-pdf.service');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, '..', 'tests', 'fixtures', 'walk-in');

function python() {
  if (process.env.OCR_PYTHON) return process.env.OCR_PYTHON;
  const venv = path.join(ROOT, 'ocr', '.venv');
  const candidates = [path.join(venv, 'Scripts', 'python.exe'), path.join(venv, 'bin', 'python')];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`No Python at ${venv} — set OCR_PYTHON (needs opencv, numpy and pymupdf).`);
  return found;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mkwi-fixtures-'));
  try {
    fs.writeFileSync(path.join(tmp, 'layout.json'), JSON.stringify(buildFormLayout(), null, 2));
    fs.writeFileSync(path.join(tmp, 'form.pdf'), await renderFormPdf());
    const result = spawnSync(python(), [
      path.join(ROOT, 'ocr', 'scripts', 'render_fixtures.py'),
      '--pdf', path.join(tmp, 'form.pdf'),
      '--layout', path.join(tmp, 'layout.json'),
      '--forms', path.join(FIXTURES, 'forms.json'),
      '--out', FIXTURES,
    ], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
