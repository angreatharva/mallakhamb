import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useOptionalAppearance } from '@/contexts/AppearanceProvider';
import { systemAppearance } from '@/utils/ui/appearance';

const NAME = { dark: 'Dark', light: 'Light' };

/**
 * The Light/Dark control (plan §14.8).
 *
 * An icon button that shows the RESOLVED appearance — a moon in dark, a sun in
 * light — and opens a menu of three explicit choices. Not a cycling button:
 * cycling makes people remember the order, a menu lets them recognise the one
 * they want. "Match device" names what the device is currently showing.
 *
 * Switching is an attribute flip (the provider suppresses transitions for that
 * one frame); nothing remounts and nothing reloads, so a judge mid-slip keeps
 * every mark, the autosave and the socket.
 *
 * Keyboard: Enter/Space or ArrowDown opens and focuses the checked item;
 * arrows, Home and End move; Esc closes and returns focus to the button; Tab
 * closes and moves on. The change is announced through a polite live region.
 */
const AppearanceMenu = ({ className = '' }) => {
  // Outside a provider (an isolated page test) the control renders nothing — after every hook has run.
  const context = useOptionalAppearance();
  const { preference = 'dark', appearance = 'dark', setPreference = () => {} } = context || {};
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();

  const device = systemAppearance();
  const options = [
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'system', label: `Match device (currently ${NAME[device]})`, Icon: Monitor },
  ];
  const ButtonIcon = appearance === 'light' ? Sun : Moon;

  // Opening moves focus onto the checked choice, so arrows start from there.
  useEffect(() => {
    if (!open) return;
    const checked = Math.max(0, ['dark', 'light', 'system'].indexOf(preference));
    itemRefs.current[checked]?.focus();
  }, [open, preference]);

  // A press anywhere else closes it, without stealing focus back.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = (returnFocus) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const choose = (value) => {
    setPreference(value);
    setAnnouncement(`Appearance: ${NAME[value === 'system' ? device : value]}`);
    close(true);
  };

  const onMenuKeyDown = (event) => {
    const items = itemRefs.current.filter(Boolean);
    const at = items.indexOf(document.activeElement);
    const focus = (i) => items[(i + items.length) % items.length]?.focus();
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); focus(at + 1); break;
      case 'ArrowUp': event.preventDefault(); focus(at - 1); break;
      case 'Home': event.preventDefault(); focus(0); break;
      case 'End': event.preventDefault(); focus(items.length - 1); break;
      case 'Escape': event.preventDefault(); close(true); break;
      case 'Tab': close(false); break;
      default: break;
    }
  };

  if (!context) return null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Appearance: ${NAME[appearance]}`}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true); }
        }}
        className="tap-safe mouse:min-h-[36px] mouse:min-w-[36px] inline-flex items-center justify-center rounded-lg border border-line text-fg-muted hover:text-white hover:bg-white/[0.06] transition-colors"
      >
        <ButtonIcon className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Appearance"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 mt-2 min-w-[15rem] rounded-xl border border-line bg-surface-overlay p-1 shadow-2xl z-popover"
        >
          {options.map(({ value, label, Icon }, i) => {
            const checked = preference === value;
            return (
              <button
                key={value}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={-1}
                onClick={() => choose(value)}
                className="tap-safe mouse:min-h-[36px] w-full flex items-center gap-3 rounded-lg px-3 text-left text-sm text-white hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
              >
                <Icon className="w-4 h-4 flex-shrink-0 text-fg-muted" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                {checked && <Check className="w-4 h-4 flex-shrink-0 text-accent-fg" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}

      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    </div>
  );
};

AppearanceMenu.propTypes = {
  className: PropTypes.string,
};

/**
 * The same control for the screens with no header bar — sign-in, registration,
 * password reset and the level/competition choosers (§14.9: "top-right").
 * Fixed in the corner, clear of a notch, on a backing so page content scrolling
 * beneath it never shows through the icon.
 */
export const CornerAppearanceMenu = () => (
  <div
    className="fixed z-popover rounded-lg bg-surface/80 backdrop-blur-sm"
    style={{ top: 'max(0.75rem, env(safe-area-inset-top))', right: 'max(0.75rem, env(safe-area-inset-right))' }}
  >
    <AppearanceMenu />
  </div>
);

export default AppearanceMenu;
