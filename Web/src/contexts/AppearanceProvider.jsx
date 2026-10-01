import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  APPEARANCE_STORAGE_KEY,
  applyAppearance,
  isAppearancePreference,
  onSystemAppearanceChange,
  readAppearancePreference,
  resolveAppearance,
  systemAppearance,
  writeAppearancePreference,
} from '@/utils/ui/appearance';

/**
 * Light/Dark appearance. NOT the role accent — that is `ThemeProvider`.
 *
 * The page does not re-render when the appearance changes: colours come from
 * CSS custom properties keyed on `html[data-appearance]`, so a switch is one
 * attribute flip. Only components that call `useAppearance()` (the menu that
 * shows the current choice) re-render; `children` is a stable prop, so React
 * bails out of everything beneath the provider.
 */
const AppearanceContext = createContext(null);

// Layout effect in the browser so the attribute is right before paint; plain
// effect elsewhere so a non-DOM render does not warn.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const AppearanceProvider = ({ children }) => {
  const [preference, setPreferenceState] = useState(readAppearancePreference);
  const [system, setSystem] = useState(systemAppearance);

  const appearance = preference === 'system' ? system : resolveAppearance(preference);

  // Normally a no-op: public/appearance-init.js already set the same values
  // before the first paint. It matters where that script did not run (tests).
  useIsomorphicLayoutEffect(() => {
    applyAppearance(appearance, preference);
  }, [appearance, preference]);

  // `Match device` follows the OS live.
  useEffect(() => onSystemAppearanceChange(setSystem), []);

  // Another tab chose: follow it, the same pattern AuthProvider uses.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== APPEARANCE_STORAGE_KEY) return;
      setPreferenceState(isAppearancePreference(event.newValue) ? event.newValue : readAppearancePreference());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPreference = useCallback((next) => {
    if (!isAppearancePreference(next)) return;
    writeAppearancePreference(next); // storage refusing still switches, in memory
    applyAppearance(resolveAppearance(next), next, { suppressTransitions: true });
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    () => ({ preference, appearance, setPreference }),
    [preference, appearance, setPreference]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
};

AppearanceProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

/**
 * `{ preference: 'dark'|'light'|'system', appearance: 'dark'|'light', setPreference }`.
 *
 * Only the appearance control should need this. Anything that merely has to
 * LOOK right in both appearances should use the colour tokens, not this hook.
 */
/**
 * The context or `null` — for the appearance control only, so a page rendered
 * without the provider (an isolated page test) shows no control instead of
 * throwing. Everything else should use `useAppearance()` and keep its guard.
 */
export const useOptionalAppearance = () => useContext(AppearanceContext);

export const useAppearance = () => {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used inside <AppearanceProvider>.');
  return context;
};

export default AppearanceProvider;
