/**
 * Charts — hand-built SVG/HTML on the design tokens (docs/stats-plan.md §6).
 * No chart library: every mark reads a `--viz-*` token, every word an ink
 * token, and every chart has a table view, keyboard access and reduced motion.
 */
export { default as ChartCard } from './ChartCard';
export { default as Legend } from './Legend';
export { default as LineChart } from './LineChart';
export { default as StackedBars } from './StackedBars';
export { default as BulletMeter } from './BulletMeter';
export { default as Heatmap } from './Heatmap';
export { default as LeanRows } from './LeanRows';
export { default as PanelStrip } from './PanelStrip';
export { default as Sparkline } from './Sparkline';
export { default as StatTile } from './StatTile';
export * from './chartTheme';
