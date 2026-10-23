"""Read one photographed page of the walk-in form.

The page geometry is NOT known here: the API sends the layout of every page of
the meet's form with each request (Server/src/utils/walk-in/form-layout.util),
so what was printed and what is read can never come from two copies.

Pipeline:
  1. find the four solid corner markers and undo the perspective onto a flat
     page at PX_PER_MM;
  2. read the QR code to learn which page this is (turning the page round if
     the photo was taken upside down);
  3. for every row: decide which boxes hold ink, read the ones that do with the
     restricted recogniser, and judge each tick box by how dark it is;
  4. return a small JPEG strip of every non-empty row for the review screen.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass

import cv2
import numpy as np

from .recognizer import DIGIT_CHARS, NAME_CHARS

PX_PER_MM = 10
MAX_INPUT_SIDE = 2600
FIELD_INSET_MM = 0.7
INK_EMPTY = 0.012      # share of dark pixels below which a box is blank
TICK_CHECKED = 0.10    # share of dark pixels above which a tick box is ticked
CROP_WIDTH = 900
DIGIT_REACH_MM = 2.0   # how far past a date field's boxes a written digit may stray
DIGIT_MIN_PX = 20      # smaller ink blobs in a digit box are specks, not strokes
GAP_BRIDGE_PX = 11     # widest erased box line a digit's stroke is re-joined across
DIGIT_ASPECT = 1.5     # a digit crop is whited out to at least this width:height
LINE_SEARCH_MM = 1.0   # how far from its layout position a printed box line is looked for
LINE_HALF_PX = 3       # half the width of the band erased over a box line


class Unreadable(Exception):
    """The photo cannot be read; `reason` is a short machine code, str() is for people."""

    def __init__(self, message: str, reason: str):
        super().__init__(message)
        self.reason = reason


@dataclass
class Marker:
    cx: float
    cy: float
    area: float


def _decode(image_bytes: bytes) -> np.ndarray:
    data = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise Unreadable("That file is not a photo we can open.", "not_an_image")
    h, w = img.shape[:2]
    scale = MAX_INPUT_SIDE / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def _find_markers(gray: np.ndarray) -> list[Marker]:
    """Solid dark squares: four-cornered, nearly square, almost entirely filled."""
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, binary = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    h, w = gray.shape
    min_area = (min(h, w) * 0.02) ** 2
    max_area = (min(h, w) * 0.12) ** 2
    found = []
    for c in contours:
        area = cv2.contourArea(c)
        if not (min_area <= area <= max_area):
            continue
        approx = cv2.approxPolyDP(c, 0.06 * cv2.arcLength(c, True), True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            continue
        x, y, bw, bh = cv2.boundingRect(approx)
        if not 0.6 <= bw / max(bh, 1) <= 1.6:
            continue
        mask = np.zeros_like(binary)
        cv2.drawContours(mask, [c], -1, 255, -1)
        fill = cv2.mean(binary, mask=mask)[0] / 255.0
        if fill < 0.85:
            continue
        m = cv2.moments(c)
        found.append(Marker(m["m10"] / m["m00"], m["m01"] / m["m00"], area))
    return found


def _corner_markers(markers: list[Marker], w: int, h: int) -> list[Marker]:
    """The marker nearest each corner of the photo, in tl, tr, bl, br order."""
    if len(markers) < 4:
        raise Unreadable(
            "Could not find the four black corner squares. Photograph the whole page, flat, with all four corners in view.",
            "markers_not_found",
        )
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    chosen: list[Marker] = []
    for cx, cy in corners:
        best = min((m for m in markers if m not in chosen), key=lambda m: (m.cx - cx) ** 2 + (m.cy - cy) ** 2)
        chosen.append(best)
    # The four must make a sensible quadrilateral: left ones left of right ones, top above bottom.
    tl, tr, bl, br = chosen
    if not (tl.cx < tr.cx and bl.cx < br.cx and tl.cy < bl.cy and tr.cy < br.cy):
        raise Unreadable("The corner squares are not where a page's corners would be. Retake the photo straight on.", "markers_inconsistent")
    return chosen


def _flatten(img: np.ndarray, layout: dict) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    tl, tr, bl, br = _corner_markers(_find_markers(gray), w, h)
    by_id = {m["id"]: m for m in layout["markers"]}
    dst = []
    for key in ("tl", "tr", "bl", "br"):
        m = by_id[key]
        dst.append(((m["x"] + m["size"] / 2) * PX_PER_MM, (m["y"] + m["size"] / 2) * PX_PER_MM))
    src = np.float32([[p.cx, p.cy] for p in (tl, tr, bl, br)])
    matrix = cv2.getPerspectiveTransform(src, np.float32(dst))
    size = (round(layout["size"]["width"] * PX_PER_MM), round(layout["size"]["height"] * PX_PER_MM))
    return cv2.warpPerspective(img, matrix, size, flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255))


def _read_qr(page: np.ndarray, qr: dict) -> str | None:
    detector = cv2.QRCodeDetector()
    pad = 8
    x0 = max(0, round((qr["x"] - pad) * PX_PER_MM))
    y0 = max(0, round((qr["y"] - pad) * PX_PER_MM))
    x1 = round((qr["x"] + qr["size"] + pad) * PX_PER_MM)
    y1 = round((qr["y"] + qr["size"] + pad) * PX_PER_MM)
    for region in (page[y0:y1, x0:x1], page):
        try:
            text, _, _ = detector.detectAndDecode(region)
        except cv2.error:
            text = ""
        if text:
            return text
    return None


def _px(rect: dict, inset_mm: float = 0.0) -> tuple[int, int, int, int]:
    x0 = round((rect["x"] + inset_mm) * PX_PER_MM)
    y0 = round((rect["y"] + inset_mm) * PX_PER_MM)
    x1 = round((rect["x"] + rect["w"] - inset_mm) * PX_PER_MM)
    y1 = round((rect["y"] + rect["h"] - inset_mm) * PX_PER_MM)
    return x0, y0, x1, y1


def _ink(binary: np.ndarray, rect: dict, inset_mm: float) -> float:
    x0, y0, x1, y1 = _px(rect, inset_mm)
    cell = binary[y0:y1, x0:x1]
    return float(np.count_nonzero(cell)) / max(cell.size, 1)


def _text_crop(page: np.ndarray, binary: np.ndarray, rect: dict) -> np.ndarray:
    """The field's interior, tightened round the ink, on a white margin."""
    x0, y0, x1, y1 = _px(rect, FIELD_INSET_MM)
    crop = page[y0:y1, x0:x1]
    ink = binary[y0:y1, x0:x1]
    ys, xs = np.nonzero(ink)
    if len(xs):
        m = 6
        crop = crop[max(0, ys.min() - m): ys.max() + m, max(0, xs.min() - m): xs.max() + m]
    return cv2.copyMakeBorder(crop, 8, 8, 12, 12, cv2.BORDER_CONSTANT, value=(255, 255, 255))


def _box_lines(ink: np.ndarray, cells: list[dict], x0: int, y0: int) -> tuple[np.ndarray, np.ndarray]:
    """Bands over the printed box lines of one date field: (upright, across).

    The layout says where each line is; the flattened photo puts it within a
    pixel or two of that. Each line is found where the ink peaks near its
    expected place (a digit is shorter than the line, so it cannot win), and a
    thin band is laid over it. Guessing lines from their shape instead broke on
    a blurred phone photo, whose lines come out thick and broken.
    """
    upright = np.zeros_like(ink)
    across = np.zeros_like(ink)
    search, half = round(LINE_SEARCH_MM * PX_PER_MM), LINE_HALF_PX
    top = round(cells[0]["y"] * PX_PER_MM) - y0
    bottom = round((cells[0]["y"] + cells[0]["h"]) * PX_PER_MM) - y0
    left = round(cells[0]["x"] * PX_PER_MM) - x0
    right = round((cells[-1]["x"] + cells[-1]["w"]) * PX_PER_MM) - x0
    edges = sorted({round(c["x"] * PX_PER_MM) - x0 for c in cells} | {round((c["x"] + c["w"]) * PX_PER_MM) - x0 for c in cells})
    for x in edges:
        a, b = max(0, x - search), min(ink.shape[1], x + search + 1)
        at = a + int(np.argmax(np.count_nonzero(ink[top:bottom, a:b], axis=0)))
        upright[max(0, top - half):bottom + half + 1, max(0, at - half):at + half + 1] = 255
    for y in (top, bottom):
        a, b = max(0, y - search), min(ink.shape[0], y + search + 1)
        at = a + int(np.argmax(np.count_nonzero(ink[a:b, left:right], axis=1)))
        across[max(0, at - half):at + half + 1, max(0, left - half):right + half + 1] = 255
    return upright, across


def _digit_crops(page: np.ndarray, binary: np.ndarray, cells: list[dict]) -> list[np.ndarray | None]:
    """One crop per digit box, or None where the box is empty.

    People write each digit against the left edge of its box, across the printed
    divider. Cutting every box at its own inset sliced those digits in half (the
    0 of 2018 read as 2 or 7, the 8 as 3), so instead: erase the printed lines,
    then give each box every ink stroke whose centre falls in it — the whole
    stroke, even where it crosses into the next box — on white.
    """
    pad = round(DIGIT_REACH_MM * PX_PER_MM)
    x0 = max(0, round(cells[0]["x"] * PX_PER_MM) - pad)
    y0 = max(0, round(cells[0]["y"] * PX_PER_MM) - pad)
    x1 = round((cells[-1]["x"] + cells[-1]["w"]) * PX_PER_MM) + pad
    y1 = round((cells[0]["y"] + cells[0]["h"]) * PX_PER_MM) + pad
    ink = binary[y0:y1, x0:x1]
    upright, across = _box_lines(ink, cells, x0, y0)
    strokes = cv2.bitwise_and(ink, cv2.bitwise_not(upright | across))
    # Erasing a divider splits a digit written over it, and the left half would go
    # to the wrong box. Bridge a stroke that continues on both sides of an erased
    # line, filling only where that line was.
    bridge = GAP_BRIDGE_PX
    strokes |= cv2.morphologyEx(strokes, cv2.MORPH_CLOSE, np.ones((1, bridge), np.uint8)) & upright
    strokes |= cv2.morphologyEx(strokes, cv2.MORPH_CLOSE, np.ones((bridge, 1), np.uint8)) & across
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(strokes, connectivity=8)
    # A stroke written ALONG a line (the left side of an 8 on the divider) went
    # with the line. Give back the line's ink between the first and last place a
    # digit touches it, so the 8 does not become a 3, nor the 6 a 5.
    line_ink = cv2.bitwise_and(ink, upright | across) > 0
    near = np.ones((5, 5), np.uint8)
    owned: list[np.ndarray | None] = [None for _ in cells]
    for k in range(1, count):
        if stats[k, cv2.CC_STAT_AREA] < DIGIT_MIN_PX:
            continue
        cx, cy = centroids[k][0] + x0, centroids[k][1] + y0
        for i, c in enumerate(cells):
            if c["x"] * PX_PER_MM <= cx < (c["x"] + c["w"]) * PX_PER_MM and \
                    c["y"] * PX_PER_MM <= cy < (c["y"] + c["h"]) * PX_PER_MM:
                piece = labels == k
                contact = (cv2.dilate(piece.astype(np.uint8), near) > 0) & line_ink
                if contact.any():
                    ys, xs = np.nonzero(contact)
                    span = np.zeros_like(piece)
                    span[ys.min():ys.max() + 1, xs.min():xs.max() + 1] = True
                    piece |= span & line_ink
                owned[i] = piece if owned[i] is None else owned[i] | piece
                break
    crops: list[np.ndarray | None] = []
    for mask in owned:
        if mask is None:
            crops.append(None)
            continue
        ys, xs = np.nonzero(mask)
        a, b, c, d = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = page[y0 + a:y0 + b, x0 + c:x0 + d].copy()
        crop[~mask[a:b, c:d]] = 255
        # White out to at least DIGIT_ASPECT:1, so the recogniser's minimum width never
        # stretches the digit sideways (a stretched 6 reads as 5).
        h, w = crop.shape[0] + 28, crop.shape[1]
        side = max(18, (round(DIGIT_ASPECT * h) - w + 1) // 2)
        crops.append(cv2.copyMakeBorder(crop, 14, 14, side, side, cv2.BORDER_CONSTANT, value=(255, 255, 255)))
    return crops


def _binary(page: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(page, cv2.COLOR_BGR2GRAY)
    # Adaptive, so shadow across a phone photo does not read as ink.
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 15)
    return cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))


def _strip_jpeg(page: np.ndarray, rect: dict) -> str:
    x0, y0, x1, y1 = _px(rect)
    strip = page[y0:y1, x0:x1]
    scale = CROP_WIDTH / max(strip.shape[1], 1)
    strip = cv2.resize(strip, (CROP_WIDTH, max(1, round(strip.shape[0] * scale))), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", strip, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii") if ok else ""


FIELD_ALPHABET = {
    "firstName": NAME_CHARS,
    "lastName": NAME_CHARS,
    "dobDay": DIGIT_CHARS,
    "dobMonth": DIGIT_CHARS,
    "dobYear": DIGIT_CHARS,
}


def read_page(image_bytes: bytes, pages: list[dict], recognizer, page_hint: int | None = None) -> dict:
    if not pages:
        raise Unreadable("No form layout was sent.", "no_layout")
    img = _decode(image_bytes)
    reference = pages[0]
    flat = _flatten(img, reference)

    qr_text = _read_qr(flat, reference["qr"])
    if qr_text is None:
        turned = cv2.rotate(flat, cv2.ROTATE_180)
        qr_text = _read_qr(turned, reference["qr"])
        if qr_text is not None:
            flat = turned

    layout = None
    if qr_text:
        layout = next((p for p in pages if p.get("qrText") == qr_text), None)
        if layout is None:
            # Ours, but not one of these pages: the API decides what to say.
            return {"page": None, "qr": {"text": qr_text}, "rows": []}
    elif page_hint:
        layout = next((p for p in pages if p["page"] == int(page_hint)), None)
    if layout is None:
        raise Unreadable("Could not read the code in the top corner. Choose the page number and try again.", "qr_unreadable")

    binary = _binary(flat)
    rows_out = []
    for section in layout["sections"]:
        for row in section["rows"]:
            fields_out = {}
            any_ink = False
            cells = row.get("cells") or {}
            for name, rect in row["fields"].items():
                if name in cells:
                    # One digit per box, read alone: the box line is erased and only
                    # that box's own strokes are read (see _digit_crops).
                    digits, confs, inks = [], [], []
                    for cell, crop in zip(cells[name], _digit_crops(flat, binary, cells[name])):
                        inks.append(_ink(binary, cell, FIELD_INSET_MM))
                        if crop is None or inks[-1] < INK_EMPTY:   # blank stays blank, as before
                            continue
                        reading = recognizer.read_digit(crop)
                        digits.append(reading.text[:1] if reading.text else "?")
                        confs.append(reading.confidence if reading.text else 0.0)
                    if digits:
                        any_ink = True
                    fields_out[name] = {
                        "text": "".join(digits),
                        "confidence": round(min(confs), 3) if confs else 1.0,
                        "ink": round(max(inks), 4) if inks else 0.0,
                    }
                    continue
                ink = _ink(binary, rect, FIELD_INSET_MM)
                if ink < INK_EMPTY:
                    fields_out[name] = {"text": "", "confidence": 1.0, "ink": round(ink, 4)}
                    continue
                any_ink = True
                reading = recognizer.read(_text_crop(flat, binary, rect), FIELD_ALPHABET.get(name, NAME_CHARS))
                fields_out[name] = {"text": reading.text, "confidence": reading.confidence, "ink": round(ink, 4)}
            ticks = []
            for tick in row["ticks"]:
                score = _ink(binary, tick, 0.9)
                checked = score >= TICK_CHECKED
                any_ink = any_ink or checked
                ticks.append({"apparatus": tick["apparatus"], "checked": checked, "score": round(score, 3)})
            entry = {"section": section["key"], "rowNo": row["rowNo"], "empty": not any_ink, "fields": fields_out, "ticks": ticks}
            if any_ink:
                entry["crop"] = _strip_jpeg(flat, row["strip"])
            rows_out.append(entry)

    return {"page": layout["page"], "pages": layout["pages"], "qr": {"text": qr_text}, "rows": rows_out}
