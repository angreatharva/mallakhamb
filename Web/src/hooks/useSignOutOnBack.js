/**
 * Back from a signed-in screen asks to sign out instead of reopening the
 * choosers.
 *
 * Every role reaches its dashboard through screens it should not walk back
 * into once it is signed in: login, then the level and competition choosers
 * (and, for players, the squad; for coaches, team creation). Back from the
 * dashboard used to land on those — the competition chooser even passes
 * straight through to a dashboard again when there is only one meet, so Back
 * looked broken. Now the step is undone, the screen the user was on stays put,
 * and they are asked whether they meant to sign out.
 *
 * How, and why not a sentinel history entry:
 *
 *   - The common trick — `pushState` a duplicate entry on arrival and catch the
 *     pop — is defeated by Chrome and Safari, which skip entries a page adds
 *     without a user gesture when Back is pressed. Reload the dashboard, press
 *     Back, and the sentinel is jumped straight over.
 *   - So nothing is added to history. The pop is allowed to happen, and is then
 *     reversed with `history.go(+n)`, using the `idx` React Router keeps in every
 *     entry's state to know how far the user went. `idx` survives replace
 *     navigations, which several dashboards make on arrival (the admin one
 *     strips `?competitionId=`), so it stays right where a marker on the entry
 *     would be wiped.
 *   - While the reversal is in flight the routes keep drawing the screen the
 *     user left (`location` below). The chooser is never mounted, so its
 *     auto-pass-through cannot fire, and the dashboard is never unmounted, so
 *     nothing on it — filters, an open tab, a judge's socket — is lost.
 *
 * Only BACKWARD pops out of the signed-in area count. Forward is the user
 * returning to a chooser they opened themselves; push and replace are the app
 * navigating on purpose (the "change competition" buttons, logout, expiry).
 *
 * @module hooks/useSignOutOnBack
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { getRoleFromPath } from '@/utils/auth/roleFromPath';

/**
 * First path segment, after `/{role}/`, of the screens that lead TO the
 * dashboard. Everything else under the role's prefix is past them.
 */
const ENTRY_SCREENS = new Set([
  'login',
  'register',
  'select-level',
  'select-competition',
  'select-team',
  'create-team',
]);

/**
 * Is `pathname` a screen past the post-login choosers for `role`?
 *
 * @param {string} pathname
 * @param {string|null} role
 * @returns {boolean}
 */
export function isSignedInScreen(pathname, role) {
  if (!role || !pathname || getRoleFromPath(pathname) !== role) return false;
  const first = pathname.slice(role.length + 1).split('/').filter(Boolean)[0];
  // `/{role}` alone only redirects to the login page.
  return Boolean(first) && !ENTRY_SCREENS.has(first);
}

/** React Router's index of the current history entry, or null if unknown. */
const historyIndex = () => {
  const idx = window.history.state?.idx;
  return Number.isInteger(idx) ? idx : null;
};

/**
 * @param {{ signedInRole: string|null }} options - the role whose session is
 *   live (AuthProvider's `userType`, only while it also has a user).
 * @returns {{
 *   location: import('react-router-dom').Location,
 *   prompting: boolean,
 *   dismiss: () => void,
 * }} `location` is what the routes should draw; `prompting` opens the
 *   sign-out question; `dismiss` closes it, leaving the user where they are.
 */
export function useSignOutOnBack({ signedInRole }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const [prompting, setPrompting] = useState(false);

  // The last location the routes were allowed to draw, and its history index.
  const settledRef = useRef(null);
  if (settledRef.current === null) {
    settledRef.current = { location, idx: historyIndex() };
  }
  const settled = settledRef.current;
  const settledRole = getRoleFromPath(settled.location.pathname);

  const targetIdx = historyIndex();
  const wentBack = targetIdx === null || settled.idx === null || targetIdx < settled.idx;
  const leaving =
    navigationType === 'POP' &&
    location.key !== settled.location.key &&
    Boolean(signedInRole) &&
    settledRole === signedInRole &&
    isSignedInScreen(settled.location.pathname, settledRole) &&
    !isSignedInScreen(location.pathname, settledRole) &&
    wentBack;

  useLayoutEffect(() => {
    if (!leaving) {
      settledRef.current = { location, idx: historyIndex() };
      return;
    }

    setPrompting(true);
    const { location: back, idx } = settledRef.current;
    const here = historyIndex();
    if (idx !== null && here !== null && idx > here) {
      // Undo exactly the step(s) taken — a long-press on Back can skip several.
      window.history.go(idx - here);
    } else {
      // No index to go by (an entry written outside the router): put the
      // screen back over this entry instead. Same route, so nothing remounts.
      navigate(
        { pathname: back.pathname, search: back.search, hash: back.hash },
        { replace: true, state: back.state },
      );
    }
  }, [leaving, location, navigate]);

  const dismiss = useCallback(() => setPrompting(false), []);

  return {
    location: leaving ? settled.location : location,
    prompting,
    dismiss,
  };
}
