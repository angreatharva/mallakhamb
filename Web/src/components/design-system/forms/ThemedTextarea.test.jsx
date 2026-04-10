import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemedTextarea } from './ThemedTextarea';

/**
 * Component tests for ThemedTextarea
 * **Validates: Requirements 12.2, 11.1**
 */
describe('ThemedTextarea', () => {
  const renderWithTheme = (ui, role = 'admin') => {
    return render(
      <MemoryRouter>
        <ThemeProvider role={role}>{ui}</ThemeProvider>
      </MemoryRouter>
    );
  };

  it('should render textarea with placeholder', () => {
    renderWithTheme(<ThemedTextarea placeholder="Enter description" />);
    expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument();
  });

  it('should display error message when error is a string', () => {
    renderWithTheme(<ThemedTextarea error="This field is required" placeholder="Description" />);

    expect(screen.getByText('This field is required')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should not display error message when error is boolean true', () => {
    renderWithTheme(<ThemedTextarea error={true} placeholder="Description" />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should apply error styling when error prop is true', () => {
    const { container } = renderWithTheme(
      <ThemedTextarea error={true} placeholder="Description" />
    );
    const textarea = container.querySelector('textarea');

    // Check that error border class is applied
    expect(textarea?.className).toContain('border-red-500/50');
  });

  it('should apply disabled state', () => {
    renderWithTheme(<ThemedTextarea disabled placeholder="Description" />);
    const textarea = screen.getByPlaceholderText('Description');
    expect(textarea).toBeDisabled();
  });

  it('should apply readonly state', () => {
    renderWithTheme(<ThemedTextarea readOnly placeholder="Description" />);
    const textarea = screen.getByPlaceholderText('Description');
    expect(textarea).toHaveAttribute('readonly');
  });

  it('should render with specified number of rows', () => {
    renderWithTheme(<ThemedTextarea rows={6} placeholder="Description" />);
    const textarea = screen.getByPlaceholderText('Description');
    expect(textarea).toHaveAttribute('rows', '6');
  });

  it('should render with default 4 rows', () => {
    renderWithTheme(<ThemedTextarea placeholder="Description" />);
    const textarea = screen.getByPlaceholderText('Description');
    expect(textarea).toHaveAttribute('rows', '4');
  });

  it('should accept custom className', () => {
    const { container } = renderWithTheme(
      <ThemedTextarea placeholder="Description" className="custom-class" />
    );
    const textarea = container.querySelector('textarea');
    expect(textarea?.className).toContain('custom-class');
  });

  it('should forward ref correctly', () => {
    const ref = { current: null };
    renderWithTheme(<ThemedTextarea ref={ref} placeholder="Description" />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('should apply theme-specific styling', () => {
    const { container } = renderWithTheme(<ThemedTextarea placeholder="Description" />, 'admin');
    const textarea = container.querySelector('textarea');

    // Check that theme color is applied via inline style
    expect(textarea?.style.color).toBeTruthy();
  });

  it('should render with different role themes', () => {
    const roles = ['admin', 'coach', 'player'];

    roles.forEach((role) => {
      const { unmount, container } = renderWithTheme(
        <ThemedTextarea placeholder="Description" />,
        role
      );

      const textarea = container.querySelector('textarea');
      expect(textarea?.style.color).toBeTruthy();
      unmount();
    });
  });

  it('should disable resize when disabled', () => {
    const { container } = renderWithTheme(<ThemedTextarea disabled placeholder="Description" />);
    const textarea = container.querySelector('textarea');

    // Check that resize-none class is applied when disabled
    expect(textarea?.className).toContain('resize-none');
  });

  it('should disable resize when readonly', () => {
    const { container } = renderWithTheme(<ThemedTextarea readOnly placeholder="Description" />);
    const textarea = container.querySelector('textarea');

    // Check that resize-none class is applied when readonly
    expect(textarea?.className).toContain('resize-none');
  });
});
