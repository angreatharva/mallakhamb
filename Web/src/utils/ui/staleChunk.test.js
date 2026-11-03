import { describe, it, expect, vi } from 'vitest';
import { isStaleChunkError, reloadOnceForNewDeploy } from './staleChunk';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
};

describe('isStaleChunkError', () => {
  it('recognises each browser\'s missing-module message', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/JudgeDashboard-abc.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('leaves real screen bugs alone', () => {
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe('reloadOnceForNewDeploy', () => {
  it('reloads the first time', () => {
    const reload = vi.fn();
    expect(reloadOnceForNewDeploy({ storage: memoryStorage(), reload, now: 1000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never loops: a second failure within 30 s shows the error instead', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    reloadOnceForNewDeploy({ storage, reload, now: 1000 });
    expect(reloadOnceForNewDeploy({ storage, reload, now: 20_000 })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a later deploy may reload again', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    reloadOnceForNewDeploy({ storage, reload, now: 1000 });
    expect(reloadOnceForNewDeploy({ storage, reload, now: 60_000 })).toBe(true);
  });
});
