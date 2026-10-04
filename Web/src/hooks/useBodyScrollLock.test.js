/**
 * The page behind a dialog or a menu stays frozen until the LAST of them closes.
 *
 * The three menus used to write `body.style.overflow` themselves, so a menu
 * closing while a dialog was open handed scrolling back underneath the dialog.
 * Every overlay and menu now goes through one counted lock; these pin the count.
 */

import { describe, test, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, renderHook, cleanup } from '@testing-library/react';
import { useBodyScrollLock, BodyScrollLock } from './useBodyScrollLock';

const overflow = () => document.body.style.overflow;

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('the counted body scroll lock', () => {
  test('locks while held and restores the saved style when released', () => {
    document.body.style.overflow = 'auto';
    const lock = renderHook(({ on }) => useBodyScrollLock(on), { initialProps: { on: true } });
    expect(overflow()).toBe('hidden');
    lock.rerender({ on: false });
    expect(overflow()).toBe('auto');
  });

  test('a menu closing under an open dialog keeps the page frozen', () => {
    const menu = renderHook(({ on }) => useBodyScrollLock(on), { initialProps: { on: true } });
    const dialog = render(createElement(BodyScrollLock));
    menu.rerender({ on: false });
    expect(overflow()).toBe('hidden');
    dialog.unmount();
    expect(overflow()).toBe('');
  });

  test('the element form holds for exactly as long as it is mounted', () => {
    const { unmount } = render(createElement(BodyScrollLock));
    expect(overflow()).toBe('hidden');
    unmount();
    expect(overflow()).toBe('');
  });

  test('an unlocked call changes nothing', () => {
    renderHook(() => useBodyScrollLock(false));
    expect(overflow()).toBe('');
  });
});
