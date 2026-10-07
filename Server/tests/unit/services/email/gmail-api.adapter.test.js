const GmailApiAdapter = require('../../../../src/services/email/gmail-api.adapter');

const config = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
  user: 'sender@gmail.com',
};

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

/** A fetch stub answering the token endpoint and the send endpoint. */
function fakeFetch({ token = { status: 200, body: { access_token: 'at-1', expires_in: 3600 } },
                     send = { status: 200, body: { id: 'msg-1' } } } = {}) {
  return jest.fn(async (url) => {
    const r = url.includes('oauth2') ? token : send;
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  });
}

const decodeRaw = (fetchMock) => {
  const sendCall = fetchMock.mock.calls.find(([url]) => url.includes('gmail.googleapis.com'));
  return Buffer.from(JSON.parse(sendCall[1].body).raw, 'base64url').toString('utf8');
};

describe('GmailApiAdapter', () => {
  afterEach(() => jest.clearAllMocks());

  it('refuses to start with missing credentials, naming them', () => {
    expect(() => new GmailApiAdapter({ ...config, refreshToken: '' }, logger, fakeFetch()))
      .toThrow('missing configuration: refreshToken');
  });

  it('sends over HTTPS with a refreshed access token and an RFC 822 message', async () => {
    const fetch = fakeFetch();
    const adapter = new GmailApiAdapter(config, logger, fetch);

    const result = await adapter.sendEmail({
      to: 'player@example.com', subject: 'Your OTP Code', text: 'Code: 123456', html: '<b>123456</b>',
    });

    expect(result).toEqual({ success: true, messageId: 'msg-1', provider: 'gmail-api' });

    const [tokenUrl, tokenInit] = fetch.mock.calls.find(([url]) => url.includes('oauth2'));
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(new URLSearchParams(tokenInit.body).get('grant_type')).toBe('refresh_token');

    const [, sendInit] = fetch.mock.calls.find(([url]) => url.includes('gmail.googleapis.com'));
    expect(sendInit.headers.Authorization).toBe('Bearer at-1');

    const raw = decodeRaw(fetch);
    expect(raw).toMatch(/^From: sender@gmail\.com/m);
    expect(raw).toMatch(/^To: player@example\.com/m);
    expect(raw).toMatch(/^Subject: Your OTP Code/m);
    expect(raw).toContain('123456');
  });

  it('caches the access token across sends', async () => {
    const fetch = fakeFetch();
    const adapter = new GmailApiAdapter(config, logger, fetch);

    await adapter.sendEmail({ to: 'a@example.com', subject: 's', text: 't' });
    await adapter.sendEmail({ to: 'b@example.com', subject: 's', text: 't' });

    expect(fetch.mock.calls.filter(([url]) => url.includes('oauth2'))).toHaveLength(1);
  });

  it('explains an invalid_grant (revoked / 7-day testing token)', async () => {
    const fetch = fakeFetch({ token: { status: 400, body: { error: 'invalid_grant' } } });
    const adapter = new GmailApiAdapter(config, logger, fetch);

    await expect(adapter.sendEmail({ to: 'a@example.com', subject: 's', text: 't' }))
      .rejects.toThrow(/invalid_grant.*npm run gmail:token/);
  });

  it('drops a rejected access token so the retry refreshes it', async () => {
    const fetch = fakeFetch({ send: { status: 401, body: { error: { message: 'Invalid Credentials' } } } });
    const adapter = new GmailApiAdapter(config, logger, fetch);

    await expect(adapter.sendEmail({ to: 'a@example.com', subject: 's', text: 't' }))
      .rejects.toThrow('Gmail API send failed: 401 Invalid Credentials');
    expect(adapter.accessToken).toBeNull();
  });

  it('verifyConfiguration is a real token refresh', async () => {
    await expect(new GmailApiAdapter(config, logger, fakeFetch()).verifyConfiguration()).resolves.toBe(true);
    const failing = fakeFetch({ token: { status: 401, body: { error: 'invalid_client' } } });
    await expect(new GmailApiAdapter(config, logger, failing).verifyConfiguration()).resolves.toBe(false);
  });
});
