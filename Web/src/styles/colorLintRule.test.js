/**
 * The colour rule: literals are flagged, token references are not.
 */
import { afterAll, describe, it } from 'vitest';
import { RuleTester } from 'eslint';

// RuleTester builds its own describe/it blocks; hand it vitest's.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.afterAll = afterAll;
import rule from '../../eslint-rules/no-hardcoded-colors.js';

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } } });

describe('design-system/no-hardcoded-colors: literals are flagged, token references are not', () => {
  tester.run('no-hardcoded-colors', rule, {
      valid: [
        "const a = { color: 'rgb(var(--accent-fg))' };",
        "const b = { background: 'rgb(var(--ink) / 0.06)' };",
        "const c = { color: 'var(--fg-secondary)' };",
      ],
      invalid: [
        { code: "const d = { color: '#FF6B00' };", errors: 1 },
        { code: "const e = { background: 'rgba(239,68,68,0.1)' };", errors: 1 },
        { code: "const f = { background: 'rgb(var(--ink) / 0.1), rgba(0,0,0,0.5)' };", errors: 1 },
      ],
  });
});
