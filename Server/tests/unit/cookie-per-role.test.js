/**
 * One session per role (bug 2026-11-09): signing in as a coach in tab 2 used
 * to replace the admin's cookie that tab 1 was using, and tab 1 was signed out.
 */
const {
  accessCookieName,
  readAccessCookie,
  readRefreshCookie,
  requestRole,
  roleOfToken,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
} = require('../../src/utils/security/cookie.util');

const jwtFor = (userType) => `h.${Buffer.from(JSON.stringify({ userType })).toString('base64url')}.s`;
const req = (headers = {}, originalUrl = '/api/auth/me') => ({ headers, originalUrl });

describe('per-role session cookies', () => {
  test('each role is written under its own name, read from the token', () => {
    const res = { cookie: jest.fn() };
    setAccessTokenCookie(res, jwtFor('admin'), false);
    setAccessTokenCookie(res, jwtFor('coach'), false);
    setRefreshTokenCookie(res, 'opaque', false, undefined, 'coach');
    expect(res.cookie.mock.calls.map((c) => c[0])).toEqual(['access_token_admin', 'access_token_coach', 'refresh_token_coach']);
  });

  test('a request reads the cookie of the role it names, not the last sign-in', () => {
    const jar = { access_token_admin: 'A', access_token_coach: 'C', refresh_token_admin: 'RA', refresh_token_coach: 'RC' };
    expect(readAccessCookie(req({ 'x-user-type': 'admin' }), jar)).toBe('A');
    expect(readAccessCookie(req({ 'x-user-type': 'coach' }), jar)).toBe('C');
    expect(readRefreshCookie(req({ 'x-user-type': 'admin' }), jar)).toBe('RA');
    // From the API path when the header is absent.
    expect(readAccessCookie(req({}, '/api/admin/scores/team'), jar)).toBe('A');
    expect(readAccessCookie(req({}, '/api/superadmin/stats'), { access_token_superadmin: 'S', access_token_admin: 'A' })).toBe('S');
  });

  test('with several roles signed in and nothing naming one, none is guessed', () => {
    expect(readAccessCookie(req(), { access_token_admin: 'A', access_token_coach: 'C' })).toBeNull();
    expect(readAccessCookie(req(), { access_token_coach: 'C' })).toBe('C');
  });

  test('an older single-session cookie still works for its own role only', () => {
    expect(readAccessCookie(req({ 'x-user-type': 'admin' }), { access_token: jwtFor('admin') })).toBe(jwtFor('admin'));
    expect(readAccessCookie(req({ 'x-user-type': 'admin' }), { access_token: jwtFor('coach') })).toBeNull();
  });

  test('signing one role out leaves the other roles signed in', () => {
    const res = { clearCookie: jest.fn() };
    clearAuthCookies(res, false, 'coach');
    const names = res.clearCookie.mock.calls.map((c) => c[0]);
    expect(names).toContain('access_token_coach');
    expect(names).not.toContain('access_token_admin');
  });

  test('helpers', () => {
    expect(roleOfToken(jwtFor('judge'))).toBe('judge');
    expect(roleOfToken('not-a-jwt')).toBeNull();
    expect(requestRole(req({ 'x-user-type': 'EVIL' }, '/api/coaches/team'))).toBe('coach');
    expect(accessCookieName(null)).toBe('access_token');
  });
});
