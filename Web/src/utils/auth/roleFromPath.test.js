import { describe, it, expect } from 'vitest';
import { getRoleFromPath, getLoginPathFromPath, getLoginPathForRole } from './roleFromPath';

describe('roleFromPath utilities', () => {
  describe('getRoleFromPath', () => {
    it('should return player for /player paths', () => {
      expect(getRoleFromPath('/player/dashboard')).toBe('player');
      expect(getRoleFromPath('/player/select-team')).toBe('player');
    });

    it('should return superadmin for /superadmin paths', () => {
      expect(getRoleFromPath('/superadmin/dashboard')).toBe('superadmin');
    });

    it('should return admin for /admin paths', () => {
      expect(getRoleFromPath('/admin/dashboard')).toBe('admin');
    });

    it('should handle missing or invalid paths', () => {
      expect(getRoleFromPath(null)).toBeNull();
      expect(getRoleFromPath(undefined)).toBeNull();
      expect(getRoleFromPath('/unknown')).toBeNull();
      expect(getRoleFromPath('/')).toBeNull();
    });

    it('should not confuse /superadmin with /admin', () => {
      // Because /superadmin starts with /superadmin but contains 'admin', 
      // the order is important.
      expect(getRoleFromPath('/superadmin/dashboard')).not.toBe('admin');
      expect(getRoleFromPath('/superadmin/dashboard')).toBe('superadmin');
    });
  });

  describe('getLoginPathFromPath', () => {
    it('should return the correct login path based on URL', () => {
      expect(getLoginPathFromPath('/coach/dashboard')).toBe('/coach/login');
      expect(getLoginPathFromPath('/judge/scoring')).toBe('/judge/login');
    });

    it('should return / for unknown paths', () => {
      expect(getLoginPathFromPath('/some/random/path')).toBe('/');
      expect(getLoginPathFromPath(null)).toBe('/');
    });
  });

  describe('getLoginPathForRole', () => {
    it('should return the correct login path for a valid role', () => {
      expect(getLoginPathForRole('player')).toBe('/player/login');
      expect(getLoginPathForRole('superadmin')).toBe('/superadmin/login');
    });

    it('should return / for invalid roles', () => {
      expect(getLoginPathForRole('hacker')).toBe('/');
      expect(getLoginPathForRole(null)).toBe('/');
    });
  });
});
