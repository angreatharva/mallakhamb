/**
 * Preloaded into the nightly e2e seed chain only (deploy/oci/PLAN.md O14):
 *   NODE_OPTIONS="--require /usr/local/lib/mallakhamb/e2e-forwarded-https.cjs"
 *
 * The e2e API runs with NODE_ENV=production, exactly as the public one does,
 * so it redirects any request without `X-Forwarded-Proto: https` to https://
 * (createApp.js). In front of the public API, Caddy adds that header; the e2e
 * copy listens on 127.0.0.1:5001 with nothing in front of it, so the seed
 * scripts' fetch() calls add it themselves — the same header the deploy health
 * check sends with curl.
 *
 * Only requests to E2E_API_ORIGIN (default http://127.0.0.1:5001) are touched.
 * Never loaded by the API itself or by anything on the public path.
 */
'use strict';

const ORIGIN = process.env.E2E_API_ORIGIN || 'http://127.0.0.1:5001';
const original = globalThis.fetch;

if (typeof original === 'function') {
  globalThis.fetch = function fetchWithForwardedProto(input, init = {}) {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input && input.url;
    if (url && url.startsWith(ORIGIN)) {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('x-forwarded-proto')) headers.set('X-Forwarded-Proto', 'https');
      return original.call(this, input, { ...init, headers });
    }
    return original.call(this, input, init);
  };
}
