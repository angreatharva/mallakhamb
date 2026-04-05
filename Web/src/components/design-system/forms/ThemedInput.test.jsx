import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemedInput } from './ThemedInput';

describe('ThemedInput', () => {
  const renderWithTheme = (ui, role = 'admin') => {
    return render(
      <MemoryRouter>
        <ThemeProvider role={role}>
          {ui}
        </ThemeProvider>
      </MemoryRouter>
    );
  };
  
  it('should render input with placeholder', () => {
    renderWithTheme(<ThemedInput placeholder="Enter email" />);
    expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
  });
  
  it('should render with icon when provided', () => {
    const { container } = renderWithTheme(
      <ThemedInput icon={Mail} placeholder="Email" />
    );
    
    // Check that icon container exists
    const iconContainer = container.querySelector('.absolute.left-3');
    expect(iconContainer).toBeInTheDocument();
  });
  
  it('should display error message when error is a string', () => {
    renderWithTheme(
      <ThemedInput error="This field is required" placeholder="Email" />
    );
    
    expect(screen.getByText('This field is required')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  
  it('should not display error message when error is boolean true', () => {
    renderWithTheme(
      <ThemedInput error={true} placeholder="Email" />
    );
    
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  
  it('should render rightElement when provided', () => {
    const { container } = renderWithTheme(
      <ThemedInput 
        placeholder="Password"
        rightElement={<button>Toggle</button>}
      />
    );
    
    expect(screen.getByRole('button', { name: 'Toggle' })).toBeInTheDocument();
  });
  
  it('should apply disabled state', () => {
    renderWithTheme(<ThemedInput disabled placeholder="Email" />);
    const input = screen.getByPlaceholderText('Email');
    expect(input).toBeDisabled();
  });
  
  it('should apply readonly state', () => {
    renderWithTheme(<ThemedInput readOnly placeholder="Email" />);
    const input = screen.getByPlaceholderText('Email');
    expect(input).toHaveAttribute('readonly');
  });
  
  it('should have minimum 44px touch target height', () => {
    const { container } = renderWithTheme(<ThemedInput placeholder="Email" />);
    const input = container.querySelector('input');
    
    // Check that min-h-[44px] class is applied
    expect(input?.className).toContain('min-h-[44px]');
  });
  
  it('should accept custom className', () => {
    const { container } = renderWithTheme(
      <ThemedInput placeholder="Email" className="custom-class" />
    );
    const input = container.querySelector('input');
    expect(input?.className).toContain('custom-class');
  });
  
  it('should forward ref correctly', () => {
    const ref = { current: null };
    renderWithTheme(<ThemedInput ref={ref} placeholder="Email" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
