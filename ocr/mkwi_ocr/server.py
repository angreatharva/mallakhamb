"""HTTP front of the OCR sidecar. Standard library only.

  GET  /health   {"status": "ok", "model": ...}  (no auth: carries nothing private)
  GET  /metrics  Prometheus text: pages, seconds, queue, failures
  POST /v1/read  {"image": base64, "pages": [layout...], "pageHint": n|null}

ONE page is read at a time. A request that cannot get the reader within
QUEUE_WAIT_SECONDS gets 503 and the API tells the desk to try again; the API
itself also keeps its own short queue (Server/src/services/walk-in/ocr.client).

When OCR_TOKEN is set every request except /health must carry
`Authorization: Bearer <token>` — required for the public address Render uses,
harmless on 127.0.0.1.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import json
import logging
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .reader import Unreadable, read_page

LOG = logging.getLogger("mkwi_ocr")
MAX_BODY = 12 * 1024 * 1024
QUEUE_WAIT_SECONDS = float(os.environ.get("OCR_QUEUE_WAIT_SECONDS", "20"))


class Metrics:
    def __init__(self):
        self.lock = threading.Lock()
        self.pages = {"ok": 0, "unreadable": 0, "error": 0, "busy": 0}
        self.seconds_sum = 0.0
        self.seconds_count = 0
        self.waiting = 0
        self.buckets = [1, 2, 5, 10, 20, 40, 60]
        self.bucket_counts = [0] * len(self.buckets)

    def observe(self, seconds: float):
        with self.lock:
            self.seconds_sum += seconds
            self.seconds_count += 1
            for i, b in enumerate(self.buckets):
                if seconds <= b:
                    self.bucket_counts[i] += 1

    def render(self) -> str:
        with self.lock:
            lines = [
                "# HELP mkwi_ocr_pages_total Pages handled, by outcome.",
                "# TYPE mkwi_ocr_pages_total counter",
                *[f'mkwi_ocr_pages_total{{outcome="{k}"}} {v}' for k, v in self.pages.items()],
                "# HELP mkwi_ocr_page_seconds Seconds to read one page.",
                "# TYPE mkwi_ocr_page_seconds histogram",
                *[f'mkwi_ocr_page_seconds_bucket{{le="{b}"}} {c}' for b, c in zip(self.buckets, self.bucket_counts)],
                f'mkwi_ocr_page_seconds_bucket{{le="+Inf"}} {self.seconds_count}',
                f"mkwi_ocr_page_seconds_sum {self.seconds_sum:.3f}",
                f"mkwi_ocr_page_seconds_count {self.seconds_count}",
                "# HELP mkwi_ocr_queue_waiting Requests waiting for the reader.",
                "# TYPE mkwi_ocr_queue_waiting gauge",
                f"mkwi_ocr_queue_waiting {self.waiting}",
                "# HELP mkwi_ocr_up The reader has its model loaded.",
                "# TYPE mkwi_ocr_up gauge",
                "mkwi_ocr_up 1",
            ]
        return "\n".join(lines) + "\n"


def make_handler(recognizer, model_name: str, token: str, metrics: Metrics, reader_lock: threading.Lock):
    class Handler(BaseHTTPRequestHandler):
        server_version = "mkwi-ocr/1"

        def log_message(self, fmt, *args):  # route through logging, never print request bodies
            LOG.info("%s %s", self.address_string(), fmt % args)

        def _send(self, status: int, payload: dict | str, content_type: str = "application/json"):
            body = payload.encode() if isinstance(payload, str) else json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _authorised(self) -> bool:
            if not token:
                return True
            given = self.headers.get("Authorization", "")
            return hmac.compare_digest(given.encode(), f"Bearer {token}".encode())

        def do_GET(self):
            if self.path == "/health":
                return self._send(200, {"status": "ok", "model": model_name, "busy": reader_lock.locked()})
            if not self._authorised():
                return self._send(401, {"error": "unauthorised"})
            if self.path == "/metrics":
                return self._send(200, metrics.render(), "text/plain; version=0.0.4")
            return self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/v1/read":
                return self._send(404, {"error": "not found"})
            if not self._authorised():
                return self._send(401, {"error": "unauthorised"})
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY:
                return self._send(413, {"error": "body missing or too large"})
            try:
                request = json.loads(self.rfile.read(length))
                image = base64.b64decode(request["image"], validate=True)
                pages = request["pages"]
            except (ValueError, KeyError, TypeError, binascii.Error):
                return self._send(400, {"error": "expected JSON with image (base64) and pages"})

            with metrics.lock:
                metrics.waiting += 1
            got = reader_lock.acquire(timeout=QUEUE_WAIT_SECONDS)
            with metrics.lock:
                metrics.waiting -= 1
            if not got:
                with metrics.lock:
                    metrics.pages["busy"] += 1
                return self._send(503, {"error": "busy"})
            started = time.monotonic()
            try:
                result = read_page(image, pages, recognizer, request.get("pageHint"))
                result["seconds"] = round(time.monotonic() - started, 2)
                metrics.observe(result["seconds"])
                with metrics.lock:
                    metrics.pages["ok"] += 1
                return self._send(200, result)
            except Unreadable as exc:
                with metrics.lock:
                    metrics.pages["unreadable"] += 1
                return self._send(422, {"error": str(exc), "reason": exc.reason})
            except Exception:  # noqa: BLE001 — answer, log, keep serving
                LOG.exception("page read failed")
                with metrics.lock:
                    metrics.pages["error"] += 1
                return self._send(500, {"error": "the reader failed on this photo"})
            finally:
                reader_lock.release()

    return Handler


def main():
    from .recognizer import Recognizer

    logging.basicConfig(level=os.environ.get("OCR_LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")
    model_dir = os.environ.get("OCR_MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "models", "en_PP-OCRv5_mobile_rec"))
    host = os.environ.get("OCR_HOST", "127.0.0.1")
    port = int(os.environ.get("OCR_PORT", "8090"))
    token = os.environ.get("OCR_TOKEN", "")
    threads = int(os.environ.get("OCR_THREADS", "1"))

    recognizer = Recognizer(model_dir, threads=threads)
    handler = make_handler(recognizer, os.path.basename(os.path.normpath(model_dir)), token, Metrics(), threading.Lock())
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    LOG.info("mkwi-ocr listening on %s:%s (auth %s)", host, port, "on" if token else "off")
    server.serve_forever()


if __name__ == "__main__":
    main()
