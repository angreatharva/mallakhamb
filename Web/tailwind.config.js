/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // Enhanced responsive breakpoints for the project
    screens: {
      'xs': '320px',        // Extra small mobile devices
      'mobile': '320px',    // Mobile baseline
      'mobile-lg': '480px', // Large mobile devices
      'sm': '640px',        // Small tablets and large phones
      'md': '768px',        // Tablets
      'tablet': '768px',    // Tablet baseline
      'lg': '1024px',       // Small desktops and laptops
      'xl': '1280px',       // Desktops
      'desktop': '1440px',  // Desktop baseline (preservation point)
      '2xl': '1536px',      // Large desktops
      'desktop-lg': '1920px', // Large desktop displays
    },
    extend: {
      colors: {
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
      // Animation improvements for responsive design
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'bounce-gentle': 'bounceGentle 2s infinite',
        'slide-in-mobile': 'slideInMobile 0.3s ease-out',
        'fade-in-up': 'fadeInUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        slideInMobile: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      // Z-index scale for layering
      zIndex: {
        'mobile-menu': '50',
        'modal': '100',
        'tooltip': '200',
      },
    },
  },
  plugins: [
    // Enhanced plugin for responsive utilities
    function({ addUtilities, addComponents, theme }) {
      const newUtilities = {
        // Enhanced touch target utilities
        '.touch-target': {
          minHeight: theme('spacing.touch-target'),
          minWidth: theme('spacing.touch-target'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        '.touch-target-lg': {
          minHeight: theme('spacing.touch-target-lg'),
          minWidth: theme('spacing.touch-target-lg'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },

        /*
         * 44px, but ONLY where a finger is the pointer.
         *
         * `.touch-target` above enforces the minimum at every width, which is
         * why the dense screens could not adopt it — it would inflate the
         * compact desktop toolbars the brief protects. The recurring defect is
         * narrower than that: a control that shows an icon AND a label on
         * desktop collapses to the icon alone on mobile (`hidden sm:inline`)
         * and lands at ~36px. This sizes exactly that case, and stops at the
         * `md` breakpoint so desktop keeps its own metrics.
         */
        '.tap-safe': {
          '@media (max-width: 767px)': {
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
         */
        '.stacked-table': {
          '@media (max-width: 767px)': {
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
              border: `1px solid ${theme('colors.white')}14`,
              background: 'rgba(255,255,255,0.03)',
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
              color: 'rgba(255,255,255,0.35)',
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
          '@screen desktop': {
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
        
        // Enhanced responsive image utilities
        '.responsive-img': {
          maxWidth: '100%',
          height: 'auto',
          display: 'block',
        },
        
        '.responsive-img-cover': {
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
        },
        
        '.responsive-img-contain': {
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center',
        },
        
        '.responsive-img-hero': {
          width: '100%',
          height: '100vh',
          objectFit: 'cover',
          objectPosition: 'center',
          '@screen md': {
            height: '80vh',
          },
          '@screen lg': {
            height: '100vh',
          },
        },
        
        '.responsive-img-card': {
          width: '100%',
          aspectRatio: '16 / 9',
          objectFit: 'cover',
          borderRadius: theme('borderRadius.lg'),
          '@screen md': {
            aspectRatio: '4 / 3',
          },
        },
        
        '.responsive-img-avatar': {
          width: theme('spacing.12'),
          height: theme('spacing.12'),
          borderRadius: '50%',
          objectFit: 'cover',
          '@screen md': {
            width: theme('spacing.16'),
            height: theme('spacing.16'),
          },
        },
        
        '.responsive-img-logo': {
          height: theme('spacing.8'),
          width: 'auto',
          objectFit: 'contain',
          '@screen md': {
            height: theme('spacing.12'),
          },
          '@screen lg': {
            height: theme('spacing.16'),
          },
        },
        
        // Responsive background image utilities
        '.responsive-bg-cover': {
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        },
        
        '.responsive-bg-contain': {
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        },
        
        // Image container utilities
        '.responsive-img-container': {
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
        },
        
        '.responsive-img-container-square': {
          aspectRatio: '1 / 1',
        },
        
        '.responsive-img-container-video': {
          aspectRatio: '16 / 9',
        },
        
        '.responsive-img-container-portrait': {
          aspectRatio: '3 / 4',
        },
        
        '.responsive-img-container-landscape': {
          aspectRatio: '4 / 3',
        },
        
        // Enhanced mobile utilities
        '.no-horizontal-scroll': {
          overflowX: 'hidden',
          maxWidth: '100vw',
        },
        
        '.mobile-full-width': {
          width: '100vw',
          marginLeft: 'calc(-50vw + 50%)',
          '@screen md': {
            width: 'auto',
            marginLeft: 'auto',
          },
        },
        
        // Enhanced mobile menu utilities
        '.mobile-menu-overlay': {
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: theme('zIndex.mobile-menu'),
          opacity: '0',
          visibility: 'hidden',
          transition: 'opacity 0.3s ease-in-out, visibility 0.3s ease-in-out',
        },
        
        '.mobile-menu-overlay.open': {
          opacity: '1',
          visibility: 'visible',
        },
        
        '.mobile-menu-panel': {
          position: 'fixed',
          top: '0',
          left: '0',
          height: '100vh',
          width: '280px',
          backgroundColor: theme('colors.white'),
          zIndex: theme('zIndex.mobile-menu'),
          transform: 'translateX(-100%)',
          transition: 'transform 0.3s ease-in-out',
          boxShadow: '2px 0 10px rgba(0, 0, 0, 0.1)',
        },
        
        '.mobile-menu-panel.open': {
          transform: 'translateX(0)',
        },
        
        // Enhanced responsive form utilities
        '.responsive-form-field': {
          marginBottom: theme('spacing.4'),
          '@screen md': {
            marginBottom: theme('spacing.6'),
          },
        },
        
        '.responsive-input': {
          display: 'block',
          width: '100%',
          padding: `${theme('spacing.3')} ${theme('spacing.3')}`,
          border: `1px solid ${theme('colors.gray.300')}`,
          borderRadius: theme('borderRadius.md'),
          boxShadow: theme('boxShadow.sm'),
          backgroundColor: theme('colors.white'),
          color: theme('colors.gray.900'),
          fontSize: theme('fontSize.base'),
          lineHeight: theme('lineHeight.6'),
          minHeight: theme('spacing.touch-target'),
          '&:focus': {
            outline: 'none',
            borderColor: 'transparent',
            boxShadow: `0 0 0 2px ${theme('colors.blue.500')}`,
          },
          '@screen md': {
            padding: `${theme('spacing.2')} ${theme('spacing.3')}`,
            fontSize: theme('fontSize.sm'),
            minHeight: 'auto',
          },
        },
        
        '.responsive-button': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: `${theme('spacing.3')} ${theme('spacing.4')}`,
          border: '1px solid transparent',
          borderRadius: theme('borderRadius.md'),
          fontSize: theme('fontSize.base'),
          fontWeight: theme('fontWeight.medium'),
          minHeight: theme('spacing.touch-target'),
          transition: 'colors 0.2s ease-in-out',
          '&:focus': {
            outline: 'none',
            boxShadow: `0 0 0 2px ${theme('colors.blue.500')}`,
          },
          '&:disabled': {
            opacity: '0.5',
            cursor: 'not-allowed',
          },
          '@screen md': {
            padding: `${theme('spacing.2')} ${theme('spacing.4')}`,
            fontSize: theme('fontSize.sm'),
            minHeight: 'auto',
          },
        },
        
        '.responsive-select': {
          display: 'block',
          width: '100%',
          padding: `${theme('spacing.3')} ${theme('spacing.3')}`,
          border: `1px solid ${theme('colors.gray.300')}`,
          borderRadius: theme('borderRadius.md'),
          boxShadow: theme('boxShadow.sm'),
          backgroundColor: theme('colors.white'),
          color: theme('colors.gray.900'),
          fontSize: theme('fontSize.base'),
          lineHeight: theme('lineHeight.6'),
          minHeight: theme('spacing.touch-target'),
          '&:focus': {
            outline: 'none',
            borderColor: 'transparent',
            boxShadow: `0 0 0 2px ${theme('colors.blue.500')}`,
          },
          '@screen md': {
            padding: `${theme('spacing.2')} ${theme('spacing.3')}`,
            fontSize: theme('fontSize.sm'),
            minHeight: 'auto',
          },
        },
        
        // Enhanced dropdown utilities
        '.mobile-dropdown': {
          '@media (max-width: 767px)': {
            position: 'fixed',
            left: '1rem',
            right: '1rem',
            width: 'auto',
            maxHeight: '50vh',
            zIndex: '100',
          },
        },
        
        // Responsive table utilities
        '.table-responsive': {
          overflowX: 'auto',
          '@screen md': {
            overflowX: 'visible',
          },
        },
        
        '.table-mobile-cards': {
          '@media (max-width: 767px)': {
            '& thead': {
              display: 'none',
            },
            '& tbody tr': {
              display: 'block',
              marginBottom: '1rem',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              padding: '1rem',
            },
            '& tbody td': {
              display: 'block',
              textAlign: 'right',
              paddingLeft: '50%',
              position: 'relative',
            },
            '& tbody td:before': {
              content: 'attr(data-label)',
              position: 'absolute',
              left: '1rem',
              width: '45%',
              textAlign: 'left',
              fontWeight: 'bold',
            },
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
