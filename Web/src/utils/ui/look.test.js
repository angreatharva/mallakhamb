/**
 * Which look a route is drawn in, and the developer preview override.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, KNOWN_LOOKS, LOOK_BY_ROUTE, applyLook, currentLook, lookForPath } from './look';

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
