import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPEARANCE_STORAGE_KEY,
  applyAppearance,
  readAppearancePreference,
  resolveAppearance,
  writeAppearancePreference,
} from './appearance';

const mockSystem = (light) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-color-scheme: light)' ? light : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};

describe('appearance preference', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('defaults to dark, so nobody sees a change until they choose', () => {
    expect(readAppearancePreference()).toBe('dark');
  });

  it('ignores a stored value it does not recognise', () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, 'hyperspace');
    expect(readAppearancePreference()).toBe('dark');
  });

  it('round-trips each valid choice', () => {
    for (const choice of ['dark', 'light', 'system']) {
      expect(writeAppearancePreference(choice)).toBe(true);
      expect(readAppearancePreference()).toBe(choice);
    }
  });

  it('falls back to dark in memory when storage throws (private modes)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readAppearancePreference()).toBe('dark');
    expect(writeAppearancePreference('light')).toBe(false);
  });

  it('resolves `system` from the device', () => {
    mockSystem(true);
    expect(resolveAppearance('system')).toBe('light');
    mockSystem(false);
    expect(resolveAppearance('system')).toBe('dark');
    expect(resolveAppearance('light')).toBe('light');
    expect(resolveAppearance('nonsense')).toBe('dark');
  });
});

describe('applyAppearance', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
      <meta name="theme-color" content="#f3eee6" media="(prefers-color-scheme: light)">`;
    document.documentElement.removeAttribute('data-appearance');
  });

  it('flips the attribute and color-scheme without touching anything else', () => {
    const body = document.body.innerHTML;
    applyAppearance('light', 'light');
    expect(document.documentElement.dataset.appearance).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.body.innerHTML).toBe(body);
  });

  it('forces both theme-color tags for an explicit choice', () => {
    applyAppearance('dark', 'dark');
    const colours = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content);
    expect(colours).toEqual(['#000000', '#000000']);
  });

  it('hands the tags back to their media queries for `system`', () => {
    applyAppearance('dark', 'dark');
    applyAppearance('light', 'system');
    const colours = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content);
    expect(colours).toEqual(['#000000', '#f3eee6']);
  });

  it('suppresses transitions for the switch and releases them after', async () => {
    applyAppearance('light', 'light', { suppressTransitions: true });
    expect(document.documentElement.classList.contains('appearance-switching')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(document.documentElement.classList.contains('appearance-switching')).toBe(false);
  });
});
