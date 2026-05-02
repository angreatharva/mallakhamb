import { ShieldOrnament, CoachOrnament, GradientText } from './index';
import { ThemeProvider } from '../theme/ThemeProvider';

/**
 * OrnamentsDemo - Demonstration of ornament components
 * 
 * This component showcases the usage of ShieldOrnament, CoachOrnament,
 * and GradientText components with different configurations.
 */
const OrnamentsDemo = () => {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#0A0A0A', 
      padding: '3rem',
      color: 'white',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <h1 style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <GradientText>Ornament Components Demo</GradientText>
      </h1>

      {/* ShieldOrnament Section */}
      <section style={{ marginBottom: '4rem' }}>
        <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>
          ShieldOrnament (Admin/Judge)
        </h2>
        <div style={{ 
          display: 'flex', 
          gap: '3rem', 
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div style={{ textAlign: 'center' }}>
            <ShieldOrnament size="sm" />
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              Small
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <ShieldOrnament size="md" />
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              Medium (Default)
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <ShieldOrnament size="lg" />
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              Large
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <ShieldOrnament color="#EF4444" />
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              Custom Color
            </p>
          </div>
        </div>
      </section>

      {/* CoachOrnament Section */}
      <section style={{ marginBottom: '4rem' }}>
        <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>
          CoachOrnament
        </h2>
        <div style={{ 
          display: 'flex', 
          gap: '3rem', 
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div style={{ textAlign: 'center' }}>
            <CoachOrnament size="sm" />
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              Small
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <CoachOrnament size="md" />
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              Medium (Default)
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <CoachOrnament size="lg" />
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              Large
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <CoachOrnament color="#FF6B00" />
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              Coach Orange
            </p>
          </div>
        </div>
      </section>

      {/* GradientText Section */}
      <section style={{ marginBottom: '4rem' }}>
        <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>
          GradientText
        </h2>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '2rem', 
          alignItems: 'center'
        }}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              <GradientText>Default Theme Gradient</GradientText>
            </h3>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              Uses theme colors
            </p>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              <GradientText colors={['#FF6B00', '#F5A623', '#FF8C38']}>
                Saffron Gradient
              </GradientText>
            </h3>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              Custom saffron colors
            </p>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              <GradientText colors={['#FF6B00', '#FF8C38', '#CC5500']}>
                Coach Orange Gradient
              </GradientText>
            </h3>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              Custom green colors
            </p>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              <GradientText animate colors={['#8B5CF6', '#A78BFA', '#6D28D9']}>
                Animated Gradient
              </GradientText>
            </h3>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
              With animation (respects prefers-reduced-motion)
            </p>
          </div>
        </div>
      </section>

      {/* Theme Integration Example */}
      <section style={{ marginBottom: '4rem' }}>
        <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>
          Theme Integration
        </h2>
        <div style={{ 
          display: 'flex', 
          gap: '2rem', 
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <ThemeProvider role="admin">
            <div style={{ 
              padding: '2rem', 
              background: 'rgba(139,92,246,0.1)',
              borderRadius: '1rem',
              border: '1px solid rgba(139,92,246,0.3)',
              textAlign: 'center'
            }}>
              <ShieldOrnament />
              <h3 style={{ marginTop: '1rem', fontSize: '1.25rem' }}>
                <GradientText>Admin Theme</GradientText>
              </h3>
            </div>
          </ThemeProvider>

          <ThemeProvider role="coach">
            <div style={{ 
              padding: '2rem', 
              background: 'rgba(34,197,94,0.1)',
              borderRadius: '1rem',
              border: '1px solid rgba(34,197,94,0.3)',
              textAlign: 'center'
            }}>
              <CoachOrnament />
              <h3 style={{ marginTop: '1rem', fontSize: '1.25rem' }}>
                <GradientText>Coach Theme</GradientText>
              </h3>
            </div>
          </ThemeProvider>
        </div>
      </section>

      {/* Usage Examples */}
      <section>
        <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>
          Usage Examples
        </h2>
        <div style={{ 
          maxWidth: '800px', 
          margin: '0 auto',
          background: 'rgba(255,255,255,0.05)',
          padding: '2rem',
          borderRadius: '1rem',
          fontSize: '0.875rem',
          fontFamily: 'monospace'
        }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
{`// Import components
import { ShieldOrnament, CoachOrnament, GradientText } from './ornaments';

// Basic usage
<ShieldOrnament />
<CoachOrnament />
<GradientText>Hello World</GradientText>

// With size variants
<ShieldOrnament size="sm" />
<ShieldOrnament size="md" />
<ShieldOrnament size="lg" />

// With custom colors
<ShieldOrnament color="#8B5CF6" />
<CoachOrnament color="#FF6B00" />

// GradientText with custom colors
<GradientText colors={['#FF6B00', '#F5A623', '#FF8C38']}>
  Custom Gradient
</GradientText>

// Animated gradient text
<GradientText animate>
  Animated Text
</GradientText>`}
          </pre>
        </div>
      </section>
    </div>
  );
};

export default OrnamentsDemo;
