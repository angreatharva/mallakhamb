import { preloadFirstPaintFonts } from '@/styles/fonts';

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
  // The same two files every prime-time first screen preloads, through the same
  // once-per-page set, so App's loadLookFonts('prime-time') adds no duplicates.
  preloadFirstPaintFonts();
  import('@/pages/public/Home');
}
