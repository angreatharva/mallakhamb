/**
 * Colour maths for the look tests and the generator: parse the CSS colour forms
 * the packs use, composite a translucent colour over a surface, WCAG contrast.
 * No DOM — the contrast matrix runs in milliseconds without a browser.
 */

/** '#abc' | '#aabbcc' → [r, g, b] */
export const hexToRgb = (hex) => {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

/** '#ff6b00' → '255 107 0'; a triplet passes through. */
export const toTriplet = (value) => {
  const v = String(value).trim();
  return v.startsWith('#') ? hexToRgb(v).join(' ') : v;
};

const num = (s) => {
  const t = s.trim();
  return t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t);
};

/**
 * Parse a fully resolved colour (no var()) into { r, g, b, a }.
 * Accepts: 'r g b', '#hex', 'rgb(r g b)', 'rgb(r g b / a)', 'rgba(r, g, b, a)',
 * 'rgb(r, g, b)'.
 */
export const parseColor = (value) => {
  const v = String(value).trim();
  if (v.startsWith('#')) {
    const [r, g, b] = hexToRgb(v);
    return { r, g, b, a: 1 };
  }
  let m = v.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: 1 };
  m = v.match(/^rgba?\(\s*([^)]*)\)$/i);
  if (m) {
    const body = m[1];
    let parts;
    let alpha = '1';
    if (body.includes('/')) {
      const [rgb, a] = body.split('/');
      parts = rgb.trim().split(/[\s,]+/);
      alpha = a;
    } else {
      parts = body.split(/[\s,]+/).filter(Boolean);
      if (parts.length === 4) alpha = parts.pop();
    }
    // `rgb(r g b / a)` where the channels came from one substituted triplet.
    if (parts.length === 3) return { r: num(parts[0]), g: num(parts[1]), b: num(parts[2]), a: num(alpha) };
  }
  throw new Error(`Unparseable colour: ${value}`);
};

/** Composite a (possibly translucent) colour over an opaque one. */
export const composite = (top, under) => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});

const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG 2.x contrast ratio of `fg` over an opaque `bg` (fg composited first). */
export const contrast = (fg, bg) => {
  const top = fg.a < 1 ? composite(fg, bg) : fg;
  const l1 = luminance(top);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/** { r, g, b } → '#rrggbb' */
export const toHex = ({ r, g, b }) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
