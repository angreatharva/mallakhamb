/**
 * Which look a route is drawn in, and the developer preview override.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOK, KNOWN_LOOKS, LOOK_BY_ROUTE, applyLook, claimLook, currentLook, lookForPath, onLookClaim, releaseLook,
} from './look';

afterEach(() => {
  window.sessionStorage.clear();
  document.documentElement.removeAttribute('data-look');
});

describe('lookForPath', () => {
  it('draws every route in the default look until a wave moves its group', () => {
    for (const path of ['/', '/scores', '/player/login', '/judge/scoring', '/admin/dashboard/judges']) {
      expect(lookForPath(path)).toBe(lookForPath(path, LOOK_BY_ROUTE));
    }
    expect(lookForPath('/no-such-page', [])).toBe(DEFAULT_LOOK);
  });

  it('takes the first matching route group', () => {
    const routes = [
      { match: /^\/scores$/, look: 'prime-time' },
      { match: /^\//, look: 'classic' },
    ];
    expect(lookForPath('/scores', routes)).toBe('prime-time');
    expect(lookForPath('/scoresheet', routes)).toBe('classic');
  });

  it('only maps routes to looks the CSS defines', () => {
    for (const { look } of LOOK_BY_ROUTE) expect(KNOWN_LOOKS).toContain(look);
  });
});

describe('applyLook', () => {
  it('puts the look on <html> and nowhere else', () => {
    expect(applyLook('/player/login')).toBe(lookForPath('/player/login'));
    expect(document.documentElement.getAttribute('data-look')).toBe(lookForPath('/player/login'));
    expect(currentLook()).toBe(lookForPath('/player/login'));
  });

  it('previews a look for this tab with ?look= (dev), keeps it, and drops it with ?look=off', () => {
    expect(applyLook('/player/login', '?look=prime-time')).toBe('prime-time');
    expect(applyLook('/judge/dashboard', '')).toBe('prime-time');
    expect(applyLook('/judge/dashboard', '?look=off')).toBe(lookForPath('/judge/dashboard'));
    expect(applyLook('/judge/dashboard', '')).toBe(lookForPath('/judge/dashboard'));
  });

  it('ignores a look nobody defined', () => {
    expect(applyLook('/', '?look=comic-sans')).toBe(lookForPath('/'));
  });
});

describe('route groups (rollout waves)', () => {
  it('W1: public and auth screens are prime-time', () => {
    for (const path of [
      '/', '/scores', '/player/login', '/coach/login', '/judge/login', '/admin/login', '/superadmin/login',
      '/player/register', '/coach/register', '/judge/register', '/admin/register',
      '/forgot-password', '/reset-password',
      '/player/select-level', '/coach/select-competition', '/judge/select-level', '/admin/select-competition',
    ]) expect(lookForPath(path), path).toBe('prime-time');
  });

  it('W2: every player and coach screen is prime-time', () => {
    for (const path of [
      '/player/dashboard', '/player/select-team', '/coach/dashboard', '/coach/create-team', '/coach/payment', '/coach',
    ]) expect(lookForPath(path), path).toBe('prime-time');
  });

  it('W3: every admin and superadmin screen is prime-time', () => {
    for (const path of [
      '/admin/dashboard', '/admin/dashboard/lots', '/admin/scoring', '/admin/teams',
      '/superadmin/dashboard/management', '/superadmin/add-player-payment', '/superadmin/scoring',
    ]) expect(lookForPath(path), path).toBe('prime-time');
  });

  it('W4: every judge screen is prime-time', () => {
    for (const path of ['/judge/dashboard', '/judge/scoring', '/judge/scoring/panel-review', '/judge/profile', '/judge/sequence']) {
      expect(lookForPath(path), path).toBe('prime-time');
    }
  });

  it('does not reach past a group: look-alike paths keep the default', () => {
    for (const path of ['/scoresheet', '/players', '/coaching', '/administrator', '/judges', '/no-such-page']) {
      expect(lookForPath(path), path).toBe(DEFAULT_LOOK);
    }
  });
});

describe('claimLook (a screen no path names: the 404)', () => {
  it('holds only on the path it was made on, and lapses when released', () => {
    const heard = [];
    const stop = onLookClaim(() => heard.push('change'));
    claimLook('/no-such-page', 'prime-time');
    expect(applyLook('/no-such-page')).toBe('prime-time');
    expect(applyLook('/judge/dashboard')).toBe(lookForPath('/judge/dashboard'));
    releaseLook('/somewhere-else'); // not its path: the claim stands
    expect(applyLook('/no-such-page')).toBe('prime-time');
    releaseLook('/no-such-page');
    expect(applyLook('/no-such-page')).toBe(DEFAULT_LOOK);
    expect(heard).toEqual(['change', 'change']);
    stop();
  });
});
