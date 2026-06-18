# CSP Nonce Integration

## Overview
As part of Phase 2A security hardening, Content Security Policy (CSP) nonces have been implemented on the backend (`Server/src/middleware/security.middleware.js`). 

In production, the backend removes `'unsafe-inline'` and `'unsafe-eval'` from the `scriptSrc` and instead requires scripts to have a valid `nonce-<value>`.

## Integrating with Vite (Single Page Application)
Because this application is a React Single Page Application (SPA) built with Vite, the `index.html` is typically statically served. However, a static HTML file cannot use a dynamically generated nonce.

### Current Implementation
The backend is currently serving an API, and the frontend is hosted as a static SPA. 
If the static SPA is served by the backend Express server (e.g., via `express.static` and a catch-all route `res.sendFile()`), the backend cannot inject nonces into the static HTML files automatically without an HTML parsing/replacement step or using a template engine (like EJS or Pug).

### Recommended Approach for Serving the SPA from Node.js (Express)
If you decide to serve the React frontend directly from the Node.js backend:

1. Read the `index.html` from the `dist` folder into memory on startup.
2. For every request to a frontend route, inject the generated nonce (from `res.locals.nonce`) into the `<script>` tags in the HTML string before sending it to the client.

```javascript
app.get('*', (req, res) => {
  let html = getCachedIndexHtml(); // Retrieve pre-read HTML
  // Inject the nonce into the script tag(s)
  html = html.replace(/<script /g, `<script nonce="${res.locals.nonce}" `);
  res.send(html);
});
```

### Static Hosting (Vercel, Render static site, Netlify, S3)
If the SPA is hosted completely separately on a static file host (e.g., Vercel, Netlify):
- **Dynamic Nonces are not possible** with pure static hosting.
- **Alternatives**:
  - Use a hash-based CSP instead of nonces (Vite can be configured to generate a list of hashes for all inline scripts during the build process, which can then be added to the CSP headers).
  - Move the CSP headers to the static host's configuration (e.g., `_headers` on Netlify or `vercel.json` on Vercel), but this requires careful management of inline scripts.

### Current Setup Notes
In the `createHelmetMiddleware`, we have enabled nonces for production and allowed `'unsafe-inline'` and `'unsafe-eval'` for development (as Vite's dev server relies heavily on them). If the static assets are served from an external static host, the backend's CSP headers will only apply to the API responses, not the HTML document itself. The HTML document's CSP headers must be configured at the static hosting level.
