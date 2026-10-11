/**
 * The registry of looks, and which one is the default.
 *
 * Adding a look: write `looks/<id>.js` with defineLook, add it here, run
 * `npm run looks`. No component changes (docs/design-language/PLAN.md §11).
 *
 * Only the generator, the tests and the specimen page import this; components
 * read the CSS custom properties (plan §4.6).
 */
import primeTime from './prime-time.js';
import { resolveLook } from './define.js';

export const DEFAULT_LOOK_ID = 'prime-time';

export const LOOK_PACKS = {
  [primeTime.id]: primeTime,
};

export const LOOK_IDS = Object.keys(LOOK_PACKS);

/** Every look with its `extends` chain applied, the default first. */
export const resolvedLooks = () => [
  resolveLook(DEFAULT_LOOK_ID, LOOK_PACKS),
  ...LOOK_IDS.filter((id) => id !== DEFAULT_LOOK_ID).map((id) => resolveLook(id, LOOK_PACKS)),
];
