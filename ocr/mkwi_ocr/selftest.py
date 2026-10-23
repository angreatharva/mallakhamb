"""Fill a form page synthetically, photograph it badly, and read it back.

Used three ways:
  - by developers:            python -m mkwi_ocr.selftest --layout layout.json
  - by the deploy health check and the nightly O14 run, against the live
    sidecar over HTTP:        python -m mkwi_ocr.selftest --layout layout.json --url http://127.0.0.1:8090
  - with --save, to write the synthetic photo for a look.

The layout comes from the API side (`node Server/scripts/walkInFormFixture.js`),
so this tests the reader against exactly the geometry the PDF prints.

Exit 0 when every planted value reads back, 1 otherwise.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.request

import cv2
import numpy as np

from .reader import PX_PER_MM, read_page

PLANTED = [
    {"firstName": "AARAV", "lastName": "PATIL", "dobDay": "14", "dobMonth": "03", "dobYear": "2015", "ticks": [0]},
    {"firstName": "VEDANT", "lastName": "KULKARNI", "dobDay": "02", "dobMonth": "11", "dobYear": "2014", "ticks": [0, 1]},
    {"firstName": "SAI", "lastName": "MORE", "dobDay": "30", "dobMonth": "07", "dobYear": "2016", "ticks": [1]},
    # Digits written over each box's left divider, as people do: a reader that cuts
    # boxes at their edges reads this 2018 as 2213 (real forms, 2026-10-23).
    {"firstName": "ISHAAN", "lastName": "SHAH", "dobDay": "26", "dobMonth": "08", "dobYear": "2018", "ticks": [0], "onLine": True},
]


def _px(v: float) -> int:
    return int(round(v * PX_PER_MM))


def draw_page(layout: dict) -> np.ndarray:
    w, h = _px(layout["size"]["width"]), _px(layout["size"]["height"])
    page = np.full((h, w, 3), 255, np.uint8)
    for m in layout["markers"]:
        cv2.rectangle(page, (_px(m["x"]), _px(m["y"])), (_px(m["x"] + m["size"]), _px(m["y"] + m["size"])), (0, 0, 0), -1)
    qr = cv2.QRCodeEncoder.create().encode(layout["qrText"])
    q = layout["qr"]
    side = _px(q["size"])
    qr_img = cv2.resize(qr, (side, side), interpolation=cv2.INTER_NEAREST)
    page[_px(q["y"]):_px(q["y"]) + side, _px(q["x"]):_px(q["x"]) + side] = cv2.cvtColor(qr_img, cv2.COLOR_GRAY2BGR)

    for section in layout["sections"]:
        cv2.putText(page, section["title"], (_px(12), _px(section["top"] + 5)), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (20, 20, 20), 2)
        for row in section["rows"]:
            cells = row.get("cells") or {}
            boxes = [r for n, r in row["fields"].items() if n not in cells] + [c for cs in cells.values() for c in cs]
            for rect in boxes + row["ticks"]:
                cv2.rectangle(page, (_px(rect["x"]), _px(rect["y"])), (_px(rect["x"] + rect["w"]), _px(rect["y"] + rect["h"])), (140, 140, 140), 2)
    return page


def fill(page: np.ndarray, layout: dict) -> list[dict]:
    """Write PLANTED into the page's first rows, as a person would."""
    rows = [(section, row) for section in layout["sections"] for row in section["rows"]]
    expected = []
    rng = np.random.default_rng(7)
    for values, (section, row) in zip(PLANTED, rows):
        cells = row.get("cells") or {}
        for name, rect in row["fields"].items():
            text = values[name]
            if name in cells:  # one digit per box, as the form asks
                for ch, cell in zip(text, cells[name]):
                    cx = _px(cell["x"]) + (-2 if values.get("onLine") else 9) + int(rng.integers(0, 4))
                    cy = _px(cell["y"] + cell["h"]) - 14 + int(rng.integers(-3, 3))
                    cv2.putText(page, ch, (cx, cy), cv2.FONT_HERSHEY_DUPLEX, 1.25, (60, 30, 10), 3, cv2.LINE_AA)
                continue
            x = _px(rect["x"]) + 12 + int(rng.integers(0, 10))
            y = _px(rect["y"] + rect["h"]) - 14 + int(rng.integers(-3, 3))
            cv2.putText(page, text, (x, y), cv2.FONT_HERSHEY_DUPLEX, 1.35, (60, 30, 10), 3, cv2.LINE_AA)
        for i in values["ticks"]:
            if i < len(row["ticks"]):
                t = row["ticks"][i]
                a = (_px(t["x"]) + 10, _px(t["y"] + t["h"] / 2))
                b = (_px(t["x"] + t["w"] / 2), _px(t["y"] + t["h"]) - 10)
                c = (_px(t["x"] + t["w"]) - 6, _px(t["y"]) + 8)
                cv2.line(page, a, b, (60, 30, 10), 5)
                cv2.line(page, b, c, (60, 30, 10), 5)
        expected.append({"section": section["key"], "rowNo": row["rowNo"], **values,
                         "apparatus": [row["ticks"][i]["apparatus"] for i in values["ticks"] if i < len(row["ticks"])]})
    return expected


def photograph(page: np.ndarray) -> bytes:
    """Tilt, shrink, shade and compress — roughly what a phone does."""
    h, w = page.shape[:2]
    canvas_w, canvas_h = int(w * 1.15), int(h * 1.12)
    src = np.float32([[0, 0], [w, 0], [0, h], [w, h]])
    dst = np.float32([[canvas_w * 0.07, canvas_h * 0.05], [canvas_w * 0.93, canvas_h * 0.03],
                      [canvas_w * 0.04, canvas_h * 0.96], [canvas_w * 0.95, canvas_h * 0.94]])
    matrix = cv2.getPerspectiveTransform(src, dst)
    photo = cv2.warpPerspective(page, matrix, (canvas_w, canvas_h), borderValue=(90, 95, 100))
    shade = np.tile(np.linspace(1.0, 0.8, canvas_w, dtype=np.float32), (canvas_h, 1))[..., None]
    photo = np.clip(photo.astype(np.float32) * shade, 0, 255).astype(np.uint8)
    photo = cv2.GaussianBlur(photo, (3, 3), 0)
    photo = cv2.resize(photo, (int(canvas_w * 0.75), int(canvas_h * 0.75)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", photo, [cv2.IMWRITE_JPEG_QUALITY, 80])
    assert ok
    return buf.tobytes()


def compare(result: dict, expected: list[dict]) -> list[str]:
    problems = []
    rows = {(r["section"], r["rowNo"]): r for r in result.get("rows", [])}
    for exp in expected:
        got = rows.get((exp["section"], exp["rowNo"]))
        if not got or got.get("empty"):
            problems.append(f"row {exp['rowNo']}: not found")
            continue
        for name in ("firstName", "lastName", "dobDay", "dobMonth", "dobYear"):
            text = got["fields"][name]["text"]
            if text.lstrip("0") != exp[name].lstrip("0"):
                problems.append(f"row {exp['rowNo']} {name}: read {text!r}, wrote {exp[name]!r}")
        ticked = [t["apparatus"] for t in got["ticks"] if t["checked"]]
        if ticked != exp["apparatus"]:
            problems.append(f"row {exp['rowNo']} ticks: read {ticked}, ticked {exp['apparatus']}")
    blank = [r for r in result.get("rows", []) if (r["section"], r["rowNo"]) not in {(e["section"], e["rowNo"]) for e in expected} and not r["empty"]]
    if blank:
        problems.append(f"{len(blank)} blank row(s) read as filled")
    return problems


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--layout", required=True, help="JSON from Server/scripts/walkInFormFixture.js")
    ap.add_argument("--url", help="read through a running sidecar instead of in-process")
    ap.add_argument("--token", default=os.environ.get("OCR_TOKEN", ""))
    ap.add_argument("--model-dir", default=os.environ.get("OCR_MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "models", "en_PP-OCRv5_mobile_rec")))
    ap.add_argument("--save", help="write the synthetic photo here")
    args = ap.parse_args(argv)

    with open(args.layout, encoding="utf-8") as fh:
        layout = json.load(fh)
    pages = layout["pages"]
    page = draw_page(pages[0])
    expected = fill(page, pages[0])
    photo = photograph(page)
    if args.save:
        with open(args.save, "wb") as fh:
            fh.write(photo)

    if args.url:
        body = json.dumps({"image": base64.b64encode(photo).decode(), "pages": pages}).encode()
        req = urllib.request.Request(args.url.rstrip("/") + "/v1/read", data=body, method="POST",
                                     headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {args.token}"} if args.token else {})})
        with urllib.request.urlopen(req, timeout=120) as res:
            result = json.load(res)
    else:
        from .recognizer import Recognizer
        result = read_page(photo, pages, Recognizer(args.model_dir))

    problems = compare(result, expected)
    seconds = result.get("seconds")
    if problems:
        print("OCR self-test FAILED" + (f" ({seconds}s)" if seconds else ""))
        for p in problems:
            print("  -", p)
        return 1
    print(f"OCR self-test passed: {len(expected)} rows read correctly" + (f" in {seconds}s" if seconds else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
