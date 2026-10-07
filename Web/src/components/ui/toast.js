/**
 * react-hot-toast options in the look (design-language PLAN §6): a panel on
 * the overlay surface with a 3px status rule on the left. The styles are in
 * toast.css (react-hot-toast sets inline styles, hence its `!important`s);
 * the icon colours are CSS variables, so the look and the appearance restyle
 * every toast. Applied by App.jsx's <Toaster> (Phase 4).
 */

export const toastOptions = {
  className: 'ui-toast',
  success: { className: 'ui-toast ui-toast--success', iconTheme: { primary: 'var(--toast-success)', secondary: 'var(--toast-surface)' } },
  error: { className: 'ui-toast ui-toast--error', iconTheme: { primary: 'var(--toast-danger)', secondary: 'var(--toast-surface)' } },
  loading: { className: 'ui-toast ui-toast--loading' },
};
