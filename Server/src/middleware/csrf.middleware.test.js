/**
 * Tests for CSRF Protection Middleware
 * Requirements: 17.3
 */

const {
  csrfTokenHandler,
  createCsrfMiddleware,
  generateCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
} = require('./csrf.middleware');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(overrides = {}) {
  return {
    method: 'POST',
    headers: {},
    cookies: {},
    ...overrides
  };
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    _cookies: {},
    _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    cookie(name, value, opts) { this._cookies[name] = { value, opts }; return this; },
    setHeader(name, value) { this._headers[name] = value; return this; }
  };
  return res;
}

// ---------------------------------------------------------------------------
// generateCsrfToken
// ---------------------------------------------------------------------------

describe('generateCsrfToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateCsrfToken();
    expect(typeof token).toBe('string');
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('generates unique tokens on each call', () => {
    const t1 = generateCsrfToken();
    const t2 = generateCsrfToken();
    expect(t1).not.toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// csrfTokenHandler
// ---------------------------------------------------------------------------

describe('csrfTokenHandler', () => {
  it('sets a csrf-token cookie and returns the token in the body', () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();

    csrfTokenHandler(req, res);

    expect(res._body.success).toBe(true);
    expect(typeof res._body.csrfToken).toBe('string');
    expect(res._body.csrfToken).toHaveLength(64);
    expect(res._cookies[CSRF_COOKIE_NAME]).toBeDefined();
    expect(res._cookies[CSRF_COOKIE_NAME].value).toBe(res._body.csrfToken);
  });

  it('sets the cookie with httpOnly=false so JS can read it', () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();

    csrfTokenHandler(req, res);

    expect(res._cookies[CSRF_COOKIE_NAME].opts.httpOnly).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createCsrfMiddleware
// ---------------------------------------------------------------------------

describe('createCsrfMiddleware', () => {
  const middleware = createCsrfMiddleware();

  it('allows safe methods (GET) without a token', () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(200);
  });

  it('allows safe methods (HEAD, OPTIONS) without a token', () => {
    ['HEAD', 'OPTIONS'].forEach(method => {
      const req = makeReq({ method });
      const res = makeRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  it('skips CSRF check for Bearer-token authenticated requests', () => {
    const req = makeReq({
      method: 'POST',
      headers: { authorization: 'Bearer some.jwt.token' }
    });
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when both cookie and header are missing', () => {
    const req = makeReq({ method: 'POST', cookies: {}, headers: {} });
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._body.error.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('returns 403 when cookie is present but header is missing', () => {
    const token = generateCsrfToken();
    const req = makeReq({
      method: 'DELETE',
      cookies: { [CSRF_COOKIE_NAME]: token },
      headers: {}
    });
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._body.error.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('returns 403 when header is present but cookie is missing', () => {
    const token = generateCsrfToken();
    const req = makeReq({
      method: 'PUT',
      cookies: {},
      headers: { [CSRF_HEADER_NAME]: token }
    });
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  it('returns 403 when cookie and header tokens do not match', () => {
    const req = makeReq({
      method: 'PATCH',
      cookies: { [CSRF_COOKIE_NAME]: generateCsrfToken() },
      headers: { [CSRF_HEADER_NAME]: generateCsrfToken() }
    });
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._body.error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('calls next when cookie and header tokens match', () => {
    const token = generateCsrfToken();
    const req = makeReq({
      method: 'POST',
      cookies: { [CSRF_COOKIE_NAME]: token },
      headers: { [CSRF_HEADER_NAME]: token }
    });
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(200);
  });

  it('calls next for DELETE when tokens match', () => {
    const token = generateCsrfToken();
    const req = makeReq({
      method: 'DELETE',
      cookies: { [CSRF_COOKIE_NAME]: token },
      headers: { [CSRF_HEADER_NAME]: token }
    });
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  describe('skipBearerAuth=false option', () => {
    const strictMiddleware = createCsrfMiddleware({ skipBearerAuth: false });

    it('enforces CSRF even for Bearer-token requests when skipBearerAuth=false', () => {
      const req = makeReq({
        method: 'POST',
        headers: { authorization: 'Bearer some.jwt.token' },
        cookies: {}
      });
      const res = makeRes();
      const next = jest.fn();

      strictMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(403);
    });
  });
});
