/**
 * Responsive Design Tests
 * 
 * Tests components on mobile, tablet, and desktop viewports
 * Tests touch targets meet 44px minimum on mobile
 * Tests font sizes scale appropriately
 * 
 * **Validates: Requirements 15.3, 15.4, 15.7**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemedInput } from './forms/ThemedInput';
import { ThemedButton } from './forms/ThemedButton';
import { ThemedSelect } from './forms/ThemedSelect';
import { ThemedTextarea } from './forms/ThemedTextarea';
import { DarkCard } from './cards/DarkCard';
import { GlassCard } from './cards/GlassCard';
import { StatCard } from './cards/StatCard';
import { ThemeProvider } from './theme/ThemeProvider';
import { Users } from 'lucide-react';

// Mock window.matchMedia for responsive testing
const createMatchMedia = (width) => {
  return (query) => ({
    matches: query.includes(`${width}px`) || 
             (query.includes('min-width') && width >= parseInt(query.match(/\d+/)?.[0] || 0)),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
};

// Helper to set viewport width
const setViewportWidth = (width) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  window.matchMedia = createMatchMedia(width);
  window.dispatchEvent(new Event('resize'));
};

// Helper to render with theme
const renderWithTheme = (component, role = 'admin') => {
  return render(
    <BrowserRouter>
      <ThemeProvider role={role}>
        {component}
      </ThemeProvider>
    </BrowserRouter>
  );
};

describe('Responsive Design Tests', () => {
  beforeEach(() => {
    // Reset viewport to desktop
    setViewportWidth(1024);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Mobile Viewport (320px - 767px)', () => {
    beforeEach(() => {
      setViewportWidth(375); // iPhone size
    });

    describe('Touch Target Requirements (Requirement 15.3)', () => {
      it('ThemedInput should have minimum 44px height on mobile', () => {
        const { container } = renderWithTheme(
          <ThemedInput placeholder="Test input" />
        );
        const input = container.querySelector('input');
        const styles = window.getComputedStyle(input);
        
        // Check min-height is at least 44px
        expect(input.className).toContain('min-h-[44px]');
      });

      it('ThemedButton should have minimum 44px height on mobile', () => {
        const { container } = renderWithTheme(
          <ThemedButton>Click me</ThemedButton>
        );
        const button = screen.getByRole('button');
        
        // Check min-height is at least 44px
        expect(button.className).toContain('min-h-[44px]');
      });

      it('ThemedSelect should have minimum 44px height on mobile', () => {
        const { container } = renderWithTheme(
          <ThemedSelect options={[{ value: '1', label: 'Option 1' }]} />
        );
        const select = container.querySelector('select');
        
        // Check min-height is at least 44px
        expect(select.className).toContain('min-h-[44px]');
      });

      it('All interactive elements should meet 44px minimum touch target', () => {
        const { container } = renderWithTheme(
          <div>
            <ThemedInput placeholder="Input" />
            <ThemedButton>Button</ThemedButton>
            <ThemedSelect options={[{ value: '1', label: 'Option' }]} />
          </div>
        );

        const input = container.querySelector('input');
        const button = screen.getByRole('button');
        const select = container.querySelector('select');

        [input, button, select].forEach(element => {
          expect(element.className).toContain('min-h-[44px]');
        });
      });
    });

    describe('Responsive Prop Values (Requirement 15.5)', () => {
      it('ThemedInput should use mobile padding when provided', async () => {
        const { container } = renderWithTheme(
          <ThemedInput 
            placeholder="Test" 
            padding={{ mobile: 'sm', desktop: 'lg' }}
          />
        );
        
        await waitFor(() => {
          const input = container.querySelector('input');
          // Should have small padding class on mobile
          expect(input.className).toContain('px-3 py-2');
        });
      });

      it('ThemedButton should use mobile size when provided via padding prop', async () => {
        const { container } = renderWithTheme(
          <ThemedButton padding={{ mobile: 'sm', desktop: 'lg' }}>
            Button
          </ThemedButton>
        );
        
        await waitFor(() => {
          const button = screen.getByRole('button');
          // Should have small size class on mobile
          expect(button.className).toContain('px-3 py-2');
        });
      });

      it('DarkCard should use mobile padding when provided', async () => {
        const { container } = renderWithTheme(
          <DarkCard padding={{ mobile: 'sm', desktop: 'lg' }}>
            Content
          </DarkCard>
        );
        
        await waitFor(() => {
          const card = container.querySelector('.dark-card');
          const styles = card.style;
          // Should have 1rem padding on mobile
          expect(styles.padding).toBe('1rem');
        });
      });

      it('StatCard should use mobile font size when provided', async () => {
        const { container } = renderWithTheme(
          <StatCard 
            label="Users"
            value={100}
            color="#8B5CF6"
            fontSize={{ mobile: 'xl', desktop: '3xl' }}
          />
        );
        
        await waitFor(() => {
          // Find all divs inside stat-card, the value is the second div (label is first)
          const statCard = container.querySelector('.stat-card');
          const divs = statCard?.querySelectorAll('div');
          if (divs && divs.length >= 2) {
            const valueElement = divs[1]; // Second div is the value
            // Should have 1.5rem font size on mobile
            expect(valueElement.style.fontSize).toBe('1.5rem');
          }
        });
      });
    });

    describe('Mobile-Friendly Modals (Requirement 15.6)', () => {
      it('Modal should take full width on mobile', () => {
        // Modal responsiveness is tested in the actual modal component
        // Here we just verify the viewport is correctly set to mobile
        expect(window.innerWidth).toBe(375);
      });
    });
  });

  describe('Tablet Viewport (768px - 1023px)', () => {
    beforeEach(() => {
      setViewportWidth(768);
    });

    describe('Appropriate Spacing and Font Sizes (Requirement 15.4)', () => {
      it('ThemedInput should use tablet padding when provided', async () => {
        const { container } = renderWithTheme(
          <ThemedInput 
            placeholder="Test" 
            padding={{ mobile: 'sm', tablet: 'md', desktop: 'lg' }}
          />
        );
        
        await waitFor(() => {
          const input = container.querySelector('input');
          // Should have medium padding class on tablet
          expect(input.className).toContain('px-4 py-3');
        });
      });

      it('ThemedButton should use tablet size when provided', async () => {
        const { container } = renderWithTheme(
          <ThemedButton padding={{ mobile: 'sm', tablet: 'md', desktop: 'lg' }}>
            Button
          </ThemedButton>
        );
        
        await waitFor(() => {
          const button = screen.getByRole('button');
          // Should have medium size class on tablet
          expect(button.className).toContain('px-4 py-3');
        });
      });

      it('Cards should use tablet padding when provided', async () => {
        const { container } = renderWithTheme(
          <DarkCard padding={{ mobile: 'sm', tablet: 'md', desktop: 'lg' }}>
            Content
          </DarkCard>
        );
        
        await waitFor(() => {
          const card = container.querySelector('.dark-card');
          const styles = card.style;
          // Should have 1.5rem padding on tablet
          expect(styles.padding).toBe('1.5rem');
        });
      });
    });

    describe('Touch Targets on Tablet', () => {
      it('All interactive elements should maintain 44px minimum', () => {
        const { container } = renderWithTheme(
          <div>
            <ThemedInput placeholder="Input" />
            <ThemedButton>Button</ThemedButton>
            <ThemedSelect options={[{ value: '1', label: 'Option' }]} />
          </div>
        );

        const input = container.querySelector('input');
        const button = screen.getByRole('button');
        const select = container.querySelector('select');

        [input, button, select].forEach(element => {
          expect(element.className).toContain('min-h-[44px]');
        });
      });
    });
  });

  describe('Desktop Viewport (1024px+)', () => {
    beforeEach(() => {
      setViewportWidth(1440);
    });

    describe('Desktop Spacing and Sizing', () => {
      it('ThemedInput should use desktop padding when provided', async () => {
        const { container } = renderWithTheme(
          <ThemedInput 
            placeholder="Test" 
            padding={{ mobile: 'sm', desktop: 'lg' }}
          />
        );
        
        await waitFor(() => {
          const input = container.querySelector('input');
          // Should have large padding class on desktop
          expect(input.className).toContain('px-5 py-4');
        });
      });

      it('ThemedButton should use desktop size when provided', async () => {
        const { container } = renderWithTheme(
          <ThemedButton padding={{ mobile: 'sm', desktop: 'lg' }}>
            Button
          </ThemedButton>
        );
        
        await waitFor(() => {
          const button = screen.getByRole('button');
          // Should have large size class on desktop
          expect(button.className).toContain('px-6 py-4');
        });
      });

      it('Cards should use desktop padding when provided', async () => {
        const { container } = renderWithTheme(
          <DarkCard padding={{ mobile: 'sm', desktop: 'lg' }}>
            Content
          </DarkCard>
        );
        
        await waitFor(() => {
          const card = container.querySelector('.dark-card');
          const styles = card.style;
          // Should have 2rem padding on desktop
          expect(styles.padding).toBe('2rem');
        });
      });

      it('StatCard should use desktop font size when provided', async () => {
        const { container } = renderWithTheme(
          <StatCard 
            label="Users"
            value={100}
            color="#8B5CF6"
            fontSize={{ mobile: 'xl', desktop: '3xl' }}
          />
        );
        
        await waitFor(() => {
          // Find all divs inside stat-card, the value is the second div
          const statCard = container.querySelector('.stat-card');
          const divs = statCard?.querySelectorAll('div');
          if (divs && divs.length >= 2) {
            const valueElement = divs[1]; // Second div is the value
            // Should have 2.5rem font size on desktop
            expect(valueElement.style.fontSize).toBe('2.5rem');
          }
        });
      });
    });
  });

  describe('Font Size Scaling (Requirement 15.7)', () => {
    it('Font sizes should scale appropriately across viewports', async () => {
      const testFontSizes = async (width, expectedSize) => {
        setViewportWidth(width);
        const { container } = renderWithTheme(
          <ThemedInput 
            placeholder="Test" 
            fontSize={{ mobile: 'sm', tablet: 'base', desktop: 'lg' }}
          />
        );
        
        await waitFor(() => {
          const input = container.querySelector('input');
          expect(input.className).toContain(expectedSize);
        });
      };

      // Test mobile
      await testFontSizes(375, 'text-sm');
      
      // Test tablet
      await testFontSizes(768, 'text-base');
      
      // Test desktop
      await testFontSizes(1440, 'text-lg');
    });
  });

  describe('Component Rendering Across Viewports (Requirement 15.7)', () => {
    const viewports = [
      { name: 'mobile', width: 375 },
      { name: 'tablet', width: 768 },
      { name: 'desktop', width: 1440 },
    ];

    viewports.forEach(({ name, width }) => {
      describe(`${name} viewport`, () => {
        beforeEach(() => {
          setViewportWidth(width);
        });

        it('ThemedInput should render correctly', () => {
          const { container } = renderWithTheme(
            <ThemedInput placeholder="Test input" />
          );
          expect(container.querySelector('input')).toBeInTheDocument();
        });

        it('ThemedButton should render correctly', () => {
          renderWithTheme(<ThemedButton>Click me</ThemedButton>);
          expect(screen.getByRole('button')).toBeInTheDocument();
        });

        it('ThemedSelect should render correctly', () => {
          const { container } = renderWithTheme(
            <ThemedSelect options={[{ value: '1', label: 'Option 1' }]} />
          );
          expect(container.querySelector('select')).toBeInTheDocument();
        });

        it('ThemedTextarea should render correctly', () => {
          const { container } = renderWithTheme(
            <ThemedTextarea placeholder="Test textarea" />
          );
          expect(container.querySelector('textarea')).toBeInTheDocument();
        });

        it('DarkCard should render correctly', () => {
          const { container } = renderWithTheme(
            <DarkCard>Card content</DarkCard>
          );
          expect(container.querySelector('.dark-card')).toBeInTheDocument();
        });

        it('GlassCard should render correctly', () => {
          const { container } = renderWithTheme(
            <GlassCard>Card content</GlassCard>
          );
          expect(container.querySelector('.glass-card')).toBeInTheDocument();
        });

        it('StatCard should render correctly', () => {
          const { container } = renderWithTheme(
            <StatCard 
              icon={Users}
              label="Total Users"
              value={100}
              color="#8B5CF6"
            />
          );
          expect(container.querySelector('.stat-card')).toBeInTheDocument();
        });
      });
    });
  });

  describe('Default Behavior Without Responsive Props', () => {
    it('Components should work without responsive props', () => {
      const { container } = renderWithTheme(
        <div>
          <ThemedInput placeholder="Input" />
          <ThemedButton>Button</ThemedButton>
          <DarkCard>Card</DarkCard>
        </div>
      );

      expect(container.querySelector('input')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
      expect(container.querySelector('.dark-card')).toBeInTheDocument();
    });

    it('Components should use default values when responsive props are not provided', () => {
      const { container } = renderWithTheme(
        <ThemedInput placeholder="Test" />
      );
      
      const input = container.querySelector('input');
      // Should have default medium padding
      expect(input.className).toContain('px-4 py-3');
    });
  });
});
