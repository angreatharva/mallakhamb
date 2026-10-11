/**
 * Fonts follow the look: classic routes load neither the @font-face rules nor
 * any font file; prime-time preloads the two first-paint files and loads the faces.
 */
import { describe, expect, it, vi } from 'vitest';
import { FIRST_PAINT_FONTS, loadLookFonts } from './fonts';

// The URLs Vite would emit for the two files (asset resolution is not under test).
vi.mock('@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url', () => ({ default: '/assets/archivo-latin-wdth-normal.woff2' }));
vi.mock('@fontsource/teko/files/teko-latin-600-normal.woff2?url', () => ({ default: '/assets/teko-latin-600-normal.woff2' }));
const faces = vi.hoisted(() => ({ loaded: 0 }));
vi.mock('./look-fonts.js', () => { faces.loaded += 1; return {}; });

const preloads = () => [...document.head.querySelectorAll('link[rel="preload"][as="font"]')].map((l) => l.getAttribute('href'));

describe('loadLookFonts', () => {
  it('does nothing for a look without web fonts: no preload, no @font-face chunk', () => {
    expect(loadLookFonts('no-such-look')).toBeNull();
    expect(preloads()).toEqual([]);
    expect(faces.loaded).toBe(0);
  });

  it('preloads the first-paint files and loads the faces for prime-time, once', async () => {
    await loadLookFonts('prime-time');
    await loadLookFonts('prime-time');
    expect(preloads()).toEqual(FIRST_PAINT_FONTS);
    expect(faces.loaded).toBe(1);
    const link = document.head.querySelector('link[as="font"]');
    expect(link.getAttribute('crossorigin')).toBe('anonymous');
    expect(link.getAttribute('type')).toBe('font/woff2');
  });

  it('preloads only latin woff2 files (the font budget, PLAN §5.4)', () => {
    expect(FIRST_PAINT_FONTS).toHaveLength(2);
    for (const href of FIRST_PAINT_FONTS) expect(href).toMatch(/latin-.*\.woff2/);
  });
});
