import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppearanceProvider } from '@/contexts/AppearanceProvider';
import AppearanceMenu from './AppearanceMenu';

const setup = () => render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
const trigger = () => screen.getByRole('button', { name: /^Appearance:/ });

describe('AppearanceMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-appearance');
    // The device prefers light, so "Match device" has something to name.
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('light'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
  });

  it('names the resolved appearance on the button', () => {
    setup();
    expect(trigger()).toHaveAccessibleName('Appearance: Dark');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('offers three explicit choices with the current one checked', () => {
    setup();
    fireEvent.click(trigger());
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual(['Dark', 'Light', 'Match device (currently Light)']);
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(items[0]).toHaveFocus();
  });

  it('switches by attribute, announces it, and hands focus back', () => {
    setup();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Light' }));
    expect(document.documentElement.dataset.appearance).toBe('light');
    expect(trigger()).toHaveAccessibleName('Appearance: Light');
    expect(screen.getByRole('status')).toHaveTextContent('Appearance: Light');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('moves with the arrows, wraps, and closes on Escape', () => {
    setup();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    const items = screen.getAllByRole('menuitemradio');
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(items[2]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('closes when pressed outside', () => {
    setup();
    fireEvent.click(trigger());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
