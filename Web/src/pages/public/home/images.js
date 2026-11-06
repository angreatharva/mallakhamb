/**
 * The landing page's photographs. Every one is a local file in Web/assets/images, bundled by Vite
 * (hashed URL, served from our own origin); nothing is loaded from another site.
 *
 * home/sections.html is imported ?raw, so Vite never sees its <img src>. The markup names each photo
 * as a placeholder instead, src="%img:<key>%", and fillImages() swaps in the bundled URL.
 */
import hero from '../../../../assets/images/China-Main.jpg';
// The hero for upright screens (see home.css): China-Main with the stage outpainted upward to
// 570x500 (Weave, Flux Pro Fill, 2026-11-07); a stray AI halo near the top-left beam was toned out by hand.
import heroTall from '../../../../assets/images/China-Main-tall.jpg';
import pole from '../../../../assets/images/veerbadrasana-III.jpg';
import hanging from '../../../../assets/images/Hanging-Mallakhamb.jpg';
import rope from '../../../../assets/images/wadi.jpg';
import live from '../../../../assets/images/Mallakhamba-Mumbai-1.jpg';

export const HOME_IMAGES = { hero, heroTall, pole, hanging, rope, live };

export function fillImages(html) {
  return html.replace(/%img:(\w+)%/g, (match, key) => {
    if (!HOME_IMAGES[key]) throw new Error(`[home] no image named "${key}" in home/images.js`);
    return HOME_IMAGES[key];
  });
}
