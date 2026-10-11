import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import '@/styles/look-fonts';
import { cx } from './cx';
import Button from './Button';

/**
 * Menu (WAI-ARIA menu button). Enter/Space/ArrowDown opens it on the first
 * item, ArrowUp on the last; arrows, Home and End move; Esc closes and gives
 * focus back to the button; Tab or a click outside closes it.
 *
 *   <Menu label="Team actions" items={[{ label: 'Rename', icon: Pencil, onSelect: rename },
 *     { label: 'Remove', icon: Trash2, onSelect: ask, danger: true }]} />
 */
const Menu = ({ label, buttonLabel = null, buttonVariant = 'line', icon = null, align = 'end', items }) => {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);
  const wrapRef = useRef(null);
  const pending = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const index = pending.current ?? 0;
    itemRefs.current[index]?.focus();
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openAt = (index) => { pending.current = index; setOpen(true); };
  const close = (refocus = true) => { setOpen(false); if (refocus) buttonRef.current?.focus(); };

  const onButtonKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAt(0); }
    if (e.key === 'ArrowUp') { e.preventDefault(); openAt(items.length - 1); }
  };
  const onItemKey = (e, i) => {
    const move = { ArrowDown: (i + 1) % items.length, ArrowUp: (i - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[e.key];
    if (move !== undefined) { e.preventDefault(); itemRefs.current[move]?.focus(); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') close(false);
  };

  return (
    <div ref={wrapRef} className="ui-menu-wrap">
      <Button
        ref={buttonRef}
        variant={buttonVariant}
        icon={icon}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={buttonLabel ? undefined : label}
        onClick={() => (open ? close() : openAt(0))}
        onKeyDown={onButtonKey}
      >
        {buttonLabel}
      </Button>
      {open && (
        <ul id={menuId} role="menu" aria-label={label} className={cx('ui-menu', align === 'start' && 'ui-menu--start')}>
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <li key={item.label} role="none">
                <button
                  ref={(el) => { itemRefs.current[i] = el; }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={cx('ui-menu-item type-body-s', item.danger && 'ui-menu-item--danger')}
                  onClick={() => { close(); item.onSelect(); }}
                  onKeyDown={(e) => onItemKey(e, i)}
                >
                  {Icon && <Icon aria-hidden="true" />}
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

Menu.propTypes = {
  label: PropTypes.string.isRequired,
  buttonLabel: PropTypes.node,
  buttonVariant: PropTypes.oneOf(['solid', 'line', 'ghost']),
  icon: PropTypes.elementType,
  align: PropTypes.oneOf(['start', 'end']),
  items: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired, onSelect: PropTypes.func.isRequired, icon: PropTypes.elementType, danger: PropTypes.bool,
  })).isRequired,
};

export default Menu;
