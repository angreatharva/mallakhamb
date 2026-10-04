/**
 * The ambient background glow, in one place and inside its own clip.
 *
 * Six pages had each declared their own near-identical `Orb`, dropped it
 * straight into the page root, and positioned it with `left: <x>%` plus
 * `translate(-50%, -50%)`. An orb at x=95 therefore hangs half its width past
 * the right edge, which is fine to LOOK at — it is a blurred radial gradient
 * that fades to transparent — but it still counts as layout, so the document
 * grew sideways and every one of those pages scrolled horizontally. Measured
 * on the judge pages that was 1668px of scroll width inside a 1440px window,
 * so it was never only a phone problem.
 *
 * Two things fix it, and both live here so no page can reintroduce them:
 *   - the orbs render into an `inset-0 overflow-hidden` layer, so decoration
 *     can never extend the document at any width;
 *   - sizes scale down on small screens, so a 400px orb on a 320px phone is a
 *     deliberate wash of colour rather than a clipped blob.
 *
 * The scaling is CSS, not JavaScript: `--orb-scale` is set by media query in
 * index.css and multiplied in here. Nothing about a decorative gradient needs
 * a resize listener or a re-render, and keeping the hook out means this can be
 * rendered by pages whose tests mock the responsive module.
 *
 * Purely decorative: `aria-hidden`, `pointer-events-none`, and nothing at all
 * when the user asks for reduced motion.
 */

import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { useReducedMotion } from '@/hooks/useResponsive';
import { alpha } from '@/styles/tokens';

// The recipes are hex bytes ('44'); alpha() appends them to a hex colour exactly as the
// old `${color}${byte}` did, and also understands a token colour, which concatenation broke.
const tint = (color, byte) => alpha(color, parseInt(byte, 16));

const Orb = ({ x, y, size, color, delay = 0, duration = 8, blur = 80, intensity }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{
      left: `${x}%`,
      top: `${y}%`,
      // `--orb-scale` defaults to 1, so a page that never loads the stylesheet
      // still gets the authored desktop size rather than a zero-width orb.
      width: `calc(${size}px * var(--orb-scale, 1))`,
      height: `calc(${size}px * var(--orb-scale, 1))`,
      background: `radial-gradient(circle at 35% 35%, ${tint(color, intensity.inner)}, ${tint(color, intensity.outer)}, transparent 70%)`,
      filter: `blur(calc(${blur}px * var(--orb-scale, 1)))`,
      transform: 'translate(-50%, -50%)',
    }}
    animate={{ y: [0, -25, 0], scale: [1, 1.08, 1], opacity: [0.25, 0.5, 0.25] }}
    transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
  />
);

Orb.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  size: PropTypes.number.isRequired,
  color: PropTypes.string.isRequired,
  delay: PropTypes.number,
  duration: PropTypes.number,
  blur: PropTypes.number,
  intensity: PropTypes.object.isRequired,
};

/**
 * Pre-existing opacity recipes, kept so the swap is visually identical.
 * `soft` matches what the judge pages and the auth screens drew; `strong` is
 * the brighter mix the marketing hero used.
 */
export const ORB_INTENSITY = {
  soft: { inner: '44', outer: '11' },
  faint: { inner: '33', outer: '0A' },
  warm: { inner: '55', outer: '15' },
  strong: { inner: '88', outer: '22' },
};

/**
 * @param {Object}   props
 * @param {Array}    props.orbs      `{x, y, size, color, delay, duration, blur}` — percentages and px.
 * @param {Object}   [props.intensity] one of ORB_INTENSITY.
 * @param {string}   [props.className] extra classes on the clipping layer.
 * @param {number}   [props.zIndex]  defaults to 0, i.e. behind page content.
 */
const AmbientOrbs = ({ orbs, intensity = ORB_INTENSITY.soft, className = '', zIndex = 0 }) => {
  const reduced = useReducedMotion();
  if (reduced) return null;

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      style={{ zIndex }}
      aria-hidden="true"
    >
      {orbs.map((orb, i) => (
        <Orb key={i} {...orb} intensity={intensity} />
      ))}
    </div>
  );
};

AmbientOrbs.propTypes = {
  orbs: PropTypes.arrayOf(PropTypes.object).isRequired,
  intensity: PropTypes.object,
  className: PropTypes.string,
  zIndex: PropTypes.number,
};

export default AmbientOrbs;
