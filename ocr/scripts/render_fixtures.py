"""Render filled walk-in form pages as photos, for the e2e chain's walk-in step.

    python ocr/scripts/render_fixtures.py --pdf form.pdf --layout layout.json \
        --forms Server/tests/fixtures/walk-in/forms.json --out Server/tests/fixtures/walk-in

Driven by `npm --prefix Server run walkin:fixtures`, which prints the real form PDF
and its layout first. Writes every desk's pages named in forms.json as JPEGs.

A developer tool, not part of the sidecar: it needs PyMuPDF (`pip install pymupdf`)
on top of ocr/requirements.txt, and the VMs never run it -- they read the committed
images. Deterministic: the same PDF and the same forms.json give the same pixels.

The values are PRINTED into the real PDF (Helvetica, dark blue), not drawn over a
picture of it, so the boxes, markers and QR are exactly what the desk prints: one
digit centred in each date box, names in capitals, a tick in each apparatus box.
The page is then rasterised and tilted a little, as a phone held over a desk sees it.
"""

from __future__ import annotations

import argparse
import json
import os

import cv2
import pymupdf as fitz
import numpy as np

MM = 72 / 25.4
INK = (0.08, 0.14, 0.45)
DPI = 200


def pt(mm: float) -> float:
    return mm * MM


def centred(page, text: str, rect: dict, size: float) -> None:
    width = fitz.get_text_length(text, fontname="helv", fontsize=size)
    x = pt(rect["x"]) + (pt(rect["w"]) - width) / 2
    y = pt(rect["y"] + rect["h"]) - pt(1.9)
    page.insert_text((x, y), text, fontname="helv", fontsize=size, color=INK)


def write_row(page, row_layout: dict, values: dict) -> None:
    fields, cells = row_layout["fields"], row_layout["cells"]
    for name in ("firstName", "lastName"):
        box = fields[name]
        page.insert_text((pt(box["x"] + 2), pt(box["y"] + box["h"]) - pt(1.9)), values[name],
                         fontname="helv", fontsize=13, color=INK)
    year, month, day = values["dateOfBirth"].split("-")
    for name, digits in (("dobDay", day), ("dobMonth", month), ("dobYear", year)):
        for ch, cell in zip(digits, cells[name]):
            centred(page, ch, cell, 13)
    for tick in row_layout["ticks"]:
        if tick["apparatus"] not in values["apparatus"]:
            continue
        x, y, w, h = (pt(tick[k]) for k in ("x", "y", "w", "h"))
        shape = page.new_shape()
        shape.draw_polyline([(x + w * 0.18, y + h * 0.55), (x + w * 0.42, y + h * 0.82), (x + w * 0.86, y + h * 0.16)])
        shape.finish(color=INK, width=1.6, closePath=False, lineCap=1, lineJoin=1)
        shape.commit()


def photograph(png: bytes, seed: int) -> bytes:
    """A slight tilt and keystone, uneven light, a little blur and JPEG -- fixed per page."""
    page = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)
    h, w = page.shape[:2]
    rng = np.random.default_rng(seed)
    cw, ch = int(w * 1.08), int(h * 1.06)
    jitter = lambda s: float(rng.uniform(-s, s))  # noqa: E731
    src = np.float32([[0, 0], [w, 0], [0, h], [w, h]])
    dst = np.float32([
        [cw * (0.04 + jitter(0.01)), ch * (0.03 + jitter(0.008))],
        [cw * (0.96 + jitter(0.01)), ch * (0.02 + jitter(0.008))],
        [cw * (0.03 + jitter(0.01)), ch * (0.97 + jitter(0.008))],
        [cw * (0.97 + jitter(0.01)), ch * (0.96 + jitter(0.008))],
    ])
    photo = cv2.warpPerspective(page, cv2.getPerspectiveTransform(src, dst), (cw, ch), borderValue=(96, 100, 104))
    shade = np.tile(np.linspace(1.0, 0.86, cw, dtype=np.float32), (ch, 1))[..., None]
    photo = np.clip(photo.astype(np.float32) * shade, 0, 255).astype(np.uint8)
    photo = cv2.GaussianBlur(photo, (3, 3), 0)
    ok, buf = cv2.imencode(".jpg", photo, [cv2.IMWRITE_JPEG_QUALITY, 82])
    assert ok
    return buf.tobytes()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--layout", required=True)
    ap.add_argument("--forms", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)

    with open(args.layout, encoding="utf-8") as fh:
        layout = json.load(fh)
    with open(args.forms, encoding="utf-8") as fh:
        forms = json.load(fh)
    if forms["formVersion"] != layout["version"]:
        raise SystemExit(f"forms.json is for {forms['formVersion']}, the form is {layout['version']}: update forms.json")

    specs = [spec for desk in forms["desks"] for spec in desk["pages"]]
    for index, spec in enumerate(specs):
        # A fresh copy of the printed form for every page, so one desk's
        # writing never shows through on another desk's sheet.
        doc = fitz.open(args.pdf)
        page_layout = next(p for p in layout["pages"] if p["page"] == spec["page"])
        rows = {(s["key"], r["rowNo"]): r for s in page_layout["sections"] for r in s["rows"]}
        page = doc[spec["page"] - 1]
        for values in spec["rows"]:
            row_layout = rows.get((values["section"], values["rowNo"]))
            if row_layout is None:
                raise SystemExit(f"page {spec['page']} has no row {values['section']} #{values['rowNo']}")
            write_row(page, row_layout, values)
        png = page.get_pixmap(dpi=DPI, alpha=False).tobytes("png")
        doc.close()
        target = os.path.join(args.out, spec["file"])
        with open(target, "wb") as fh:
            fh.write(photograph(png, seed=index + 1))
        print(f"wrote {target} ({os.path.getsize(target) // 1024} KB, {len(spec['rows'])} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
