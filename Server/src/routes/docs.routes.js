/**
 * Interactive API documentation.
 *
 *   GET /api/docs              Swagger UI
 *   GET /api/docs/openapi.json the raw document
 *
 * Swagger UI is loaded from a CDN rather than vendored through
 * `swagger-ui-express`, because that package pulls ~10MB of assets into every
 * deployment to serve a page that is opened by developers, not by the product.
 * The document itself is built in-process, so "Try it out" is always describing
 * the code that is actually running.
 *
 * OFF unless ENABLE_API_DOCS=true, and never available in production. The
 * document lists every route, every role and every required header — a map of
 * the attack surface, handed out anonymously. That is a fine trade in
 * development and a poor one on the internet.
 *
 * @module routes/docs.routes
 */

const express = require('express');

const { buildOpenApiDocument } = require('../docs/openapi');

/** Pinned rather than floating: `@latest` would let a CDN change break the page. */
const SWAGGER_UI_VERSION = '5.17.14';
const SWAGGER_CDN_ORIGIN = 'https://cdn.jsdelivr.net';
const SWAGGER_CDN = `${SWAGGER_CDN_ORIGIN}/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;

/**
 * @param {string} specUrl - where the page fetches the document from
 * @param {string} nonce - the CSP nonce this request was issued
 * @returns {string}
 */
const swaggerPage = (specUrl, nonce) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Mallakhamb API</title>
    <link rel="stylesheet" href="${SWAGGER_CDN}/swagger-ui.css">
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_CDN}/swagger-ui-bundle.js"></script>
    <script nonce="${nonce}">
      window.ui = SwaggerUIBundle({
        url: '${specUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        docExpansion: 'none',
        filter: true,
        tryItOutEnabled: true,
        persistAuthorization: true,
        // The API is a different origin from any client, and the session lives
        // in cookies, so "Try it out" only works with credentials attached.
        requestInterceptor: (request) => {
          request.credentials = 'include';
          return request;
        },
      });
    </script>
  </body>
</html>`;

/**
 * @param {Object} container - DI container
 * @returns {express.Router}
 */
function createDocsRoutes(container) {
  const router = express.Router();
  const config = container.resolve('config');

  // Built once — the document is derived from static module state, so rebuilding
  // it per request would only re-walk the same objects.
  const document = buildOpenApiDocument({
    serverUrl: process.env.API_PUBLIC_URL || `http://localhost:${config.get('server.port')}`,
  });

  router.get('/openapi.json', (req, res) => {
    res.json(document);
  });

  router.get('/', (req, res) => {
    /**
     * A CSP for THIS PAGE ONLY.
     *
     * The app-wide policy allows scripts and styles from 'self' and Razorpay,
     * which is correct and must not be widened — the API serves the product,
     * and jsdelivr has no business in the product's policy. Overriding the
     * header on this one response lets the documentation page load its viewer
     * without touching the policy every other response carries.
     *
     * Narrower than the app's in the ways that matter: no frame-ancestors, no
     * form-action, and connect-src limited to 'self' so "Try it out" can only
     * talk to this API.
     */
    // ORIGIN, not the versioned prefix: a CSP source expression carrying a path
    // matches that exact URL, so listing `.../swagger-ui-dist@5.17.14` allows
    // precisely nothing — every asset under it is a different path and stays
    // blocked. The version pin lives in the URLs the page requests.
    res.setHeader('Content-Security-Policy', [
      "default-src 'none'",
      `script-src 'self' ${SWAGGER_CDN_ORIGIN} 'unsafe-inline'`,
      `style-src 'self' ${SWAGGER_CDN_ORIGIN} 'unsafe-inline'`,
      `img-src 'self' data: ${SWAGGER_CDN_ORIGIN}`,
      `font-src 'self' data: ${SWAGGER_CDN_ORIGIN}`,
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'none'",
    ].join('; '));

    // Same-origin relative URL, so the page works behind any host or proxy.
    const specUrl = `${req.baseUrl}/openapi.json`;
    // Set by generateNonceMiddleware; kept on the inline script so the page
    // still works if a deployment tightens the policy to require nonces.
    res.type('html').send(swaggerPage(specUrl, res.locals.nonce || ''));
  });

  return router;
}

module.exports = createDocsRoutes;
