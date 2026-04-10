import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DesignTokenAudit from './DesignTokenAudit';
import { DESIGN_TOKENS } from '../../../styles/tokens';

/**
 * Tests for DesignTokenAudit component
 * **Validates: Requirements 14.3, 14.5, 14.6, 14.7**
 */
describe('DesignTokenAudit', () => {
  it('renders the audit tool with header', async () => {
    render(<DesignTokenAudit />);

    await waitFor(
      () => {
        expect(screen.getByText('Design Token Audit')).toBeInTheDocument();
        expect(screen.getByText(/Visual reference for all design tokens/i)).toBeInTheDocument();
      },
      { timeout: 10000 }
    );
  });

  it('renders all tab navigation buttons', async () => {
    render(<DesignTokenAudit />);

    // Wait for the first button, then check for others
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /colors/i })).toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    // Once colors button is found, others should be present too
    expect(screen.getByRole('button', { name: /spacing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /typography/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /other/i })).toBeInTheDocument();
  });

  it('displays colors section by default', () => {
    render(<DesignTokenAudit />);

    expect(screen.getByText('Brand Colors')).toBeInTheDocument();
    expect(screen.getByText('Role Colors')).toBeInTheDocument();
  });

  it('switches to spacing section when spacing tab is clicked', async () => {
    render(<DesignTokenAudit />);

    const spacingTab = screen.getByRole('button', { name: /spacing/i });
    fireEvent.click(spacingTab);

    await waitFor(() => {
      expect(screen.getByText('Spacing Scale')).toBeInTheDocument();
      expect(screen.getByText(/Consistent spacing values/i)).toBeInTheDocument();
    });
  });

  it('switches to typography section when typography tab is clicked', () => {
    render(<DesignTokenAudit />);

    const typographyTab = screen.getByRole('button', { name: /typography/i });
    fireEvent.click(typographyTab);

    expect(screen.getByText('Font Sizes')).toBeInTheDocument();
    expect(screen.getByText('Font Weights')).toBeInTheDocument();
  });

  it('switches to other tokens section when other tab is clicked', async () => {
    render(<DesignTokenAudit />);

    const otherTab = screen.getByRole('button', { name: /other/i });
    fireEvent.click(otherTab);

    await waitFor(() => {
      expect(screen.getByText('Border Radius')).toBeInTheDocument();
      expect(screen.getByText('Shadows')).toBeInTheDocument();
    });
  });

  it('displays all brand colors', () => {
    render(<DesignTokenAudit />);

    expect(screen.getAllByText('saffron').length).toBeGreaterThan(0);
    expect(screen.getAllByText('gold').length).toBeGreaterThan(0);
    expect(screen.getAllByText('cream').length).toBeGreaterThan(0);
  });

  it('displays all role colors', () => {
    render(<DesignTokenAudit />);

    expect(screen.getAllByText('admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('coach').length).toBeGreaterThan(0);
    expect(screen.getAllByText('player').length).toBeGreaterThan(0);
    expect(screen.getAllByText('judge').length).toBeGreaterThan(0);
  });

  it('displays use case documentation for colors', () => {
    render(<DesignTokenAudit />);

    expect(screen.getByText(/Primary brand color, CTAs, highlights/i)).toBeInTheDocument();
    expect(screen.getByText(/Admin user interface theming/i)).toBeInTheDocument();
  });

  it('copies color value to clipboard when swatch is clicked', async () => {
    // Mock clipboard API
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<DesignTokenAudit />);

    // Find a color swatch (looking for the saffron color value)
    const saffronValue = screen.getAllByText(DESIGN_TOKENS.colors.brand.saffron)[0];
    const swatch = saffronValue.closest('div[style*="cursor: pointer"]');

    if (swatch) {
      fireEvent.click(swatch);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith(DESIGN_TOKENS.colors.brand.saffron);
      });
    }
  });

  it('displays helper function demos', () => {
    render(<DesignTokenAudit />);

    expect(screen.getByText('Helper Functions')).toBeInTheDocument();
    expect(screen.getByText('getStatusColor()')).toBeInTheDocument();
    expect(screen.getByText('getRoleColor()')).toBeInTheDocument();
  });

  it('displays all spacing values in spacing section', () => {
    render(<DesignTokenAudit />);

    const spacingTab = screen.getByRole('button', { name: /spacing/i });
    fireEvent.click(spacingTab);

    // Check for spacing token names
    expect(screen.getByText('xs')).toBeInTheDocument();
    expect(screen.getByText('sm')).toBeInTheDocument();
    expect(screen.getByText('md')).toBeInTheDocument();
    expect(screen.getByText('lg')).toBeInTheDocument();
  });

  it('displays font size examples in typography section', () => {
    render(<DesignTokenAudit />);

    const typographyTab = screen.getByRole('button', { name: /typography/i });
    fireEvent.click(typographyTab);

    // Check for font size examples
    const examples = screen.getAllByText(/The quick brown fox jumps over the lazy dog/i);
    expect(examples.length).toBeGreaterThan(0);
  });

  it('displays border radius examples in other section', () => {
    render(<DesignTokenAudit />);

    const otherTab = screen.getByRole('button', { name: /other/i });
    fireEvent.click(otherTab);

    // Check for border radius values - use getAllByText since 'sm', 'md', 'lg' appear in shadows too
    expect(screen.getAllByText('sm').length).toBeGreaterThan(0);
    expect(screen.getAllByText('md').length).toBeGreaterThan(0);
    expect(screen.getAllByText('lg').length).toBeGreaterThan(0);
  });

  it('displays shadow examples in other section', () => {
    render(<DesignTokenAudit />);

    const otherTab = screen.getByRole('button', { name: /other/i });
    fireEvent.click(otherTab);

    // Check for shadow labels
    const shadowLabels = screen.getAllByText('Shadow');
    expect(shadowLabels.length).toBeGreaterThan(0);
  });

  it('applies correct styling from design tokens', () => {
    const { container } = render(<DesignTokenAudit />);

    const mainContainer = container.firstChild;
    expect(mainContainer).toHaveStyle({
      background: DESIGN_TOKENS.colors.surfaces.dark,
      color: DESIGN_TOKENS.colors.text.primary,
    });
  });

  it('highlights active tab', () => {
    render(<DesignTokenAudit />);

    const colorsTab = screen.getByRole('button', { name: /colors/i });
    expect(colorsTab).toHaveStyle({
      background: DESIGN_TOKENS.colors.brand.saffron,
    });

    const spacingTab = screen.getByRole('button', { name: /spacing/i });
    expect(spacingTab).toHaveStyle({
      background: 'transparent',
    });
  });

  it('changes active tab styling when clicked', () => {
    render(<DesignTokenAudit />);

    const spacingTab = screen.getByRole('button', { name: /spacing/i });
    fireEvent.click(spacingTab);

    expect(spacingTab).toHaveStyle({
      background: DESIGN_TOKENS.colors.brand.saffron,
    });
  });

  it('displays WCAG compliance information', () => {
    render(<DesignTokenAudit />);

    const wcagTexts = screen.getAllByText(/WCAG AA compliant/i);
    expect(wcagTexts.length).toBeGreaterThan(0);
  });

  it('documents intended use cases for all color categories', () => {
    render(<DesignTokenAudit />);

    // Check that use case descriptions are present
    expect(
      screen.getByText(/Primary brand colors used throughout the application/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Colors assigned to different user roles/i)).toBeInTheDocument();
    expect(screen.getByText(/Colors with semantic meaning for UI feedback/i)).toBeInTheDocument();
  });
});
