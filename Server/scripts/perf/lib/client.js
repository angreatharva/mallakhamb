/**
 * An HTTP client that behaves like the SPA does.
 *
 * The API's auth is not "send a bearer token": it is a cookie jar, a
 * double-submit CSRF token read out of a RESPONSE BODY, and a competition
 * context that may live in the token, a header, the body or the query. A test
 * that skips any of those tests something the browser never does. So this
 * carries all four, once, and both the functional harness and the benchmark use
 * it — otherwise the two would measure different code paths.
 *
 * One jar per instance, so several roles can be signed in at the same time
 * without trampling each other's session.
 *
 * @module scripts/perf/lib/client
 */

// 127.0.0.1 rather than localhost: on Windows, Node's fetch resolves localhost
// to ::1 while the API listens on IPv4, and the only symptom is "fetch failed".
const DEFAULT_BASE = process.env.PERF_API_URL || 'http://127.0.0.1:5000';

class ApiClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseUrl]
   * @param {string} [options.label] - which role this jar belongs to, for errors
   */
  constructor({ baseUrl = DEFAULT_BASE, label = 'anonymous' } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.label = label;
    this.jar = new Map();
    this.csrfToken = null;
    this.bearer = null;
    this.competitionId = null;
    /** Every call, for the benchmark to time and the harness to report. */
    this.calls = [];
  }

  get cookieHeader() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** @param {Response} response */
  rememberCookies(response) {
    for (const raw of response.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) {
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        // An expired cookie is a logout; keeping it would make the next call
        // look authenticated when it is not.
        if (value === '' || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(raw)) this.jar.delete(name);
        else this.jar.set(name, value);
      }
    }
  }

  /**
   * Fetch a CSRF token, if we do not already hold one.
   *
   * The token is read from the BODY rather than the cookie because the SPA is a
   * different origin from the API and cannot read the cookie — mirroring that
   * here is what makes this exercise the real path.
   */
  async ensureCsrf() {
    if (this.csrfToken) return this.csrfToken;
    const { body } = await this.request('GET', '/api/csrf-token', { skipCsrf: true });
    this.csrfToken = body?.csrfToken || body?.data?.csrfToken || null;
    return this.csrfToken;
  }

  /**
   * One request.
   *
   * @param {string} method
   * @param {string} path - starting with `/api`
   * @param {Object} [options]
   * @param {Object} [options.body]
   * @param {Object} [options.query]
   * @param {Object} [options.headers]
   * @param {boolean} [options.skipCsrf]
   * @param {boolean} [options.withCompetition=true] - send X-Competition-Id
   * @returns {Promise<{status: number, body: any, ms: number, ok: boolean}>}
   */
  async request(method, path, options = {}) {
    const {
      body, query, headers = {}, skipCsrf = false, withCompetition = true,
    } = options;

    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    }

    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (isWrite && !skipCsrf && !this.bearer) await this.ensureCsrf();

    const finalHeaders = {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(this.cookieHeader ? { Cookie: this.cookieHeader } : {}),
      ...(this.bearer ? { Authorization: `Bearer ${this.bearer}` } : {}),
      ...(isWrite && this.csrfToken ? { 'X-CSRF-Token': this.csrfToken } : {}),
      ...(withCompetition && this.competitionId ? { 'X-Competition-Id': this.competitionId } : {}),
      ...headers,
    };

    const started = process.hrtime.bigint();
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      // A bare "fetch failed" says nothing about which call died.
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const result = {
        status: 0, ok: false, ms,
        body: { error: { message: error.cause?.code || error.message } },
      };
      this.calls.push({ method, path, ...result });
      return result;
    }
    const ms = Number(process.hrtime.bigint() - started) / 1e6;

    this.rememberCookies(response);

    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }

    // A rotated access token arrives as a header on any authenticated response.
    const rotated = response.headers.get('x-new-token');
    if (rotated && this.bearer) this.bearer = rotated;

    const result = { status: response.status, ok: response.ok, body: parsed, ms };
    this.calls.push({ method, path, status: result.status, ms });
    return result;
  }

  get(path, options) { return this.request('GET', path, options); }
  post(path, body, options) { return this.request('POST', path, { ...options, body }); }
  put(path, body, options) { return this.request('PUT', path, { ...options, body }); }
  patch(path, body, options) { return this.request('PATCH', path, { ...options, body }); }
  del(path, options) { return this.request('DELETE', path, options); }

  /**
   * Sign in and keep the session.
   *
   * Both halves are kept: the cookies the browser would use, and the body's
   * token copy as a Bearer fallback for the routes where a cookie-only write
   * would need CSRF the caller has not fetched yet.
   *
   * @param {string} path - e.g. '/api/coaches/login'
   * @param {{email: string, password: string}} credentials
   * @returns {Promise<{ok: boolean, status: number, body: any}>}
   */
  async login(path, credentials) {
    const response = await this.post(path, credentials, { skipCsrf: false });
    const token = response.body?.data?.token || response.body?.token;
    if (token) this.bearer = token;
    return response;
  }

  /** Drop the session without touching the server. */
  reset() {
    this.jar.clear();
    this.bearer = null;
    this.csrfToken = null;
    this.competitionId = null;
  }
}

module.exports = { ApiClient, DEFAULT_BASE };
