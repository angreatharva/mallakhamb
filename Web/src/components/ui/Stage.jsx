import PropTypes from 'prop-types';
import '@/styles/look-fonts';

/**
 * Film grain over a stage screen. Decorative; never on working screens (§5.7).
 * `local` keeps it inside its positioned parent (the sign-in stage side)
 * instead of over the whole viewport.
 */
export const Grain = ({ local = false }) => (
  <div className={local ? 'ui-grain ui-grain--local' : 'ui-grain'} aria-hidden="true" />
);
Grain.propTypes = { local: PropTypes.bool };
