/**
 * The API's side of the OCR sidecar (ocr/).
 *
 * The sidecar reads ONE page at a time — on a 1-core VM, two at once would
 * only make both slower and take CPU from live scoring. So this process lets
 * one request through, keeps at most MAX_WAITING more in line, and answers
 * every request beyond that with 503 OCR_BUSY, which the desk turns into
 * "busy, try again in a moment". The queue is per API process; on OCI there
 * is one process per VM and one active VM, so it is the whole queue.
 *
 * No OCR_URL configured means OCR is OFF, not broken: `enabled` is false and
 * the desk offers manual entry only.
 *
 * @module services/walk-in/ocr.client
 */

const BaseError = require('../../errors/base.error');

const MAX_WAITING = 3;

class OcrUnavailableError extends BaseError {
  constructor(message, code = 'OCR_UNAVAILABLE') {
    super(message, 503, code);
  }
}

class OcrClient {
  /**
   * @param {{config: Object, logger: Object, fetchImpl?: Function}} deps
   */
  constructor({ config, logger, fetchImpl = globalThis.fetch }) {
    const ocr = config?.get?.('ocr') || {};
    this.url = String(ocr.url || '').replace(/\/+$/, '');
    this.token = ocr.token || '';
    this.timeoutMs = Number(ocr.timeoutMs) || 60000;
    this.logger = logger;
    this.fetch = fetchImpl;
    this.running = false;
    this.waiting = [];
  }

  get enabled() {
    return Boolean(this.url);
  }

  _headers(extra = {}) {
    return {
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...extra,
    };
  }

  /**
   * Is the sidecar answering? Never throws.
   * @returns {Promise<{enabled: boolean, healthy: boolean, detail?: Object}>}
   */
  async health() {
    if (!this.enabled) return { enabled: false, healthy: false };
    try {
      const res = await this.fetch(`${this.url}/health`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(5000),
      });
      const detail = await res.json().catch(() => ({}));
      return { enabled: true, healthy: res.ok && detail?.status === 'ok', detail };
    } catch (error) {
      return { enabled: true, healthy: false, detail: { error: error.message } };
    }
  }

  async _slot() {
    if (!this.running) {
      this.running = true;
      return;
    }
    if (this.waiting.length >= MAX_WAITING) {
      throw new OcrUnavailableError('The form reader is busy. Try again in a moment.', 'OCR_BUSY');
    }
    await new Promise((resolve) => this.waiting.push(resolve));
  }

  _release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.running = false;
  }

  /**
   * Read one photographed page.
   *
   * @param {Buffer} image - JPEG/PNG bytes
   * @param {Object[]} pages - every page layout of the meet's form
   *   (utils/walk-in/form-layout#buildFormLayout().pages); the sidecar finds
   *   which one it is looking at from the QR code
   * @param {{pageHint?: number}} [options] - the page the admin said it was,
   *   used only when the QR code cannot be read
   * @returns {Promise<Object>} the sidecar's reading
   */
  async readPage(image, pages, { pageHint } = {}) {
    if (!this.enabled) {
      throw new OcrUnavailableError('The form reader is not set up on this server. Enter the form by hand.');
    }
    await this._slot();
    const started = Date.now();
    try {
      const res = await this.fetch(`${this.url}/v1/read`, {
        method: 'POST',
        headers: this._headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ image: image.toString('base64'), pages, pageHint: pageHint || null }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429 || res.status === 503) {
        throw new OcrUnavailableError('The form reader is busy. Try again in a moment.', 'OCR_BUSY');
      }
      if (!res.ok) {
        // 422 from the sidecar is a reading problem (no markers, wrong form):
        // pass its words through, they tell the admin what to re-take.
        const message = body?.error || `The form reader answered ${res.status}`;
        if (res.status === 422) {
          const err = new BaseError(message, 422, 'OCR_UNREADABLE', { reason: body?.reason });
          throw err;
        }
        throw new OcrUnavailableError(message);
      }
      this.logger?.info?.('OCR page read', { ms: Date.now() - started, page: body?.page, rows: body?.rows?.length });
      return body;
    } catch (error) {
      if (error instanceof BaseError) throw error;
      this.logger?.warn?.('OCR request failed', { error: error.message });
      throw new OcrUnavailableError('The form reader could not be reached. Enter the form by hand, or try again.');
    } finally {
      this._release();
    }
  }
}

module.exports = OcrClient;
module.exports.OcrUnavailableError = OcrUnavailableError;
module.exports.MAX_WAITING = MAX_WAITING;
