import React, { useState } from 'react';
import {
  DESIGN_TOKENS,
  getStatusColor,
  getRoleColor,
  getStatusBg,
  getRoleBg,
} from '../../../styles/tokens';

/**
 * DesignTokenAudit - Visual audit tool for design tokens
 * Displays all colors, spacing, typography, and other design tokens
 * with visual swatches and documentation
 *
 * **Validates: Requirements 14.3, 14.5, 14.6, 14.7**
 */
const DesignTokenAudit = () => {
  const [activeTab, setActiveTab] = useState('colors');

  return (
    <div
      style={{
        minHeight: '100vh',
        background: DESIGN_TOKENS.colors.surfaces.dark,
        color: DESIGN_TOKENS.colors.text.primary,
        padding: '32px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <header style={{ marginBottom: '48px' }}>
          <h1
            style={{
              fontSize: DESIGN_TOKENS.typography.fontSize['4xl'],
              fontWeight: DESIGN_TOKENS.typography.fontWeight.bold,
              marginBottom: '16px',
              background: `linear-gradient(135deg, ${DESIGN_TOKENS.colors.brand.saffron}, ${DESIGN_TOKENS.colors.brand.gold})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Design Token Audit
          </h1>
          <p
            style={{
              fontSize: DESIGN_TOKENS.typography.fontSize.lg,
              color: DESIGN_TOKENS.colors.text.secondary,
            }}
          >
            Visual reference for all design tokens in the Mallakhamb platform
          </p>
        </header>

        {/* Tab Navigation */}
        <nav
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '32px',
            borderBottom: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
            paddingBottom: '8px',
          }}
        >
          {['colors', 'spacing', 'typography', 'other'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 24px',
                background: activeTab === tab ? DESIGN_TOKENS.colors.brand.saffron : 'transparent',
                color: activeTab === tab ? '#000' : DESIGN_TOKENS.colors.text.primary,
                border: 'none',
                borderRadius: DESIGN_TOKENS.radii.md,
                cursor: 'pointer',
                fontSize: DESIGN_TOKENS.typography.fontSize.base,
                fontWeight: DESIGN_TOKENS.typography.fontWeight.medium,
                textTransform: 'capitalize',
                transition: 'all 0.2s ease',
              }}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* Content */}
        {activeTab === 'colors' && <ColorsSection />}
        {activeTab === 'spacing' && <SpacingSection />}
        {activeTab === 'typography' && <TypographySection />}
        {activeTab === 'other' && <OtherTokensSection />}
      </div>
    </div>
  );
};

/**
 * ColorsSection - Displays all color tokens with swatches
 */
const ColorsSection = () => {
  return (
    <div>
      {/* Brand Colors */}
      <ColorCategory
        title="Brand Colors"
        description="Primary brand colors used throughout the application"
        colors={DESIGN_TOKENS.colors.brand}
        useCases={{
          saffron: 'Primary brand color, CTAs, highlights',
          saffronLight: 'Hover states, lighter accents',
          saffronDark: 'Active states, darker accents',
          gold: 'Secondary brand color, premium features',
          cream: 'Light backgrounds, subtle highlights',
        }}
      />

      {/* Role Colors */}
      <ColorCategory
        title="Role Colors"
        description="Colors assigned to different user roles (WCAG AA compliant)"
        colors={DESIGN_TOKENS.colors.roles}
        useCases={{
          admin: 'Admin user interface theming',
          superadmin: 'Super admin interface theming',
          coach: 'Coach interface theming',
          player: 'Player interface theming',
          judge: 'Judge interface theming',
          public: 'Public-facing pages',
        }}
      />

      {/* Semantic Colors */}
      <ColorCategory
        title="Semantic Colors"
        description="Colors with semantic meaning for UI feedback"
        colors={DESIGN_TOKENS.colors.semantic}
        useCases={{
          success: 'Success messages, completed states',
          error: 'Error messages, failed states',
          warning: 'Warning messages, caution states',
          info: 'Informational messages, neutral states',
        }}
      />

      {/* Status Colors */}
      <ColorCategory
        title="Status Colors"
        description="Colors for different status states"
        colors={DESIGN_TOKENS.colors.status}
        useCases={{
          completed: 'Completed tasks, successful operations',
          pending: 'Pending tasks, in-progress operations',
          failed: 'Failed tasks, error states',
          started: 'Started tasks, active operations',
        }}
      />

      {/* Surface Colors */}
      <ColorCategory
        title="Surface Colors"
        description="Background colors for different surface levels"
        colors={DESIGN_TOKENS.colors.surfaces}
        useCases={{
          dark: 'Main background color',
          darkCard: 'Card backgrounds, elevated surfaces',
          darkElevated: 'Elevated panels, modals',
          darkPanel: 'Admin panels, sidebar backgrounds',
        }}
      />

      {/* Border Colors */}
      <ColorCategory
        title="Border Colors"
        description="Border colors for different emphasis levels"
        colors={DESIGN_TOKENS.colors.borders}
        useCases={{
          saffron: 'Primary borders, highlighted elements',
          subtle: 'Subtle borders, dividers',
          mid: 'Medium emphasis borders',
          bright: 'High emphasis borders, focus states',
        }}
      />

      {/* Text Colors */}
      <ColorCategory
        title="Text Colors"
        description="Text colors with WCAG AA compliant contrast ratios"
        colors={DESIGN_TOKENS.colors.text}
        useCases={{
          primary: 'Primary text, headings',
          secondary: 'Secondary text, descriptions (4.5:1 contrast)',
          muted: 'Muted text, placeholders (3:1 contrast)',
          disabled: 'Disabled text, inactive elements',
        }}
      />

      {/* Extended Palette */}
      <ColorCategory
        title="Extended Palette"
        description="Additional colors for specific use cases"
        colors={DESIGN_TOKENS.colors.extended}
        useCases={{
          purple: 'Admin theme primary',
          purpleLight: 'Admin theme light accents',
          purpleDark: 'Admin theme dark accents',
          green: 'Success states, positive feedback',
          greenLight: 'Light success accents',
          greenDark: 'Dark success accents',
          red: 'Error states, destructive actions',
          blue: 'Info states, links',
          indigo: 'Alternative accent color',
        }}
      />

      {/* Helper Functions Demo */}
      <div
        style={{
          marginTop: '48px',
          padding: '24px',
          background: DESIGN_TOKENS.colors.surfaces.darkCard,
          borderRadius: DESIGN_TOKENS.radii.lg,
          border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
        }}
      >
        <h3
          style={{
            fontSize: DESIGN_TOKENS.typography.fontSize['2xl'],
            fontWeight: DESIGN_TOKENS.typography.fontWeight.semibold,
            marginBottom: '16px',
          }}
        >
          Helper Functions
        </h3>
        <p
          style={{
            color: DESIGN_TOKENS.colors.text.secondary,
            marginBottom: '24px',
          }}
        >
          Utility functions for dynamic color selection
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
          }}
        >
          {/* Status Colors */}
          <div>
            <h4 style={{ marginBottom: '12px', fontSize: DESIGN_TOKENS.typography.fontSize.lg }}>
              getStatusColor()
            </h4>
            {Object.keys(DESIGN_TOKENS.colors.status).map((status) => (
              <div
                key={status}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    background: getStatusColor(status),
                    borderRadius: DESIGN_TOKENS.radii.md,
                    border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
                  }}
                />
                <span style={{ fontSize: DESIGN_TOKENS.typography.fontSize.sm }}>{status}</span>
              </div>
            ))}
          </div>

          {/* Role Colors */}
          <div>
            <h4 style={{ marginBottom: '12px', fontSize: DESIGN_TOKENS.typography.fontSize.lg }}>
              getRoleColor()
            </h4>
            {Object.keys(DESIGN_TOKENS.colors.roles).map((role) => (
              <div
                key={role}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    background: getRoleColor(role),
                    borderRadius: DESIGN_TOKENS.radii.md,
                    border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
                  }}
                />
                <span style={{ fontSize: DESIGN_TOKENS.typography.fontSize.sm }}>{role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * ColorCategory - Displays a category of colors with swatches and use cases
 */
const ColorCategory = ({ title, description, colors, useCases }) => {
  return (
    <section
      style={{
        marginBottom: '48px',
        padding: '24px',
        background: DESIGN_TOKENS.colors.surfaces.darkCard,
        borderRadius: DESIGN_TOKENS.radii.lg,
        border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
      }}
    >
      <h2
        style={{
          fontSize: DESIGN_TOKENS.typography.fontSize['2xl'],
          fontWeight: DESIGN_TOKENS.typography.fontWeight.semibold,
          marginBottom: '8px',
        }}
      >
        {title}
      </h2>
      <p
        style={{
          color: DESIGN_TOKENS.colors.text.secondary,
          marginBottom: '24px',
          fontSize: DESIGN_TOKENS.typography.fontSize.base,
        }}
      >
        {description}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
        }}
      >
        {Object.entries(colors).map(([name, value]) => (
          <ColorSwatch key={name} name={name} value={value} useCase={useCases[name]} />
        ))}
      </div>
    </section>
  );
};

/**
 * ColorSwatch - Individual color swatch with details
 */
const ColorSwatch = ({ name, value, useCase }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={handleCopy}
      style={{
        padding: '16px',
        background: DESIGN_TOKENS.colors.surfaces.darkElevated,
        borderRadius: DESIGN_TOKENS.radii.md,
        border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = DESIGN_TOKENS.colors.borders.bright;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = DESIGN_TOKENS.colors.borders.subtle;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div
        style={{
          width: '100%',
          height: '80px',
          background: value,
          borderRadius: DESIGN_TOKENS.radii.sm,
          marginBottom: '12px',
          border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
        }}
      />
      <div
        style={{
          fontSize: DESIGN_TOKENS.typography.fontSize.sm,
          fontWeight: DESIGN_TOKENS.typography.fontWeight.semibold,
          marginBottom: '4px',
        }}
      >
        {name}
      </div>
      <div
        style={{
          fontSize: DESIGN_TOKENS.typography.fontSize.xs,
          color: DESIGN_TOKENS.colors.text.secondary,
          fontFamily: 'monospace',
          marginBottom: '8px',
        }}
      >
        {copied ? '✓ Copied!' : value}
      </div>
      {useCase && (
        <div
          style={{
            fontSize: DESIGN_TOKENS.typography.fontSize.xs,
            color: DESIGN_TOKENS.colors.text.muted,
            lineHeight: DESIGN_TOKENS.typography.lineHeight.normal,
          }}
        >
          {useCase}
        </div>
      )}
    </div>
  );
};

/**
 * SpacingSection - Displays spacing scale
 */
const SpacingSection = () => {
  return (
    <section
      style={{
        padding: '24px',
        background: DESIGN_TOKENS.colors.surfaces.darkCard,
        borderRadius: DESIGN_TOKENS.radii.lg,
        border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
      }}
    >
      <h2
        style={{
          fontSize: DESIGN_TOKENS.typography.fontSize['2xl'],
          fontWeight: DESIGN_TOKENS.typography.fontWeight.semibold,
          marginBottom: '8px',
        }}
      >
        Spacing Scale
      </h2>
      <p
        style={{
          color: DESIGN_TOKENS.colors.text.secondary,
          marginBottom: '24px',
        }}
      >
        Consistent spacing values for margins, padding, and gaps
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {Object.entries(DESIGN_TOKENS.spacing).map(([name, value]) => (
          <div
            key={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
            }}
          >
            <div
              style={{
                width: '100px',
                fontSize: DESIGN_TOKENS.typography.fontSize.sm,
                fontWeight: DESIGN_TOKENS.typography.fontWeight.medium,
              }}
            >
              {name}
            </div>
            <div
              style={{
                width: '80px',
                fontSize: DESIGN_TOKENS.typography.fontSize.xs,
                color: DESIGN_TOKENS.colors.text.secondary,
                fontFamily: 'monospace',
              }}
            >
              {value}
            </div>
            <div
              style={{
                height: '32px',
                width: value,
                background: DESIGN_TOKENS.colors.brand.saffron,
                borderRadius: DESIGN_TOKENS.radii.sm,
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
};

/**
 * TypographySection - Displays typography scale
 */
const TypographySection = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Font Sizes */}
      <section
        style={{
          padding: '24px',
          background: DESIGN_TOKENS.colors.surfaces.darkCard,
          borderRadius: DESIGN_TOKENS.radii.lg,
          border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
        }}
      >
        <h2
          style={{
            fontSize: DESIGN_TOKENS.typography.fontSize['2xl'],
            fontWeight: DESIGN_TOKENS.typography.fontWeight.semibold,
            marginBottom: '8px',
          }}
        >
          Font Sizes
        </h2>
        <p
          style={{
            color: DESIGN_TOKENS.colors.text.secondary,
            marginBottom: '24px',
          }}
        >
          Typography scale for consistent text sizing
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {Object.entries(DESIGN_TOKENS.typography.fontSize).map(([name, value]) => (
            <div
              key={name}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '24px',
                padding: '12px',
                background: DESIGN_TOKENS.colors.surfaces.darkElevated,
                borderRadius: DESIGN_TOKENS.radii.sm,
              }}
            >
              <div
                style={{
                  width: '80px',
                  fontSize: DESIGN_TOKENS.typography.fontSize.sm,
                  fontWeight: DESIGN_TOKENS.typography.fontWeight.medium,
                }}
              >
                {name}
              </div>
              <div
                style={{
                  width: '60px',
                  fontSize: DESIGN_TOKENS.typography.fontSize.xs,
                  color: DESIGN_TOKENS.colors.text.secondary,
                  fontFamily: 'monospace',
                }}
              >
                {value}
              </div>
              <div style={{ fontSize: value }}>The quick brown fox jumps over the lazy dog</div>
            </div>
          ))}
        </div>
      </section>

      {/* Font Weights */}
      <section
        style={{
          padding: '24px',
          background: DESIGN_TOKENS.colors.surfaces.darkCard,
          borderRadius: DESIGN_TOKENS.radii.lg,
          border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
        }}
      >
        <h2
          style={{
            fontSize: DESIGN_TOKENS.typography.fontSize['2xl'],
            fontWeight: DESIGN_TOKENS.typography.fontWeight.semibold,
            marginBottom: '8px',
          }}
        >
          Font Weights
        </h2>
        <p
          style={{
            color: DESIGN_TOKENS.colors.text.secondary,
            marginBottom: '24px',
          }}
        >
          Font weight scale for text emphasis
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {Object.entries(DESIGN_TOKENS.typography.fontWeight).map(([name, value]) => (
            <div
              key={name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                padding: '12px',
                background: DESIGN_TOKENS.colors.surfaces.darkElevated,
                borderRadius: DESIGN_TOKENS.radii.sm,
              }}
            >
              <div
                style={{
                  width: '100px',
                  fontSize: DESIGN_TOKENS.typography.fontSize.sm,
                  fontWeight: DESIGN_TOKENS.typography.fontWeight.medium,
                }}
              >
                {name}
              </div>
              <div
                style={{
                  width: '60px',
                  fontSize: DESIGN_TOKENS.typography.fontSize.xs,
                  color: DESIGN_TOKENS.colors.text.secondary,
                  fontFamily: 'monospace',
                }}
              >
                {value}
              </div>
              <div
                style={{
                  fontSize: DESIGN_TOKENS.typography.fontSize.lg,
                  fontWeight: value,
                }}
              >
                The quick brown fox jumps over the lazy dog
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

/**
 * OtherTokensSection - Displays other design tokens
 */
const OtherTokensSection = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Border Radius */}
      <section
        style={{
          padding: '24px',
          background: DESIGN_TOKENS.colors.surfaces.darkCard,
          borderRadius: DESIGN_TOKENS.radii.lg,
          border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
        }}
      >
        <h2
          style={{
            fontSize: DESIGN_TOKENS.typography.fontSize['2xl'],
            fontWeight: DESIGN_TOKENS.typography.fontWeight.semibold,
            marginBottom: '8px',
          }}
        >
          Border Radius
        </h2>
        <p
          style={{
            color: DESIGN_TOKENS.colors.text.secondary,
            marginBottom: '24px',
          }}
        >
          Border radius values for rounded corners
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px',
          }}
        >
          {Object.entries(DESIGN_TOKENS.radii).map(([name, value]) => (
            <div
              key={name}
              style={{
                padding: '16px',
                background: DESIGN_TOKENS.colors.surfaces.darkElevated,
                borderRadius: DESIGN_TOKENS.radii.md,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '80px',
                  background: DESIGN_TOKENS.colors.brand.saffron,
                  borderRadius: value,
                  marginBottom: '12px',
                }}
              />
              <div
                style={{
                  fontSize: DESIGN_TOKENS.typography.fontSize.sm,
                  fontWeight: DESIGN_TOKENS.typography.fontWeight.medium,
                  marginBottom: '4px',
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontSize: DESIGN_TOKENS.typography.fontSize.xs,
                  color: DESIGN_TOKENS.colors.text.secondary,
                  fontFamily: 'monospace',
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Shadows */}
      <section
        style={{
          padding: '24px',
          background: DESIGN_TOKENS.colors.surfaces.darkCard,
          borderRadius: DESIGN_TOKENS.radii.lg,
          border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}`,
        }}
      >
        <h2
          style={{
            fontSize: DESIGN_TOKENS.typography.fontSize['2xl'],
            fontWeight: DESIGN_TOKENS.typography.fontWeight.semibold,
            marginBottom: '8px',
          }}
        >
          Shadows
        </h2>
        <p
          style={{
            color: DESIGN_TOKENS.colors.text.secondary,
            marginBottom: '24px',
          }}
        >
          Box shadow values for depth and elevation
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '24px',
          }}
        >
          {Object.entries(DESIGN_TOKENS.shadows).map(([name, value]) => (
            <div
              key={name}
              style={{
                padding: '16px',
                background: DESIGN_TOKENS.colors.surfaces.darkElevated,
                borderRadius: DESIGN_TOKENS.radii.md,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '80px',
                  background: DESIGN_TOKENS.colors.surfaces.darkCard,
                  borderRadius: DESIGN_TOKENS.radii.md,
                  boxShadow: value,
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: DESIGN_TOKENS.typography.fontSize.xs,
                  color: DESIGN_TOKENS.colors.text.muted,
                }}
              >
                Shadow
              </div>
              <div
                style={{
                  fontSize: DESIGN_TOKENS.typography.fontSize.sm,
                  fontWeight: DESIGN_TOKENS.typography.fontWeight.medium,
                  marginBottom: '4px',
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontSize: DESIGN_TOKENS.typography.fontSize.xs,
                  color: DESIGN_TOKENS.colors.text.secondary,
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default DesignTokenAudit;
