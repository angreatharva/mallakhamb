import { SCREENS, WIDE_CONTAINER_MIN, Z_INDEX } from './src/styles/breakpoints.js';

const px = (n) => `${n}px`;

/** Below `md`: the phone band. One definition, so 767 cannot drift again. */
const PHONE = `@media (max-width: ${SCREENS.md - 1}px)`;

/** `rgb(var(--x) / <alpha-value>)` — a token that still takes `/50` modifiers. */
const channel = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  /*
   * Appearance (dark | light) is carried by `html[data-appearance]` and almost
   * everything follows it through the colour tokens below, not through
   * variants. `dark:` exists for the rare case that genuinely needs a different
   * class; it matches the attribute, never the OS setting.
   */
  darkMode: ['selector', '[data-appearance="dark"]'],
  theme: {
    // Tailwind's own five, from the single source in src/styles/breakpoints.js.
    screens: Object.fromEntries(Object.entries(SCREENS).map(([name, width]) => [name, px(width)])),
    extend: {
      colors: {
        /*
         * TRANSITIONAL (plan §14.5, removed in Phase 9): `white` means INK —
         * white in dark, near-black in light. With `--ink: 255 255 255` every
         * existing `text-white/NN`, `bg-white/NN` and `border-white/NN` renders
         * exactly as before in dark, and light is legible before each file has
         * been migrated to the semantic names. Text that must stay white on
         * any background (a label on a photo or a saturated fill) is `snow`.
         */
        white: channel('ink'),
        snow: '#ffffff',

        // Semantic surfaces and ink (index.css defines both appearances).
        bg: channel('bg'),
        surface: {
          DEFAULT: channel('surface'),
          raised: channel('surface-raised'),
          sunken: channel('surface-sunken'),
          overlay: channel('surface-overlay'),
        },
        fg: {
          DEFAULT: 'var(--fg)',
          secondary: 'var(--fg-secondary)',
          muted: 'var(--fg-muted)',
          subtle: 'var(--fg-subtle)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        scrim: 'var(--scrim)',

        // Role accent (per `html[data-role]`, per appearance).
        accent: {
          DEFAULT: channel('accent'),
          fg: channel('accent-fg'),
        },
        'on-accent': channel('on-accent'),

        // Status, each with text, fill, label-on-fill and tint.
        ...Object.fromEntries(['success', 'warning', 'danger', 'info'].map((status) => [status, {
          fg: channel(`${status}-fg`),
          fill: channel(`${status}-fill`),
          on: channel(`${status}-on`),
          tint: `var(--${status}-tint)`,
        }])),

        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        secondary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Enhanced responsive spacing system
      spacing: {
        'touch-target': '44px',      // Minimum touch target size
        'touch-target-lg': '48px',   // Recommended touch target size
        'mobile-padding': '1rem',    // Mobile container padding
        'tablet-padding': '1.5rem',  // Tablet container padding
        'desktop-padding': '2rem',   // Desktop container padding
        'mobile-gap': '0.75rem',     // Mobile grid/flex gap
        'tablet-gap': '1rem',        // Tablet grid/flex gap
        'desktop-gap': '1.5rem',     // Desktop grid/flex gap
        'section-mobile': '2rem',    // Mobile section spacing
        'section-tablet': '3rem',    // Tablet section spacing
        'section-desktop': '4rem',   // Desktop section spacing
      },
      // Responsive typography scale
      fontSize: {
        'hero-mobile': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'hero-tablet': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'hero-desktop': ['4rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'h1-mobile': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'h1-tablet': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'h1-desktop': ['2.5rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'body-mobile': ['1rem', { lineHeight: '1.6' }],
        'body-tablet': ['1.125rem', { lineHeight: '1.6' }],
        'body-desktop': ['1.125rem', { lineHeight: '1.7' }],
      },
      // Enhanced responsive container sizes
      maxWidth: {
        'mobile': '100%',
        'mobile-content': '480px',
        'tablet': '768px',
        'tablet-content': '900px',
        'desktop': '1200px',
        'desktop-wide': '1440px',
        'desktop-max': '1920px',
      },
      /*
       * One stacking scale (src/styles/breakpoints.js), as `z-sticky`,
       * `z-modal`, … reading the `--z-*` custom properties index.css defines.
       * Tailwind's numeric `z-10`…`z-50` remain until each file is migrated.
       */
      zIndex: Object.fromEntries(Object.keys(Z_INDEX).map((name) => [name, `var(--z-${name})`])),
    },
  },
  plugins: [
    // Enhanced plugin for responsive utilities
    function({ addBase, addUtilities, addComponents, theme }) {
      // The stacking scale as custom properties, from the same table as the
      // `z-*` utilities, so CSS and JS read one set of numbers.
      addBase({
        ':root': Object.fromEntries(Object.entries(Z_INDEX).map(([name, value]) => [`--z-${name}`, String(value)])),
      });

      const newUtilities = {
        /*
         * 44px, but ONLY where a finger is the pointer.
         *
         * A control that shows an icon AND a label on desktop collapses to the
         * icon alone on mobile (`hidden sm:inline`) and lands at ~36px. This
         * sizes exactly that case, and stops at the `md` breakpoint so desktop
         * keeps its own metrics. (It replaced an always-on `.touch-target`,
         * which no screen could adopt because it inflated the compact desktop
         * toolbars; that utility had no users left and is gone.)
         */
        '.tap-safe': {
          [PHONE]: {
            minHeight: theme('spacing.touch-target'),
            minWidth: theme('spacing.touch-target'),
          },
        },

        /*
         * The dialog shell, in one place.
         *
         * Seventeen modals had each written `fixed inset-0 flex items-center
         * justify-center p-4`, and all but one of them omitted any scrolling.
         * A dialog taller than the window — which on a 375x812 phone means
         * most of the forms — was simply cut off, with its Save and Cancel
         * buttons below the fold and no way to reach them.
         *
         * Centring with `align-items: center` is the trap: once the panel is
         * taller than the scroll box, the overflow goes off the TOP and the
         * browser will not scroll to it. `flex-start` plus auto block margins
         * on the panel gives both behaviours from one rule — the margins
         * absorb the slack and centre it while it fits, and collapse to zero
         * when it does not, leaving the whole panel reachable.
         */
        '.modal-overlay': {
          position: 'fixed',
          inset: '0',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          overflowY: 'auto',
          // Keep a flick at the end of the dialog from scrolling the page behind it.
          overscrollBehavior: 'contain',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        },

        '.modal-panel': {
          marginTop: 'auto',
          marginBottom: 'auto',
        },

        /*
         * A data table that becomes a list of labelled cards on phones.
         *
         * The brief's rule for tables is that `overflow-x: auto` is a last
         * resort, not the answer — and on the management screens it was the
         * answer to nine columns, which meant dragging sideways past eight of
         * them to reach the Actions column. Stacking keeps every column
         * (nothing is hidden, which a priority-columns approach would do) and
         * pairs each value with its header, so a row reads top-to-bottom.
         *
         * Rows carry the card border, so the internal borders come off. Above
         * `md` none of this applies and the table is untouched.
         *
         * Colours are ink at the alphas the dark design used, so the cards
         * follow the appearance.
         *
         * NO BORDER, and that is what has always rendered: the rule used to be
         * `1px solid ${theme('colors.white')}14`, and `colors.white` is `#fff`,
         * so it produced `#fff14` — five hex digits, invalid, and the whole
         * declaration was dropped. Making it valid adds a 1px border and moves
         * every card's content by a pixel, which the foundation phase must not
         * do. Whether the cards should have the hairline is a Phase 5 call.
         */
        '.stacked-table': {
          [PHONE]: {
            display: 'block',
            '& thead': {
              // Headers move into each cell via `data-label`, so the row of
              // them is redundant — clipped rather than `display: none` so it
              // stays available to screen readers.
              position: 'absolute',
              width: '1px',
              height: '1px',
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              whiteSpace: 'nowrap',
            },
            '& tbody': { display: 'block' },
            '& tr': {
              display: 'block',
              borderRadius: theme('borderRadius.2xl'),
              background: 'rgb(var(--ink) / 0.03)',
              padding: theme('spacing.3'),
              marginBottom: theme('spacing.3'),
            },
            '& td': {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: theme('spacing.3'),
              padding: `${theme('spacing.1')} 0`,
              textAlign: 'right',
              border: 'none',
            },
            '& td::before': {
              content: 'attr(data-label)',
              flexShrink: '0',
              textAlign: 'left',
              fontSize: theme('fontSize.xs[0]'),
              fontWeight: theme('fontWeight.bold'),
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgb(var(--ink) / 0.35)',
            },
            // A cell with no header (the actions column is often unlabelled)
            // gets the full width rather than an empty gutter.
            '& td[data-label=""]::before, & td:not([data-label])::before': {
              content: 'none',
            },
          },
        },

        // Enhanced mobile-first container utilities
        '.container-responsive': {
          width: '100%',
          paddingLeft: theme('spacing.mobile-padding'),
          paddingRight: theme('spacing.mobile-padding'),
          '@screen md': {
            paddingLeft: theme('spacing.tablet-padding'),
            paddingRight: theme('spacing.tablet-padding'),
          },
          '@screen lg': {
            paddingLeft: theme('spacing.desktop-padding'),
            paddingRight: theme('spacing.desktop-padding'),
          },
        },

        '.container-centered': {
          width: '100%',
          marginLeft: 'auto',
          marginRight: 'auto',
          paddingLeft: theme('spacing.mobile-padding'),
          paddingRight: theme('spacing.mobile-padding'),
          '@screen md': {
            maxWidth: theme('maxWidth.tablet-content'),
            paddingLeft: theme('spacing.tablet-padding'),
            paddingRight: theme('spacing.tablet-padding'),
          },
          '@screen lg': {
            maxWidth: theme('maxWidth.desktop'),
            paddingLeft: theme('spacing.desktop-padding'),
            paddingRight: theme('spacing.desktop-padding'),
          },
          [`@media (min-width: ${WIDE_CONTAINER_MIN}px)`]: {
            maxWidth: theme('maxWidth.desktop-wide'),
          },
        },

        // Enhanced responsive text utilities
        '.text-responsive-hero': {
          fontSize: theme('fontSize.hero-mobile[0]'),
          lineHeight: theme('fontSize.hero-mobile[1].lineHeight'),
          letterSpacing: theme('fontSize.hero-mobile[1].letterSpacing'),
          '@screen md': {
            fontSize: theme('fontSize.hero-tablet[0]'),
            lineHeight: theme('fontSize.hero-tablet[1].lineHeight'),
            letterSpacing: theme('fontSize.hero-tablet[1].letterSpacing'),
          },
          '@screen lg': {
            fontSize: theme('fontSize.hero-desktop[0]'),
            lineHeight: theme('fontSize.hero-desktop[1].lineHeight'),
            letterSpacing: theme('fontSize.hero-desktop[1].letterSpacing'),
          },
        },

        '.text-responsive-h1': {
          fontSize: theme('fontSize.h1-mobile[0]'),
          lineHeight: theme('fontSize.h1-mobile[1].lineHeight'),
          letterSpacing: theme('fontSize.h1-mobile[1].letterSpacing'),
          '@screen md': {
            fontSize: theme('fontSize.h1-tablet[0]'),
            lineHeight: theme('fontSize.h1-tablet[1].lineHeight'),
            letterSpacing: theme('fontSize.h1-tablet[1].letterSpacing'),
          },
          '@screen lg': {
            fontSize: theme('fontSize.h1-desktop[0]'),
            lineHeight: theme('fontSize.h1-desktop[1].lineHeight'),
            letterSpacing: theme('fontSize.h1-desktop[1].letterSpacing'),
          },
        },

        '.text-responsive-body': {
          fontSize: theme('fontSize.body-mobile[0]'),
          lineHeight: theme('fontSize.body-mobile[1].lineHeight'),
          '@screen md': {
            fontSize: theme('fontSize.body-tablet[0]'),
            lineHeight: theme('fontSize.body-tablet[1].lineHeight'),
          },
          '@screen lg': {
            fontSize: theme('fontSize.body-desktop[0]'),
            lineHeight: theme('fontSize.body-desktop[1].lineHeight'),
          },
        },

        // Enhanced layout utilities
        '.grid-responsive-auto': {
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: theme('spacing.mobile-gap'),
          '@screen md': {
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: theme('spacing.tablet-gap'),
          },
          '@screen lg': {
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: theme('spacing.desktop-gap'),
          },
        },

        '.grid-responsive-cards': {
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: theme('spacing.mobile-gap'),
          '@screen sm': {
            gridTemplateColumns: 'repeat(2, 1fr)',
          },
          '@screen lg': {
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: theme('spacing.desktop-gap'),
          },
          '@screen xl': {
            gridTemplateColumns: 'repeat(4, 1fr)',
          },
        },

        '.flex-responsive-stack': {
          display: 'flex',
          flexDirection: 'column',
          gap: theme('spacing.mobile-gap'),
          '@screen md': {
            flexDirection: 'row',
            gap: theme('spacing.tablet-gap'),
          },
          '@screen lg': {
            gap: theme('spacing.desktop-gap'),
          },
        },
      };

      // Add responsive component classes
      const responsiveComponents = {
        '.responsive-container': {
          '@apply container-responsive': {},
        },
        '.responsive-grid': {
          '@apply grid-responsive-auto': {},
        },
        '.responsive-flex': {
          '@apply flex-responsive-stack': {},
        },
        '.responsive-text': {
          '@apply text-responsive-body': {},
        },
      };

      addUtilities(newUtilities);
      addComponents(responsiveComponents);
    },
  ],
}
