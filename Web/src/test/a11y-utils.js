import userEvent from '@testing-library/user-event';

/**
 * Keyboard navigation helper.
 * Tabs through the provided elements and asserts focus order.
 */
export const testKeyboardNav = async (elements, options = {}) => {
  const { reverse = false } = options;
  const user = userEvent.setup();

  if (!elements || elements.length < 2) {
    throw new Error('testKeyboardNav expects at least two focusable elements');
  }

  const first = reverse ? elements[elements.length - 1] : elements[0];
  first.focus();
  expect(first).toHaveFocus();

  for (let i = 1; i < elements.length; i += 1) {
    await user.tab({ shift: reverse });
    const expected = reverse ? elements[elements.length - 1 - i] : elements[i];
    expect(expected).toHaveFocus();
  }
};

const normalizeHex = (hex) => {
  if (!hex || typeof hex !== 'string') {
    throw new Error(`Invalid color value: ${String(hex)}`);
  }

  const value = hex.trim().replace('#', '');
  if (value.length === 3) {
    return value
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }

  if (value.length !== 6) {
    throw new Error(`Expected hex color, got: ${hex}`);
  }

  return value;
};

const toRgb = (hex) => {
  const n = normalizeHex(hex);
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
};

const toLuminance = ({ r, g, b }) => {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const R = channel(r);
  const G = channel(g);
  const B = channel(b);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};

export const getContrastRatio = (foregroundHex, backgroundHex) => {
  const l1 = toLuminance(toRgb(foregroundHex));
  const l2 = toLuminance(toRgb(backgroundHex));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
};

export const expectContrastAtLeast = (foregroundHex, backgroundHex, minRatio = 4.5) => {
  const ratio = getContrastRatio(foregroundHex, backgroundHex);
  expect(ratio).toBeGreaterThanOrEqual(minRatio);
};

