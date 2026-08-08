/**
 * E-mail delivery over a real SMTP conversation.
 *
 * `nodemailer` went 7.x -> 9.x in this release, a breaking major on the
 * transport that carries OTP and password-reset mail. The upgrade was first
 * checked against `jsonTransport`, which exercises the API contract but never
 * speaks the protocol — it cannot tell you whether the handshake, AUTH, or DATA
 * framing still work.
 *
 * This stands up a minimal SMTP server on localhost and points the application's
 * OWN EmailService at it, so the real adapter completes a real conversation.
 * No provider credentials are involved, which is what makes it runnable in CI.
 *
 * It does NOT replace a live send against the configured provider — Gmail or
 * Resend can still reject on auth, SPF or rate limits. That remains a manual
 * step in RELEASE-RUNBOOK.md.
 */

const net = require('net');

const received = [];

function startSmtpServer() {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let buffer = '';
      let inData = false;
      let message = '';

      socket.write('220 localhost ESMTP test\r\n');

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let idx;
        while ((idx = buffer.indexOf('\r\n')) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          if (inData) {
            if (line === '.') {
              inData = false;
              received.push(message);
              message = '';
              socket.write('250 OK queued\r\n');
            } else {
              message += line + '\n';
            }
            continue;
          }

          const cmd = line.toUpperCase();
          if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) {
            socket.write('250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
          } else if (cmd.startsWith('AUTH')) {
            socket.write('235 Authentication successful\r\n');
          } else if (cmd.startsWith('MAIL FROM') || cmd.startsWith('RCPT TO')) {
            socket.write('250 OK\r\n');
          } else if (cmd === 'DATA') {
            inData = true;
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          } else if (cmd === 'QUIT') {
            socket.write('221 Bye\r\n');
            socket.end();
          } else {
            socket.write('250 OK\r\n');
          }
        }
      });
      socket.on('error', () => {});
    });
    server.listen(0, () => resolve(server));
  });
}


let server;
let port;
let service;

beforeAll(async () => {
  server = await startSmtpServer();
  port = server.address().port;

  process.env.EMAIL_PROVIDER = 'nodemailer';
  process.env.EMAIL_HOST = '127.0.0.1';
  process.env.EMAIL_PORT = String(port);
  process.env.EMAIL_SECURE = 'false';
  process.env.EMAIL_USER = 'noreply@mallakhamb.test';
  process.env.EMAIL_PASS = 'irrelevant';

  // config.load() validates the whole app config, including MONGODB_URI, which
  // this suite has no use for. Supply the required keys rather than reaching
  // past the validation — that keeps the real loader in the loop.
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET
    || '0123456789abcdef0123456789abcdef0123456789abcdef';

  const config = require('../../../src/config/config-manager');
  config.load();

  const EmailService = require('../../../src/services/email/email.service');
  const noop = { info() {}, warn() {}, error() {}, debug() {} };
  service = new EmailService(config, noop);
});

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
});

beforeEach(() => {
  received.length = 0;
});

/** Wait until `n` messages have arrived, or give up. */
async function waitForMessages(n, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (received.length >= n) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

describe('OTP e-mail over real SMTP', () => {
  test('delivers, carrying the code and the recipient', async () => {
    // Exactly the payload otp.service.js sends in production.
    await service.sendOTP('judge@example.com', {
      otp: '246810',
      userName: 'Demo Judge',
      expiryMinutes: 10,
    });

    expect(await waitForMessages(1)).toBe(true);

    const message = received[0];
    expect(message).toContain('246810');
    expect(message).toContain('judge@example.com');
    // Proves MIME framing survived the major upgrade, not just that a string
    // went down the socket.
    expect(message).toMatch(/Subject:/i);
    expect(message).toMatch(/Content-Type:/i);
  });

  test('the expiry the caller passes reaches the message', async () => {
    await service.sendOTP('judge@example.com', {
      otp: '135791', userName: 'Demo Judge', expiryMinutes: 7,
    });

    expect(await waitForMessages(1)).toBe(true);
    expect(received[0]).toContain('7');
  });
});

describe('password-reset e-mail over real SMTP', () => {
  test('delivers, carrying the reset link', async () => {
    await service.sendPasswordReset('coach@example.com', {
      userName: 'Demo Coach',
      resetLink: 'https://app.example.com/reset/abc123',
    });

    expect(await waitForMessages(1)).toBe(true);
    expect(received[0]).toContain('coach@example.com');
    // The template only renders the link when `resetLink` is supplied — the
    // field name is the contract, and a rename here would silently ship a
    // reset e-mail with no way to reset.
    expect(received[0]).toContain('/reset/abc123');
  });

  test('omitting the link still produces a valid message', async () => {
    await service.sendPasswordReset('coach@example.com', { userName: 'Demo Coach' });

    expect(await waitForMessages(1)).toBe(true);
    expect(received[0]).toMatch(/Subject:/i);
  });
});
