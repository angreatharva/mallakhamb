import tekoLatin600 from '@fontsource/teko/files/teko-latin-600-normal.woff2?url';
import archivoLatin from '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url';

/**
 * The landing page's hero photograph (its largest paint). index.html starts the same request with
 * the HTML on "/", so these URLs must stay identical to the ones there.
 */
const HERO_BASE = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6b/KALPESH.jpg/';
export const HERO_IMAGE = {
  src: `${HERO_BASE}1920px-KALPESH.jpg`,
  srcSet: [960, 1280, 1920].map((w) => `${HERO_BASE}${w}px-KALPESH.jpg ${w}w`).join(', '),
};

/**
 * Called from main.jsx before React renders, on "/" only: start the Home chunk and the two fonts
 * the first screen is set in, in parallel with the app's own boot, instead of after it.
 */
export function preloadHome() {
  [tekoLatin600, archivoLatin].forEach((href) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'font';
    link.type = 'font/woff2';
    link.crossOrigin = 'anonymous';
    link.href = href;
    document.head.appendChild(link);
  });
  import('@/pages/public/Home');
}
