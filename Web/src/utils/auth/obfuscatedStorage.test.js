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
      SHA256: vi.fn(() => ({
        toString: () => 'mockhash123456789012345678901234'
      }))
    }
  };
});

describe('obfuscatedStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should store encrypted items in localStorage', () => {
    obfuscatedStorage.setItem('test_key', 'test_value');
    expect(CryptoJS.AES.encrypt).toHaveBeenCalledWith('test_value', expect.any(String));
    expect(localStorage.getItem('test_key')).toBe('encrypted-test_value');
  });

  it('should retrieve and decrypt items from localStorage', () => {
    localStorage.setItem('test_key', 'encrypted-test_value');
    const value = obfuscatedStorage.getItem('test_key');
    expect(CryptoJS.AES.decrypt).toHaveBeenCalledWith('encrypted-test_value', expect.any(String));
    expect(value).toBe('test_value');
  });

  it('should return null if item does not exist', () => {
    const value = obfuscatedStorage.getItem('missing_key');
    expect(value).toBeNull();
  });

  it('should remove an item from localStorage', () => {
    localStorage.setItem('test_key', 'encrypted-test_value');
    obfuscatedStorage.removeItem('test_key');
    expect(localStorage.getItem('test_key')).toBeNull();
  });

  it('should clear all items for a specific role', () => {
    localStorage.setItem('admin_token', 'token123');
    localStorage.setItem('admin_user', 'user_data');
    localStorage.setItem('player_token', 'token456');

    obfuscatedStorage.clearForRole('admin');

    expect(localStorage.getItem('admin_token')).toBeNull();
    expect(localStorage.getItem('admin_user')).toBeNull();
    // Should preserve other roles
    expect(localStorage.getItem('player_token')).toBe('token456');
  });

  it('should clear legacy keys when calling clearForRole', () => {
    localStorage.setItem('token', 'legacy_token');
    localStorage.setItem('user', 'legacy_user');
    localStorage.setItem('userType', 'legacy_type');
    
    obfuscatedStorage.clearForRole('admin');

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('userType')).toBeNull();
  });

  it('should completely clear localStorage', () => {
    localStorage.setItem('key1', 'value1');
    localStorage.setItem('key2', 'value2');
    
    obfuscatedStorage.clear();

    expect(localStorage.length).toBe(0);
  });
});
