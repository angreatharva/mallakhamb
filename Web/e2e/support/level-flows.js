import { expect } from '@playwright/test';
import { levelForPlace } from './meets.js';

/**
 * The level chooser, shared by every role's sign-in helper.
 *
 * Since the level flow landed, sign-in no longer drops a user on their
 * dashboard. It drops them on `/{role}/select-level`, and the competition
 * chooser behind it bounces anyone who arrives without a level. Every seeding
 * run therefore has to walk one extra rung, and it is the same rung for all
 * four roles — so it lives here rather than being copied into each flow file.
 *
 * @module e2e/support/level-flows
 */

/**
 * Choose a level and continue to the competition chooser.
 *
 * Navigates to the chooser EXPLICITLY rather than assuming the current page is
 * already it. A seeding run signs several people in against one browser
 * context, and the level persists per role in session storage — so the second
 * coach would otherwise inherit the first coach's level, skip this screen, and
 * find no card for their own meet on the list behind it. A stale level fails as
 * "expected exactly one competition in Pune", which points at the roster rather
 * than at the level that hid it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} role - admin | coach | player | judge
 * @param {string} level - district | state | national | international
 * @param {{timeout?: number}} [options]
 */
/*
 * SIXTY seconds, not thirty, and it is the first screen of a run that pays for
 * it. Playwright starts each run with a cold HTTP cache, so the first visit to
 * a role's area fetches every lazy chunk in its tree and Vite transforms them
 * on demand — the chooser sat on its `Loading…` fallback for well over thirty
 * seconds on a cold dev server, and the run failed with "did not render — is
 * this account signed in?", which accuses the sign-in that had just worked.
 * The second visit is instant, so this costs nothing once warm. `judgeSignIn`
 * carries 90s for the same reason.
 */
export const chooseLevel = async (page, role, level, { timeout = 60_000 } = {}) => {
  await page.goto(`/${role}/select-level`);

  const heading = page.getByRole('heading', { name: 'Choose Your Level' });
  await expect(
    heading,
    `The ${role} level chooser did not render — is this account signed in?`
  ).toBeVisible({ timeout });

  /*
   * Matched on the card's accessible NAME, which reads
   * "<Label> <blurb> <n> competitions". Anchored to the start so "State" does
   * not also match the word where it appears inside another card's blurb.
   */
  const card = page.getByRole('button', { name: new RegExp(`^${level}\\b`, 'i') });
  await expect(
    card,
    `Expected exactly one "${level}" card on the ${role} level chooser`
  ).toHaveCount(1, { timeout: 20_000 });
  await card.click();

  const go = page.getByRole('button', { name: /^continue$/i });
  await expect(go, 'the level card did not register the click').toBeEnabled();
  await go.click();

  await expect(page).not.toHaveURL(/\/select-level/, { timeout: 20_000 });
};

/**
 * Choose the level that the meet in `place` sits at.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} role
 * @param {string} place - e.g. 'Mumbai'
 * @param {{timeout?: number}} [options]
 */
export const chooseLevelForPlace = async (page, role, place, options) =>
  chooseLevel(page, role, levelForPlace(place), options);
