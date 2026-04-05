import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemedSelect } from './ThemedSelect';

/**
 * Component tests for ThemedSelect
 * **Validates: Requirements 12.2, 11.1**
 */
describe('ThemedSelect', () => {
  const renderWithTheme = (ui, role = 'admin') => {
    return render(
      <MemoryRouter>
        <ThemeProvider role={role}>
          {ui}
        </ThemeProvider>
      </MemoryRouter>
    );
  };
  
  const mockOptions = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' },
  ];
  
  it('should render select with options', () => {
    renderWithTheme(<ThemedSelect options={mockOptions} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    
    // Check that options are rendered
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
  });
  
  it('should render with placeholder', () => {
    renderWithTheme(
      <ThemedSelect options={mockOptions} placeholder="Select an option" />
    );
    
    expect(screen.getByRole('option', { name: 'Select an option' })).toBeInTheDocument();
  });
  
  it('should render chevron icon', () => {
    const { container } = renderWithTheme(<ThemedSelect options={mockOptions} />);
    
    // Check that chevron icon container exists
    const chevronContainer = container.querySelector('.absolute.right-3');
    expect(chevronContainer).toBeInTheDocument();
    
    // Check that SVG icon exists
    const chevronIcon = container.querySelector('svg');
    expect(chevronIcon).toBeInTheDocument();
  });
  
  it('should apply disabled state', () => {
    renderWithTheme(<ThemedSelect options={mockOptions} disabled />);
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
  });
  
  it('should apply readonly state', () => {
    renderWithTheme(<ThemedSelect options={mockOptions} readOnly />);
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled(); // readonly is implemented as disabled
  });
  
  it('should have minimum 44px touch target height', () => {
    const { container } = renderWithTheme(<ThemedSelect options={mockOptions} />);
    const select = container.querySelector('select');
    
    // Check that min-h-[44px] class is applied
    expect(select?.className).toContain('min-h-[44px]');
  });
  
  it('should accept custom className', () => {
    const { container } = renderWithTheme(
      <ThemedSelect options={mockOptions} className="custom-class" />
    );
    const select = container.querySelector('select');
    expect(select?.className).toContain('custom-class');
  });
  
  it('should forward ref correctly', () => {
    const ref = { current: null };
    renderWithTheme(<ThemedSelect ref={ref} options={mockOptions} />);
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });
  
  it('should render with children options instead of options prop', () => {
    renderWithTheme(
      <ThemedSelect>
        <option value="child1">Child Option 1</option>
        <option value="child2">Child Option 2</option>
      </ThemedSelect>
    );
    
    expect(screen.getByRole('option', { name: 'Child Option 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Child Option 2' })).toBeInTheDocument();
  });
  
  it('should apply theme-specific styling', () => {
    const { container } = renderWithTheme(<ThemedSelect options={mockOptions} />, 'admin');
    const select = container.querySelector('select');
    
    // Check that theme color is applied via inline style
    expect(select?.style.color).toBeTruthy();
  });
  
  it('should render with different role themes', () => {
    const roles = ['admin', 'coach', 'player'];
    
    roles.forEach(role => {
      const { unmount, container } = renderWithTheme(
        <ThemedSelect options={mockOptions} />,
        role
      );
      
      const select = container.querySelector('select');
      expect(select?.style.color).toBeTruthy();
      unmount();
    });
  });
});
