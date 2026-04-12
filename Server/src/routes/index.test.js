/**
 * Route Loader Tests
 * 
 * Tests for the route loader module to ensure routes are registered correctly
 */

const { getRouteGroups } = require('./index');

describe('Route Loader', () => {
  describe('getRouteGroups', () => {
    it('should return all route groups', () => {
      const groups = getRouteGroups();
      
      expect(groups).toHaveProperty('health');
      expect(groups).toHaveProperty('auth');
      expect(groups).toHaveProperty('players');
      expect(groups).toHaveProperty('coaches');
      expect(groups).toHaveProperty('admin');
      expect(groups).toHaveProperty('competitions');
      expect(groups).toHaveProperty('teams');
      expect(groups).toHaveProperty('scoring');
    });

    it('should return correct route paths', () => {
      const groups = getRouteGroups();
      
      expect(groups.health).toBe('/api/health');
      expect(groups.auth).toBe('/api/auth');
      expect(groups.players).toBe('/api/players');
      expect(groups.coaches).toBe('/api/coaches');
      expect(groups.admin).toBe('/api/admin');
      expect(groups.competitions).toBe('/api/competitions');
      expect(groups.teams).toBe('/api/teams');
      expect(groups.scoring).toBe('/api/scoring');
    });

    it('should include all expected route groups', () => {
      const groups = getRouteGroups();
      const expectedGroups = [
        'health',
        'auth',
        'players',
        'coaches',
        'admin',
        'superadmin',
        'judge',
        'competitions',
        'teams',
        'scoring',
        'public'
      ];
      
      expectedGroups.forEach(group => {
        expect(groups).toHaveProperty(group);
        expect(groups[group]).toMatch(/^\/api\//);
      });
    });
  });
});
