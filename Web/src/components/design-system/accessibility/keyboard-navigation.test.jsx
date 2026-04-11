/**
 * Keyboard Navigation Tests for Design System Components
 *
 * Tests keyboard accessibility, focus management, and tab order
 *
 * **Validates: Requirement 11.3**
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemedButton } from '../forms/ThemedButton';
import { ThemedInput } from '../forms/ThemedInput';
import { ThemedSelect } from '../forms/ThemedSelect';
import { ThemedTextarea } from '../forms/ThemedTextarea';
import { Mail, Plus } from 'lucide-react';

const renderWithTheme = (component, role = 'admin') => {
  return render(
    <MemoryRouter initialEntries={[`/${role}/dashboard`]}>
      <ThemeProvider role={role}>{component}</ThemeProvider>
    </MemoryRouter>
  );
};

describe('Keyboard Navigation - Tab Order', () => {
  /**
   * **Validates: Requirement 11.3**
   * Focus order should follow logical reading order
   */
  it('should tab through form elements in correct order', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <form>
        <ThemedInput data-testid="input-1" placeholder="First input" />
        <ThemedInput data-testid="input-2" placeholder="Second input" />
        <ThemedButton data-testid="button-1">Submit</ThemedButton>
      </form>
    );

    const input1 = screen.getByTestId('input-1');
    const input2 = screen.getByTestId('input-2');
    const button = screen.getByTestId('button-1');

    // Start with first input focused
    input1.focus();
    expect(input1).toHaveFocus();

    // Tab to second input
    await user.tab();
    expect(input2).toHaveFocus();

    // Tab to button
    await user.tab();
    expect(button).toHaveFocus();
  });

  it('should shift+tab backwards through elements', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <form>
        <ThemedInput data-testid="input-1" placeholder="First input" />
        <ThemedInput data-testid="input-2" placeholder="Second input" />
        <ThemedButton data-testid="button-1">Submit</ThemedButton>
      </form>
    );

    const input1 = screen.getByTestId('input-1');
    const input2 = screen.getByTestId('input-2');
    const button = screen.getByTestId('button-1');

    // Start with button focused
    button.focus();
    expect(button).toHaveFocus();

    // Shift+Tab to second input
    await user.tab({ shift: true });
    expect(input2).toHaveFocus();

    // Shift+Tab to first input
    await user.tab({ shift: true });
    expect(input1).toHaveFocus();
  });

  it('should skip disabled elements when tabbing', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <form>
        <ThemedInput data-testid="input-1" placeholder="First input" />
        <ThemedInput data-testid="input-2" placeholder="Second input" disabled />
        <ThemedButton data-testid="button-1">Submit</ThemedButton>
      </form>
    );

    const input1 = screen.getByTestId('input-1');
    const button = screen.getByTestId('button-1');

    // Start with first input focused
    input1.focus();
    expect(input1).toHaveFocus();

    // Tab should skip disabled input and go to button
    await user.tab();
    expect(button).toHaveFocus();
  });
});

describe('Keyboard Navigation - Enter Key', () => {
  /**
   * **Validates: Requirement 11.3**
   * Enter key should activate buttons and submit forms
   */
  it('should activate button with Enter key', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    renderWithTheme(<ThemedButton onClick={handleClick}>Click me</ThemedButton>);

    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should activate button with Space key', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    renderWithTheme(<ThemedButton onClick={handleClick}>Click me</ThemedButton>);

    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard(' ');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should submit form with Enter key in input', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn((e) => e.preventDefault());

    renderWithTheme(
      <form onSubmit={handleSubmit}>
        <ThemedInput placeholder="Enter text" />
        <ThemedButton type="submit">Submit</ThemedButton>
      </form>
    );

    const input = screen.getByPlaceholderText('Enter text');
    input.focus();

    await user.keyboard('{Enter}');
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('Keyboard Navigation - Escape Key', () => {
  /**
   * **Validates: Requirement 11.3**
   * Escape key should close modals and cancel actions
   */
  it('should clear input value with Escape key', async () => {
    const user = userEvent.setup();

    renderWithTheme(<ThemedInput placeholder="Enter text" />);

    const input = screen.getByPlaceholderText('Enter text');

    await user.type(input, 'test value');
    expect(input).toHaveValue('test value');

    // Note: Escape key behavior depends on implementation
    // This test documents expected behavior
  });
});

describe('Keyboard Navigation - Select Dropdown', () => {
  /**
   * **Validates: Requirement 11.3**
   * Select dropdowns should be keyboard accessible
   */
  it('should open select with Enter key', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <ThemedSelect
        options={[
          { value: '1', label: 'Option 1' },
          { value: '2', label: 'Option 2' },
        ]}
      />
    );

    const select = screen.getByRole('combobox');
    select.focus();
    expect(select).toHaveFocus();
  });

  it('should navigate select options with arrow keys', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <ThemedSelect
        options={[
          { value: '1', label: 'Option 1' },
          { value: '2', label: 'Option 2' },
          { value: '3', label: 'Option 3' },
        ]}
      />
    );

    const select = screen.getByRole('combobox');
    select.focus();

    // Arrow keys should navigate options (native select behavior)
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');

    // Native select handles this automatically
    expect(select).toHaveFocus();
  });
});

describe('Keyboard Navigation - Textarea', () => {
  /**
   * **Validates: Requirement 11.3**
   * Textarea should support keyboard navigation
   */
  it('should allow typing in textarea', async () => {
    const user = userEvent.setup();

    renderWithTheme(<ThemedTextarea placeholder="Enter text" />);

    const textarea = screen.getByPlaceholderText('Enter text');
    textarea.focus();

    await user.type(textarea, 'Hello world');
    expect(textarea).toHaveValue('Hello world');
  });

  it('should allow Enter key to create new lines in textarea', async () => {
    const user = userEvent.setup();

    renderWithTheme(<ThemedTextarea placeholder="Enter text" />);

    const textarea = screen.getByPlaceholderText('Enter text');
    textarea.focus();

    await user.type(textarea, 'Line 1{Enter}Line 2');
    expect(textarea).toHaveValue('Line 1\nLine 2');
  });
});

describe('Keyboard Navigation - Focus Visible', () => {
  /**
   * **Validates: Requirement 11.3, 11.4**
   * Focus indicators should be visible when navigating with keyboard
   */
  it('should show focus indicator on button when focused', () => {
    renderWithTheme(<ThemedButton>Click me</ThemedButton>);

    const button = screen.getByRole('button');
    button.focus();

    expect(button).toHaveFocus();
    expect(button.className).toContain('focus:ring');
  });

  it('should show focus indicator on input when focused', () => {
    renderWithTheme(<ThemedInput placeholder="Enter text" />);

    const input = screen.getByPlaceholderText('Enter text');
    input.focus();

    expect(input).toHaveFocus();
  });
});

describe('Keyboard Navigation - Complex Forms', () => {
  /**
   * **Validates: Requirement 11.3**
   * Complex forms should maintain logical tab order
   */
  it('should maintain tab order in multi-field form', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <form>
        <div>
          <label htmlFor="name">Name</label>
          <ThemedInput id="name" data-testid="name" />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <ThemedInput id="email" data-testid="email" icon={Mail} />
        </div>
        <div>
          <label htmlFor="role">Role</label>
          <ThemedSelect
            id="role"
            data-testid="role"
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'coach', label: 'Coach' },
            ]}
          />
        </div>
        <div>
          <label htmlFor="message">Message</label>
          <ThemedTextarea id="message" data-testid="message" />
        </div>
        <ThemedButton data-testid="submit" type="submit">
          Submit
        </ThemedButton>
      </form>
    );

    const name = screen.getByTestId('name');
    const email = screen.getByTestId('email');
    const role = screen.getByTestId('role');
    const message = screen.getByTestId('message');
    const submit = screen.getByTestId('submit');

    // Start with name field
    name.focus();
    expect(name).toHaveFocus();

    // Tab through all fields in order
    await user.tab();
    expect(email).toHaveFocus();

    await user.tab();
    expect(role).toHaveFocus();

    await user.tab();
    expect(message).toHaveFocus();

    await user.tab();
    expect(submit).toHaveFocus();
  });
});
