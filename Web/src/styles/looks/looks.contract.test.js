/**
 * Every look keeps the contract (src/styles/looks/contract.js): every token,
 * for every role and appearance, of the right type — and the places outside
 * the packs that restate a look value agree with it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPEARANCES, APPEARANCE_TOKENS, LOOK_TOKENS, ROLES, ROLE_TOKENS } from './contract.js';
import { DEFAULT_LOOK_ID, LOOK_IDS, resolvedLooks } from './index.js';
import { appearanceTokens, lookTokens, resolveTokens, roleVars, tokenHex } from './build.js';
import { parseColor } from './color.js';
import { THEME_COLOR } from '@/utils/ui/appearance';
import { DEFAULT_LOOK, KNOWN_LOOKS } from '@/utils/ui/look';

const looks = resolvedLooks();
const TRIPLET = /^\d{1,3} \d{1,3} \d{1,3}$/;

const checkType = (type, value) => {
  switch (type) {
    case 'triplet': return TRIPLET.test(value);
    case 'alpha': return Number(value) >= 0 && Number(value) <= 1;
    case 'color': try { parseColor(value); return true; } catch { return false; }
    case 'length': return /^(0|-?\d*\.?\d+(px|rem|em))$/.test(value);
    case 'duration': return /^\d*\.?\d+(ms|s)$/.test(value);
    case 'easing': return /^(linear|ease(-in|-out|-in-out)?|cubic-bezier\([^)]*\))$/.test(value);
    case 'font': return value.trim().length > 0 && !value.includes(';');
    default: return value.trim().length > 0 && !value.includes(';');
  }
};

describe.each(looks.map((look) => [look.id, look]))('look "%s"', (id, look) => {
  it('defines every role token for every role and appearance', () => {
    for (const role of ROLES) {
      const names = roleVars(look, role).map(([name]) => name);
      for (const appearance of APPEARANCES) {
        for (const key of Object.keys(ROLE_TOKENS)) {
          const name = key.startsWith('accent') ? key.replace('accent', `role-${appearance}`) : key.replace('ident', `ident-${appearance}`);
          expect(names, `${id}: roles.${role}.${appearance}.${key}`).toContain(name);
        }
      }
    }
  });

  it.each(APPEARANCES)('defines every appearance token in %s', (appearance) => {
    const defined = Object.fromEntries(appearanceTokens(look, appearance));
    const missing = Object.keys(APPEARANCE_TOKENS).filter((name) => !(name in defined));
    expect(missing, `${id}.${appearance} is missing`).toEqual([]);
  });

  it('defines every look token', () => {
    const defined = Object.fromEntries(lookTokens(look));
    expect(Object.keys(LOOK_TOKENS).filter((name) => !(name in defined))).toEqual([]);
  });

  it.each(APPEARANCES)('resolves every token to a value of its type in %s, for every role', (appearance) => {
    const wrong = [];
    for (const role of ROLES) {
      const resolved = resolveTokens(look, appearance, role);
      for (const [name, { type }] of Object.entries({ ...APPEARANCE_TOKENS, ...LOOK_TOKENS })) {
        if (!checkType(type, resolved[name])) wrong.push(`${role}: --${name} (${type}) = ${resolved[name]}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('the look registry and the places that restate it', () => {
  it('knows the same looks at runtime as the generator compiles', () => {
    expect([...KNOWN_LOOKS].sort()).toEqual([...LOOK_IDS].sort());
    expect(DEFAULT_LOOK).toBe(DEFAULT_LOOK_ID);
  });

  it('sets the default look before first paint (public/appearance-init.js)', () => {
    const init = readFileSync(resolve(__dirname, '../../../public/appearance-init.js'), 'utf8');
    expect(init).toContain(`root.setAttribute('data-look', '${DEFAULT_LOOK_ID}')`);
  });

  it("paints the browser chrome in the default look's page colour", () => {
    const def = looks.find((look) => look.id === DEFAULT_LOOK_ID);
    const init = readFileSync(resolve(__dirname, '../../../public/appearance-init.js'), 'utf8');
    for (const appearance of APPEARANCES) {
      const bg = tokenHex(def, appearance, 'bg');
      expect(THEME_COLOR[appearance].toLowerCase()).toBe(bg);
      expect(init.toLowerCase()).toContain(bg);
    }
  });
});
