# Sending email through the Gmail API

Production sends OTP and notice emails with `EMAIL_PROVIDER=gmail-api`.

## Why not SMTP

Since 26 Sep 2025, Render's free web services block outbound traffic on ports 25, 465 and 587. Gmail SMTP uses 587 and has no other port, so the Nodemailer adapter cannot reach `smtp.gmail.com` from `mallakhamb-server`. Every OTP email failed with a connection timeout.

The Gmail API sends from the same Gmail account over HTTPS on port 443, which Render does not block. Locally, SMTP still works, so `Server/.env` can stay on `nodemailer`.

## One-time setup (about 15 minutes)

1. **Create a Google Cloud project.** At <https://console.cloud.google.com>, create a project, for example `Mallakhamb Mail`.
2. **Enable the API.** Go to APIs & Services, then Library, open **Gmail API** and click **Enable**.
3. **Configure the OAuth consent screen.** It is called *Google Auth Platform* in newer consoles.
   - Choose user type **External**. Set the app name to `Mallakhamb India`, and use your Gmail as both support and developer email.
   - **Publish the app** (Audience, then **Publish app**, status *In production*). This matters: an app left in *Testing* issues refresh tokens that expire after 7 days. Email would silently stop a week later.
   - You do not need Google verification. Only one account (the sender) ever grants access. During consent you will see "Google hasn't verified this app". Click **Advanced**, then **Go to Mallakhamb India**.
4. **Create the OAuth client.** Go to Clients (or Credentials), then **Create client**. The application type must be **Desktop app**. Copy the **client ID** and **client secret**.
5. **Mint the refresh token** on your own machine:

   ```bash
   cd Server
   GMAIL_CLIENT_ID=<id> GMAIL_CLIENT_SECRET=<secret> npm run gmail:token
   ```

   In Windows PowerShell, which doesn't accept the inline `VAR=value` form:

   ```powershell
   cd Server
   $env:GMAIL_CLIENT_ID="<id>"
   $env:GMAIL_CLIENT_SECRET="<secret>"
   npm run gmail:token
   ```

   Putting both values in `Server/.env` also works; the script reads it.

   Open the printed URL and sign in as **the account that should send the mail**, the same address as `EMAIL_USER`. Allow *Send email on your behalf*. The terminal then prints the refresh token. The script writes nothing to disk.
6. **Set these four variables** in the Render dashboard, under mallakhamb-server and then Environment:

   | Key | Value |
   |---|---|
   | `EMAIL_PROVIDER` | `gmail-api` |
   | `GMAIL_CLIENT_ID` | from step 4 |
   | `GMAIL_CLIENT_SECRET` | from step 4 |
   | `GMAIL_REFRESH_TOKEN` | from step 5 |

   Keep `EMAIL_USER` as it is: it is the sender address. `EMAIL_PASS` is unused under `gmail-api`. Saving triggers a redeploy.

   Set all four together. In production, startup validation refuses `gmail-api` if any of them is missing.

## Checking it works

- `GET https://mallakhamb-server.onrender.com/api/health` should show `checks.email.provider: "gmail-api"` with `status: "healthy"`. The check really refreshes a token. Its result is cached for 5 minutes.
- Request a reset code from the site. The email arrives from the `EMAIL_USER` address.

## When it breaks

| Symptom in the logs | Cause and fix |
|---|---|
| `Gmail token refresh failed: invalid_grant` | The refresh token was revoked (password change, or access removed at myaccount.google.com/permissions), or the app was left in Testing. Publish the app, rerun step 5, and update `GMAIL_REFRESH_TOKEN`. |
| `Gmail API send failed: 403 ...` | The Gmail API is not enabled in the project (step 2). |
| `Gmail API send failed: 429` | You hit Gmail's daily sending limit. A personal Gmail allows a few hundred recipients a day. |

`/api/health` reports email trouble as `degraded`, never `unhealthy`. The API still serves everything except outgoing mail, and Render's own health check (`/api/health/live`) is unaffected.
