import { expect, afterEach, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Silence React Router v6 future-flag warnings in tests (opt-in happens in app Router, not MemoryRouter-heavy tests)
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args) => {
    const first = args[0];
    if (
      typeof first === 'string' &&
      first.includes('React Router Future Flag')
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };
});
afterAll(() => {
  console.warn = originalWarn;
});

// jsdom does not implement canvas; avoid noisy "Not implemented: getContext" without native `canvas` bindings
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContextStub() {
    return {
      fillRect: () => {},
      clearRect: () => {},
      measureText: () => ({ width: 0 }),
    };
  };
}

// Mock IntersectionObserver for tests
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
};

// Mock matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Cleanup after each test case
afterEach(() => {
  cleanup();
});
