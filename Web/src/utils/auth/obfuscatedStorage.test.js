import { describe, it, expect, beforeEach, vi } from 'vitest';
import { obfuscatedStorage } from './obfuscatedStorage';
import CryptoJS from 'crypto-js';

// Mock CryptoJS to control encryption/decryption in tests
vi.mock('crypto-js', () => {
  return {
    default: {
      AES: {
        encrypt: vi.fn((value, key) => ({
          toString: () => `encrypted-${value}`
        })),
        decrypt: vi.fn((encrypted, key) => {
          const value = encrypted.replace('encrypted-', '');
          return {
            toString: () => value
          };
        })
      },
      enc: { Utf8: 'utf8' },
      // A real digest avalanches: every input byte affects every output byte.
      // The mock must too, since callers take substring(0, 32) — otherwise the
      // stability test below would pass vacuously.
      SHA256: vi.fn((input) => ({
        toString: () => {
          const str = String(input);
          let h = 0;
          for (let i = 0; i < str.length; i++) {
            h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
          }
          return (h >>> 0).toString(16).padStart(8, '0').repeat(8);
        }
      }))
    }
  };
});

describe('obfuscatedStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('should store encrypted items in sessionStorage', () => {
    obfuscatedStorage.setItem('test_key', 'test_value');
    expect(CryptoJS.AES.encrypt).toHaveBeenCalledWith('test_value', expect.any(String));
    expect(sessionStorage.getItem('test_key')).toBe('encrypted-test_value');
  });

  it('should retrieve and decrypt items from sessionStorage', () => {
    sessionStorage.setItem('test_key', 'encrypted-test_value');
    const value = obfuscatedStorage.getItem('test_key');
    expect(CryptoJS.AES.decrypt).toHaveBeenCalledWith('encrypted-test_value', expect.any(String));
    expect(value).toBe('test_value');
  });

  it('should return null if item does not exist', () => {
    const value = obfuscatedStorage.getItem('missing_key');
    expect(value).toBeNull();
  });

  it('should derive a key that survives screen and timezone changes', () => {
    // The key must not depend on volatile browser state: a resolution change or
    // DST shift previously produced a different key, so every stored entry
    // decrypted to garbage ("Malformed UTF-8 data") and logged the user out.
    obfuscatedStorage.setItem('admin_token', 'token123');
    const keyAtWrite = CryptoJS.AES.encrypt.mock.calls[0][1];

    vi.spyOn(screen, 'width', 'get').mockReturnValue(3840);
    vi.spyOn(screen, 'height', 'get').mockReturnValue(2160);
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-330);

    expect(obfuscatedStorage.getItem('admin_token')).toBe('token123');
    expect(CryptoJS.AES.decrypt.mock.calls[0][1]).toBe(keyAtWrite);
  });

  it('should evict an entry it cannot decrypt instead of throwing', () => {
    CryptoJS.AES.decrypt.mockImplementationOnce(() => ({
      toString: () => {
        throw new Error('Malformed UTF-8 data');
      }
    }));
    sessionStorage.setItem('admin_token', 'written-under-an-old-key');

    expect(obfuscatedStorage.getItem('admin_token')).toBeNull();
    // Evicted, so the repeated reads ProtectedRoute does per render stay quiet
    expect(sessionStorage.getItem('admin_token')).toBeNull();
  });

  it('should remove an item from sessionStorage', () => {
    sessionStorage.setItem('test_key', 'encrypted-test_value');
    obfuscatedStorage.removeItem('test_key');
    expect(sessionStorage.getItem('test_key')).toBeNull();
  });

  it('should clear all items for a specific role', () => {
    sessionStorage.setItem('admin_token', 'token123');
    sessionStorage.setItem('admin_user', 'user_data');
    sessionStorage.setItem('player_token', 'token456');

    obfuscatedStorage.clearForRole('admin');

    expect(sessionStorage.getItem('admin_token')).toBeNull();
    expect(sessionStorage.getItem('admin_user')).toBeNull();
    // Should preserve other roles
    expect(sessionStorage.getItem('player_token')).toBe('token456');
  });

  it('should clear legacy keys when calling clearForRole', () => {
    sessionStorage.setItem('token', 'legacy_token');
    sessionStorage.setItem('user', 'legacy_user');
    sessionStorage.setItem('userType', 'legacy_type');
    
    obfuscatedStorage.clearForRole('admin');

    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('user')).toBeNull();
    expect(sessionStorage.getItem('userType')).toBeNull();
  });

  it('should completely clear sessionStorage', () => {
    sessionStorage.setItem('key1', 'value1');
    sessionStorage.setItem('key2', 'value2');
    
    obfuscatedStorage.clear();

    expect(sessionStorage.length).toBe(0);
  });
});
