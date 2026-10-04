import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Colour hygiene gate (plan §18, R8).
 *
 * `${COLORS.saffron}0A` — a hex token with two alpha digits glued on — only
 * works while the token is a six-digit hex. The day it becomes a CSS variable
 * the result is `var(--accent)0A`: invalid, silently dropped, and the
 * background simply vanishes with no error anywhere. Use `alpha(X, 0x0A)`
 * from styles/tokens, which is byte-identical for hex and correct for tokens.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONCATENATION = /\$\{[A-Za-z_$][A-Za-z0-9_$.?]*(?:\[[^\]]+\])?\}[0-9A-Fa-f]{2}(?![0-9A-Za-z])/g;

const sourceFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return /\.(jsx?|mjs)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name) ? [path] : [];
});

describe('colour hygiene', () => {
  it('has no hex + alpha string concatenation left in src/', () => {
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const lines = readFileSync(file, 'utf8').split('\n');
      return lines.flatMap((line, i) =>
        (line.match(CONCATENATION) || []).map((hit) => `${relative(SRC, file)}:${i + 1}  ${hit}`));
    });
    expect(offenders).toEqual([]);
  });

  /*
   * Phases 3–9 spelled ink `white` (a transitional Tailwind alias) and Phase 9.4
   * renamed every use. `white` is white again, so a new `text-white` would be
   * literal white — invisible on the light page. Ink is `*-ink`; text that must
   * stay white on a photo or a saturated fill is `snow`. Comment lines may still
   * name the old utilities when they record history.
   */
  it('uses ink or snow, never the retired white utilities', () => {
    const WHITE = /(^|[\s"'`{(:])(?:[a-z0-9-]+:)*(?:text|bg|border(?:-[trblxy])?|placeholder|ring(?:-offset)?|divide|from|via|to|fill|stroke|outline|decoration|caret|accent|shadow)-white(?=[\s"'`/}\]):;,]|$)/;
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const lines = readFileSync(file, 'utf8').split('\n');
      return lines.flatMap((line, i) =>
        (!/^\s*(\*|\/\/|\/\*)/.test(line) && WHITE.test(line) ? [`${relative(SRC, file)}:${i + 1}  ${line.trim().slice(0, 80)}`] : []));
    });
    expect(offenders).toEqual([]);
  });
});
