"""PP-OCRv5 mobile text recognition through ONNX Runtime, with a restricted alphabet.

The form already tells us where every word is, so there is no detection model:
each field crop goes straight to the recogniser. Its CTC output is decoded
against only the characters that field may hold (A-Z for names, 0-9 for dates),
which is the largest single accuracy gain available on a boxed form.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass

import cv2
import numpy as np

REC_HEIGHT = 48
MIN_WIDTH = 96
MAX_WIDTH = 640

NAME_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ '-"
DIGIT_CHARS = "0123456789"


def load_character_dict(yml_path: str) -> list[str]:
    """Read `character_dict` from the model's inference.yml (a YAML list).

    Parsed by hand: the list is one '- x' item per line and pulling in a YAML
    library for it would be the sidecar's only reason to need one.
    """
    chars: list[str] = []
    inside = False
    with open(yml_path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if re.match(r"^\s*character_dict\s*:", line):
                inside = True
                continue
            if inside:
                m = re.match(r"^\s*-\s?(.*)$", line)
                if not m:
                    if line.strip() == "":
                        continue
                    break
                value = m.group(1)
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                    value = value[1:-1].replace("''", "'")
                chars.append(value if value != "" else " ")
    if not chars:
        raise ValueError(f"no character_dict in {yml_path}")
    return chars


@dataclass
class Reading:
    text: str
    confidence: float


class Recognizer:
    def __init__(self, model_dir: str, threads: int = 1):
        import onnxruntime as ort

        onnx_path = os.path.join(model_dir, "inference.onnx")
        yml_path = os.path.join(model_dir, "inference.yml")
        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        options.log_severity_level = 3  # the exported graph has unused initialisers; ORT warns per node
        self.session = ort.InferenceSession(onnx_path, sess_options=options, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        # Class 0 is the CTC blank, class k+1 is dict[k], and PaddleOCR appends a space last.
        self.classes = ["<blank>"] + load_character_dict(yml_path) + [" "]
        self._masks: dict[str, np.ndarray] = {}
        self._digit_idx = [self.classes.index(d) for d in DIGIT_CHARS]

    def _mask(self, allowed: str) -> np.ndarray:
        if allowed not in self._masks:
            mask = np.zeros(len(self.classes), dtype=bool)
            mask[0] = True
            wanted = set(allowed)
            for i, ch in enumerate(self.classes[1:], start=1):
                if ch in wanted or (ch.upper() in wanted and ch.isalpha()):
                    mask[i] = True
            self._masks[allowed] = mask
        return self._masks[allowed]

    @staticmethod
    def _prepare(crop: np.ndarray) -> np.ndarray:
        if crop.ndim == 2:
            crop = cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR)
        h, w = crop.shape[:2]
        width = int(np.clip(round(w * REC_HEIGHT / max(h, 1)), MIN_WIDTH, MAX_WIDTH))
        resized = cv2.resize(crop, (width, REC_HEIGHT), interpolation=cv2.INTER_LINEAR)
        x = resized.astype(np.float32) / 255.0
        x = (x - 0.5) / 0.5
        return x.transpose(2, 0, 1)[None, ...]

    def _run(self, crop: np.ndarray) -> np.ndarray:
        probs = self.session.run(None, {self.input_name: self._prepare(crop)})[0][0]  # (T, C)
        if probs.shape[-1] != len(self.classes):
            # Defensive: a model/dict mismatch must fail loudly, not read garbage.
            raise RuntimeError(f"model has {probs.shape[-1]} classes, dictionary {len(self.classes)}")
        return probs

    def read_digit(self, crop: np.ndarray) -> Reading:
        """One boxed digit: whichever of 0-9 peaks highest in any frame.

        A box holds exactly one digit, so there is nothing to decode. Confidence
        is that digit's share of all ten peaks — "could this be another digit?".
        A lone digit on white loses probability to the blank class, so its raw
        peak (0.57 for a clear 6, against 0.01 for a 5) would flag every box.
        """
        peaks = self._run(crop)[:, self._digit_idx].max(axis=0)
        best = int(peaks.argmax())
        share = float(peaks[best] / max(float(peaks.sum()), 1e-9))
        return Reading(text=DIGIT_CHARS[best], confidence=round(share, 3))

    def read(self, crop: np.ndarray, allowed: str) -> Reading:
        masked = np.where(self._mask(allowed)[None, :], self._run(crop), 0.0)
        best = masked.argmax(axis=1)
        out, scores, previous = [], [], 0
        for t, idx in enumerate(best):
            if idx != 0 and idx != previous:
                out.append(self.classes[idx].upper())
                scores.append(float(masked[t, idx]))
            previous = idx
        text = re.sub(r"\s+", " ", "".join(out)).strip()
        confidence = float(np.mean(scores)) if scores else 0.0
        return Reading(text=text, confidence=round(confidence, 3))
