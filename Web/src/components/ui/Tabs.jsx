import { useId, useRef } from 'react';
import PropTypes from 'prop-types';
import '@/styles/look-fonts';
import { cx } from './cx';

/** Arrow keys, Home and End move between items; returns the index to focus. */
const nextIndex = (key, index, count) => {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
};

/**
 * Tabs (WAI-ARIA tabs, automatic activation): one Tab stop, arrows move and
 * select. Pair each tab with a <TabPanel id={tabPanelId(idBase, tab.id)}>.
 *
 *   <Tabs label="Results" tabs={[{ id: 'ind', label: 'Individual' }, …]} value={tab} onChange={setTab} idBase="results" />
 *   <TabPanel idBase="results" tabId={tab}>…</TabPanel>
 */
export const Tabs = ({ tabs, value, onChange, label, idBase: idProp, className = '' }) => {
  const auto = useId();
  const idBase = idProp || `t${auto.replace(/:/g, '')}`;
  const refs = useRef([]);
  const onKeyDown = (e, index) => {
    const next = nextIndex(e.key, index, tabs.length);
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cx('ui-tabs', className)}>
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className="ui-tab"
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
Tabs.propTypes = {
  tabs: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired, label: PropTypes.node.isRequired })).isRequired,
  value: PropTypes.string, onChange: PropTypes.func.isRequired, label: PropTypes.string.isRequired,
  idBase: PropTypes.string, className: PropTypes.string,
};

export const TabPanel = ({ idBase, tabId, className = '', children }) => (
  <div role="tabpanel" id={`${idBase}-panel-${tabId}`} aria-labelledby={`${idBase}-tab-${tabId}`} tabIndex={0} className={className}>
    {children}
  </div>
);
TabPanel.propTypes = { idBase: PropTypes.string.isRequired, tabId: PropTypes.string.isRequired, className: PropTypes.string, children: PropTypes.node };

/**
 * Segmented: one choice of a few (a radiogroup). Arrows move the choice.
 *
 *   <Segmented label="Appearance" options={[{ value: 'dark', label: 'Dark' }, …]} value={v} onChange={setV} />
 */
export const Segmented = ({ options, value, onChange, label, className = '' }) => {
  const refs = useRef([]);
  const onKeyDown = (e, index) => {
    const next = nextIndex(e.key, index, options.length);
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  const current = options.findIndex((o) => o.value === value);
  return (
    <div role="radiogroup" aria-label={label} className={cx('ui-segmented', className)}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (current === -1 && i === 0) ? 0 : -1}
            className="ui-segment"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
};
Segmented.propTypes = {
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.node.isRequired })).isRequired,
  value: PropTypes.string, onChange: PropTypes.func.isRequired, label: PropTypes.string.isRequired, className: PropTypes.string,
};
