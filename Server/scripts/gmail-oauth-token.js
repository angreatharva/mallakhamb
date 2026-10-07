#!/usr/bin/env node
/**
 * Mint the GMAIL_REFRESH_TOKEN for EMAIL_PROVIDER=gmail-api.
 *
 * Run once, on your own machine, signed in as the Gmail account that should
 * send the mail:
 *
 *   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... npm run gmail:token
 *
 * (or put both in Server/.env). It prints a Google consent URL, catches the
 * redirect on a loopback port, exchanges the code, and prints the refresh
 * token to paste into Render as GMAIL_REFRESH_TOKEN. Nothing is written to
 * disk. Setup steps: docs/gmail-api-email.md.
 *
 * The OAuth client must be of type "Desktop app" — that type accepts any
 * http://127.0.0.1:<port> redirect without registering it.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const crypto = require('crypto');

const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (env or Server/.env) first. See docs/gmail-api-email.md.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
// PKCE: the code is useless to anyone who intercepts the redirect without the verifier.
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/') {
    res.writeHead(404).end();
    return;
  }

  const finish = (status, message) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);
    server.close();
  };

  if (url.searchParams.get('state') !== state) {
    finish(400, 'State mismatch — start again.');
    console.error('State mismatch; ignoring this redirect.');
    process.exitCode = 1;
    return;
  }
  const error = url.searchParams.get('error');
  if (error) {
    finish(400, `Google returned: ${error}`);
    console.error(`Consent failed: ${error}`);
    process.exitCode = 1;
    return;
  }

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: url.searchParams.get('code'),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }).toString(),
    });
    const body = await response.json();
    if (!response.ok || !body.refresh_token) {
      throw new Error(body.error_description || body.error || `HTTP ${response.status} (no refresh_token — revoke the app's access at myaccount.google.com/permissions and retry)`);
    }

    // Prove the token works exactly the way the server will use it, so a
    // failure on Render can only mean the value changed on the way there.
    const check = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: body.refresh_token,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!check.ok) {
      const checkBody = await check.json().catch(() => ({}));
      throw new Error(`the new token failed its own test: ${checkBody.error_description || checkBody.error || check.status}`);
    }

    finish(200, 'Done. You can close this tab and return to the terminal.');
    console.log('\nVerified: this token refreshes against this client ID and secret.');
    console.log(`GMAIL_REFRESH_TOKEN — ${body.refresh_token.length} characters, one line, no quotes or spaces.`);
    console.log('Paste into Render → mallakhamb-server → Environment, then check the length there matches:\n');
    console.log(body.refresh_token);
    console.log(`\nIt must be used with client ID ${clientId.slice(0, 12)}… — the same GMAIL_CLIENT_ID as on Render.`);
    console.log('Keep it secret: it can send mail as this Gmail account.');
  } catch (err) {
    finish(500, 'Token exchange failed — see the terminal.');
    console.error(`Token exchange failed: ${err.message}`);
    process.exitCode = 1;
  }
});

let redirectUri;
server.listen(0, '127.0.0.1', () => {
  redirectUri = `http://127.0.0.1:${server.address().port}/`;
  const consent = new URL(AUTH_URL);
  consent.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    // Force the consent screen so Google issues a refresh token every time.
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();

  console.log('Open this URL, sign in as the SENDER Gmail account, and allow "Send email on your behalf":\n');
  console.log(consent.toString());
  console.log('\nWaiting for Google to redirect back…');
});
