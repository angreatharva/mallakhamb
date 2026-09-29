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
});
