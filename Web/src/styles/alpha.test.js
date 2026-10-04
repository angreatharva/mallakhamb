import { describe, expect, it } from 'vitest';
import { alpha } from './tokens';

describe('alpha()', () => {
  it('returns exactly what `${hex}NN` concatenation produced, so dark stays pixel-identical', () => {
    expect(alpha('#FF6B00', 0x0A)).toBe('#FF6B000A');
    expect(alpha('#8B5CF6', 0x4D)).toBe('#8B5CF64D');
    expect(alpha('#22c55e', 0xFF)).toBe('#22c55eFF');
    expect(alpha('#0A0A0A', 0x00)).toBe('#0A0A0A00');
  });

  it('keeps any other hex spelling byte-for-byte, as the concatenation did', () => {
    expect(alpha('#fff', 0x14)).toBe('#fff14');
  });

  it('applies the byte as an alpha channel to an rgb(var(--x)) token', () => {
    expect(alpha('rgb(var(--accent))', 0x33)).toBe(`rgb(var(--accent) / ${0x33 / 255})`);
  });

  it('wraps anything else in color-mix instead of emitting invalid CSS', () => {
    expect(alpha('var(--accent-hex)', 0x80)).toBe(`color-mix(in srgb, var(--accent-hex) ${(0x80 / 255) * 100}%, transparent)`);
  });

  it('passes a missing colour through the way concatenation did', () => {
    expect(alpha(undefined, 0x20)).toBe('undefined20');
    expect(alpha(null, 0x20)).toBe('null20');
  });

  /*
   * Deliberately NOT corrected here. Several callers hand this an rgba()
   * (the "completed" status colour in CompetitionSelector, CompetitionDisplay
   * and CompetitionSelectionScreen; ThemeProvider's primaryDark in
   * CoachOrnament). Concatenation made that invalid CSS, which the browser
   * dropped — those badges have rendered with no tint or border all along.
   * Emitting a valid colour would change what users see, and the foundation
   * phase promises zero pixel change; each caller is fixed in its own
   * per-file pass instead.
   */
  it('keeps the legacy (invalid) result for a literal rgba()', () => {
    expect(alpha('rgba(255,255,255,0.3)', 0x15)).toBe('rgba(255,255,255,0.3)15');
  });
});
