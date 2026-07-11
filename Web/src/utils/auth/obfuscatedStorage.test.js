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
