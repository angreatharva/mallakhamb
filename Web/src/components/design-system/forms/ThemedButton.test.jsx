import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemedButton } from './ThemedButton';

describe('ThemedButton', () => {
  const renderWithTheme = (ui, role = 'admin') => {
    return render(
      <MemoryRouter>
        <ThemeProvider role={role}>{ui}</ThemeProvider>
      </MemoryRouter>
    );
  };

  it('should render button with text', () => {
    renderWithTheme(<ThemedButton>Click me</ThemedButton>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('should render solid variant by default', () => {
    const { container } = renderWithTheme(<ThemedButton>Submit</ThemedButton>);
    const button = screen.getByRole('button');

    // Solid variant should have background color
    expect(button).toHaveStyle({ backgroundColor: expect.any(String) });
  });

  it('should render outline variant', () => {
    const { container } = renderWithTheme(<ThemedButton variant="outline">Submit</ThemedButton>);
    const button = screen.getByRole('button');

    // Outline variant should have border
    expect(button).toHaveStyle({ borderColor: expect.any(String) });
  });

  it('should render ghost variant', () => {
    renderWithTheme(<ThemedButton variant="ghost">Submit</ThemedButton>);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('should render all size variants', () => {
    const sizes = ['sm', 'md', 'lg'];

    sizes.forEach((size) => {
      const { unmount } = renderWithTheme(<ThemedButton size={size}>{size} button</ThemedButton>);

      const button = screen.getByRole('button');
      expect(button.className).toContain('min-h-[44px]');
      unmount();
    });
  });

  it('should render with icon when provided', () => {
    const { container } = renderWithTheme(<ThemedButton icon={Plus}>Add Item</ThemedButton>);

    // Check that icon is rendered (lucide-react icons have specific structure)
    const button = screen.getByRole('button');
    expect(button.querySelector('svg')).toBeInTheDocument();
  });

  it('should show loading spinner when loading', () => {
    const { container } = renderWithTheme(<ThemedButton loading>Loading</ThemedButton>);

    // Check for spinner (Loader2 icon with animate-spin class)
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should be disabled when loading', () => {
    renderWithTheme(<ThemedButton loading>Submit</ThemedButton>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should apply disabled state', () => {
    renderWithTheme(<ThemedButton disabled>Submit</ThemedButton>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should have minimum 44px touch target', () => {
    renderWithTheme(<ThemedButton>Submit</ThemedButton>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('min-h-[44px]');
  });

  it('should accept custom className', () => {
    renderWithTheme(<ThemedButton className="custom-class">Submit</ThemedButton>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('custom-class');
  });

  it('should forward ref correctly', () => {
    const ref = { current: null };
    renderWithTheme(<ThemedButton ref={ref}>Submit</ThemedButton>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('should render with different role themes', () => {
    const roles = ['admin', 'coach', 'player'];

    roles.forEach((role) => {
      const { unmount } = renderWithTheme(<ThemedButton>Submit</ThemedButton>, role);

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ backgroundColor: expect.any(String) });
      unmount();
    });
  });
});
