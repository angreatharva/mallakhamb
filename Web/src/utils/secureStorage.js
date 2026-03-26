// Simple encrypted storage wrapper for sensitive data
import CryptoJS from 'crypto-js';
import { logger } from './logger';

// Generate a more robust encryption key
const getEncryptionKey = () => {
  const envKey = import.meta.env.VITE_STORAGE_KEY || 'mallakhamb-india-2026';
  
  // Use multiple browser fingerprinting factors for better entropy
  const browserFingerprint = [
    navigator.userAgent.substring(0, 30),
    navigator.language || 'en',
    screen.colorDepth || '24',
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset().toString()
  ].join('|');
  
  // Hash the fingerprint for consistent length
  const fingerprintHash = CryptoJS.SHA256(browserFingerprint).toString().substring(0, 32);
  
  return `${envKey}-${fingerprintHash}`;
};

export const secureStorage = {
  setItem: (key, value) => {
    try {
      const encrypted = CryptoJS.AES.encrypt(value, getEncryptionKey()).toString();
      localStorage.setItem(key, encrypted);
    } catch (error) {
      logger.error('Failed to encrypt data:', error);
      // Do not fall back to plain storage - fail silently to avoid exposing sensitive data
    }
  },
  
  getItem: (key) => {
    try {
      const encrypted = localStorage.getItem(key);
      if (!encrypted) return null;
      
      const decrypted = CryptoJS.AES.decrypt(encrypted, getEncryptionKey());
      const value = decrypted.toString(CryptoJS.enc.Utf8);
      return value || null;
    } catch (error) {
      logger.error('Failed to decrypt data:', error);
      return null; // Do not fall back to plain storage
    }
  },
  
  removeItem: (key) => {
    localStorage.removeItem(key);
  },
  
  clear: () => {
    localStorage.clear();
  }
};
