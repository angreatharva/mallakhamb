import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AppearanceProvider, useAppearance } from './AppearanceProvider';
import { APPEARANCE_STORAGE_KEY } from '@/utils/ui/appearance';

const Probe = () => {
  const { preference, appearance, setPreference } = useAppearance();
  return (
    <div>
      <span data-testid="state">{`${preference}/${appearance}`}</span>
      <button type="button" onClick={() => setPreference('light')}>light</button>
      <button type="button" onClick={() => setPreference('system')}>system</button>
    </div>
  );
};

describe('AppearanceProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-appearance');
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
  });

  it('starts dark and marks the document', () => {
    render(<AppearanceProvider><Probe /></AppearanceProvider>);
    expect(screen.getByTestId('state').textContent).toBe('dark/dark');
    expect(document.documentElement.dataset.appearance).toBe('dark');
  });

  it('switches by attribute and persists the choice', () => {
    render(<AppearanceProvider><Probe /></AppearanceProvider>);
    act(() => screen.getByText('light').click());
    expect(screen.getByTestId('state').textContent).toBe('light/light');
    expect(document.documentElement.dataset.appearance).toBe('light');
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('light');
  });

  it('does not re-render children that do not read the appearance', () => {
    let renders = 0;
    const Bystander = () => { renders += 1; return null; };
    render(<AppearanceProvider><Probe /><Bystander /></AppearanceProvider>);
    const before = renders;
    act(() => screen.getByText('light').click());
    expect(renders).toBe(before);
  });

  it('follows another tab', () => {
    render(<AppearanceProvider><Probe /></AppearanceProvider>);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: APPEARANCE_STORAGE_KEY, newValue: 'light' }));
    });
    expect(screen.getByTestId('state').textContent).toBe('light/light');
  });

  it('throws a named error outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/AppearanceProvider/);
    spy.mockRestore();
  });
});
