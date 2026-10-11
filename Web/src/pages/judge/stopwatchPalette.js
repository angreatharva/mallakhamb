/**
 * The stopwatch island's palette (design-language PLAN §8.6): Apple's system
 * colours, the same in every look and appearance. StopwatchFace draws with
 * these; the Time Keeper screen's footer under the dial uses them too, so the
 * island reads as one object. Exempt from the token lint on purpose.
 */
export const STOPWATCH = Object.freeze({
  green: '#30D158',
  red: '#FF453A',
  yellow: '#FFD60A',
});
