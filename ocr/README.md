# OCR sidecar — walk-in registration forms

Reads a phone photo of the printed walk-in form (Admin → Walk-in desk → Print
form) and returns each row's names, date of birth and apparatus ticks, with a
confidence per field and a small image of each row for the review screen.

- **Engine:** PaddleOCR PP-OCRv5 *mobile*, English recognition only, run with
  ONNX Runtime (no PaddlePaddle). There is no detection model: the form's
  layout says where every box is.
- **Alphabet restriction:** name boxes may only read `A–Z`, space, `-`, `'`;
  date boxes only `0–9`.
- **Date boxes:** people write each digit over the box's left divider, so a
  box is never cut at its own edges. The printed lines (found near where the
  layout puts them) are erased, and each box gets every stroke whose centre is
  in it, plus the line ink that stroke runs along; the crop is padded to 1.5:1
  so it is not stretched. A box's confidence is its digit's share of the ten
  digit scores. On the first real filled forms (2026-10-23) this took exact
  dates from 0/26 to 26/26.
- **Geometry is not stored here.** The API sends the layout of every page of
  the meet's form with each photo (`Server/src/utils/walk-in/form-layout.util.js`),
  so the reader can never disagree with what was printed.
- **One page at a time.** A request that waits more than
  `OCR_QUEUE_WAIT_SECONDS` (20) gets 503; the API keeps its own queue of 3 and
  tells the desk to retry.
- **Nothing is stored.** Photos live only in memory for the length of a request.

## Run locally

```bash
python -m venv ocr/.venv
ocr/.venv/Scripts/python -m pip install -r ocr/requirements.txt   # Linux/macOS: ocr/.venv/bin/python
bash ocr/scripts/fetch-models.sh
cd ocr && .venv/Scripts/python -m mkwi_ocr.server                 # 127.0.0.1:8090
```

Then set `OCR_URL=http://127.0.0.1:8090` in `Server/.env`.

## Self-test

```bash
node Server/scripts/walkInFormFixture.js /tmp/mkwi          # writes layout.json (and form.pdf with --pdf)
cd ocr && .venv/Scripts/python -m mkwi_ocr.selftest --layout /tmp/mkwi/layout.json            # in-process
cd ocr && .venv/Scripts/python -m mkwi_ocr.selftest --layout /tmp/mkwi/layout.json --url http://127.0.0.1:8090
```

It draws a filled page from the layout, tilts/shades/compresses it like a phone
photo, reads it, and exits 1 if any planted name, date or tick reads back wrong.
The deploy health check and the nightly run (O14) use the `--url` form.

## Form photos for the e2e chain

`Server/tests/fixtures/walk-in/desk-<n>-page-<p>.jpg` are eleven pages (five coaches) of the REAL
printed form with invented players printed into the boxes, which the chain's
`walkin` step sends through the whole desk (`Server/scripts/seedWalkIn.js`).
They are rendered, not photographed, so they reproduce byte for byte:

```bash
ocr/.venv/Scripts/python -m pip install pymupdf      # dev machine only; not in requirements.txt
npm --prefix Server run walkin:fixtures              # forms.json -> the three JPEGs
```

Re-render (and commit) after changing the form's geometry; a version mismatch
fails the step and `tests/unit/scripts/seed-plan-coverage.test.js`.

## Environment

| Variable | Default | |
|---|---|---|
| `OCR_HOST` | `127.0.0.1` | Never `0.0.0.0` on OCI — the public address goes through Caddy |
| `OCR_PORT` | `8090` | |
| `OCR_TOKEN` | *(empty)* | When set, `POST /v1/read` needs `Authorization: Bearer …` (`/health` and `/metrics` stay open; the public Caddy site forwards only `/health` and `/v1/read`). Required behind the public `ocr-…sslip.io` address Render uses |
| `OCR_MODEL_DIR` | `ocr/models/en_PP-OCRv5_mobile_rec` | On OCI: `/opt/mallakhamb/ocr-models/en_PP-OCRv5_mobile_rec` |
| `OCR_THREADS` | `1` | ONNX Runtime intra-op threads |
| `OCR_QUEUE_WAIT_SECONDS` | `20` | |

## Endpoints

- `GET /health` — `{"status":"ok","model":…,"busy":…}`, no auth.
- `GET /metrics` — Prometheus: `mkwi_ocr_pages_total{outcome}`, `mkwi_ocr_page_seconds`, `mkwi_ocr_queue_waiting`, `mkwi_ocr_up`.
- `POST /v1/read` — `{"image": base64, "pages": [...], "pageHint": n|null}` →
  `{"page", "pages", "qr": {"text"}, "rows": [{"section", "rowNo", "empty", "fields": {name: {"text","confidence","ink"}}, "ticks": [...], "crop"}], "seconds"}`.
  422 `{"error","reason"}` when the photo cannot be read (no corner squares, no QR and no page hint).
