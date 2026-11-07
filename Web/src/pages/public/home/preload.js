import { preloadFirstPaintFonts } from '@/styles/fonts';
import { HOME_IMAGES } from './images';

/** The landing page's hero photograph (its largest paint): a local file, see home/images.js. */
export const HERO_IMAGE = { src: HOME_IMAGES.hero, width: 570, height: 250 };
/** Upright screens' hero: the same photo with the stage extended upward (home.css explains). */
export const HERO_IMAGE_TALL = { src: HOME_IMAGES.heroTall, width: 947, height: 1661 };
export const PORTRAIT = '(orientation: portrait)';
const LANDSCAPE = '(orientation: landscape)'; // exactly "not portrait"; WebKit ignores `not all and …` on a preload

/**
 * Called from main.jsx before React renders, on "/" only: start the Home chunk, the hero photo and
 * the two fonts the first screen is set in, in parallel with the app's own boot, instead of after it.
 * (The hero's URL is hashed at build time, so index.html cannot name it; it starts here instead.)
 */
export function preloadHome() {
  // The same two files every prime-time first screen preloads, through the same
  // once-per-page set, so App's loadLookFonts('prime-time') adds no duplicates.
  preloadFirstPaintFonts();
  // One preload per screen shape, so each device fetches only the hero its <picture> will show.
  [[HERO_IMAGE.src, LANDSCAPE], [HERO_IMAGE_TALL.src, PORTRAIT]].forEach(([href, media]) => {
    const hero = document.createElement('link');
    hero.rel = 'preload';
    hero.as = 'image';
    hero.href = href;
    hero.media = media;
    hero.setAttribute('fetchpriority', 'high');
    document.head.appendChild(hero);
  });
  import('@/pages/public/Home');
}
