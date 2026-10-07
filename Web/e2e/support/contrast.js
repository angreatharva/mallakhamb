/**
 * WCAG 1.4.3 text contrast over the real background stack — shared by
 * e2e/contrast-audit.spec.js (every route) and e2e/look-specimen.spec.js.
 *
 * For each visible element with text of its own, composite its colour (with
 * every ancestor's opacity) over the backgrounds beneath it and compare with
 * 4.5:1, or 3:1 for large text (24px, or 18.66px bold). Disabled controls are
 * exempt; text over a gradient or image is counted "unmeasured", never guessed.
 */

/** @returns {Promise<{checked: number, unmeasured: number, failures: object[]}>} */
export const auditContrast = (page) => page.evaluate(() => {
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const c = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const name = (el) => `${el.tagName.toLowerCase()}${[...el.classList].slice(0, 3).map((c) => `.${c}`).join('')}`;

  const rootBg = parse(getComputedStyle(document.body).backgroundColor);
  const htmlBg = parse(getComputedStyle(document.documentElement).backgroundColor);
  const base = rootBg && rootBg.a > 0 ? rootBg : htmlBg && htmlBg.a > 0 ? htmlBg : { r: 255, g: 255, b: 255, a: 1 };

  const failures = []; let checked = 0; let unmeasured = 0;
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!rect.width || !rect.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('[aria-hidden="true"], .sr-only, :disabled, [aria-disabled="true"], option')) continue;

    let opacity = 1; const layers = []; let complex = false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      opacity *= Number(s.opacity);
      if (s.backgroundImage && s.backgroundImage !== 'none') { complex = true; break; }
      // A dark island with no background of its own sits over a photo or a sibling (the hero's navbar).
      if (n.hasAttribute('data-appearance') && !layers.some((l) => l.a >= 1)) {
        const own = parse(s.backgroundColor);
        if (!own || own.a < 1) { complex = true; break; }
      }
      const bg = parse(s.backgroundColor);
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 1) break; }
    }
    if (opacity < 0.05) continue;
    if (complex) { unmeasured += 1; continue; }
    let bg = base;
    for (const layer of layers.reverse()) bg = over(layer, bg);
    const fg0 = parse(cs.color);
    if (!fg0) continue;
    const fg = over({ ...fg0, a: fg0.a * opacity }, bg);
    const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ratio(fg, bg);
    checked += 1;
    if (r < need) failures.push({ el: name(el), text: el.textContent.trim().slice(0, 36), ratio: +r.toFixed(2), need, fg: hex(fg), bg: hex(bg) });
  }
  return { checked, unmeasured, failures };
});

/**
 * Wait out every finite animation before reading colours: a toast still fading
 * in once read #484848 on #363636. Spinners (infinite) are ignored.
 */
export const waitForStillness = (page) => page.waitForFunction(() => document.getAnimations().every((a) => (
  a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity
)), null, { timeout: 5_000 }).catch(() => {});
