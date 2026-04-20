/**
 * Factories Smoke Tests
 *
 * Verifies that all factory functions produce valid data objects
 * with the expected shape and default values.
 */

const {
  newId,
  resetSequences,
  buildPlayer,
  buildPlayers,
  buildCoach,
  buildCoaches,
  buildAdmin,
  buildSuperAdmin,
  buildAdmins,
  buildCompetition,
  buildOngoingCompetition,
  buildCompletedCompetition,
  buildCompetitions,
  buildTeam,
  buildTeams,
  buildPlayerScore,
  buildScore,
  buildScores,
  buildJudge,
  buildTokenPayload,
} = require('./factories');

beforeEach(() => {
  resetSequences();
});

describe('newId', () => {
  it('should return a 24-character hex string (ObjectId)', () => {
    const id = newId();
    expect(typeof id).toBe('string');
    expect(id).toHaveLength(24);
    expect(id).toMatch(/^[a-f0-9]{24}$/);
  });

  it('should return unique IDs on each call', () => {
    const ids = new Set(Array.from({ length: 10 }, () => newId()));
    expect(ids.size).toBe(10);
  });
});

describe('buildPlayer', () => {
  it('should return a player with required fields', () => {
    const player = buildPlayer();
    expect(player).toMatchObject({
      firstName: expect.any(String),
      lastName: expect.any(String),
      email: expect.stringContaining('@test.com'),
      password: expect.any(String),
      gender: expect.stringMatching(/^(Male|Female)$/),
      isActive: true,
    });
    expect(player._id).toBeDefined();
  });

  it('should allow overriding fields', () => {
    const player = buildPlayer({ firstName: 'Alice', gender: 'Female' });
    expect(player.firstName).toBe('Alice');
    expect(player.gender).toBe('Female');
  });

  it('should produce unique emails for each call', () => {
    const p1 = buildPlayer();
    const p2 = buildPlayer();
    expect(p1.email).not.toBe(p2.email);
  });
});

describe('buildPlayers', () => {
  it('should return the requested number of players', () => {
    const players = buildPlayers(5);
    expect(players).toHaveLength(5);
  });

  it('should apply overrides to all players', () => {
    const players = buildPlayers(3, { gender: 'Female' });
    players.forEach((p) => expect(p.gender).toBe('Female'));
  });
});

describe('buildCoach', () => {
  it('should return a coach with required fields', () => {
    const coach = buildCoach();
    expect(coach).toMatchObject({
      name: expect.any(String),
      email: expect.stringContaining('@test.com'),
      password: expect.any(String),
      isActive: true,
    });
  });

  it('should allow overriding fields', () => {
    const coach = buildCoach({ name: 'Bob Coach' });
    expect(coach.name).toBe('Bob Coach');
  });
});

describe('buildAdmin', () => {
  it('should return an admin with role "admin" by default', () => {
    const admin = buildAdmin();
    expect(admin.role).toBe('admin');
    expect(admin.competitions).toEqual([]);
  });
});

describe('buildSuperAdmin', () => {
  it('should return an admin with role "super_admin"', () => {
    const sa = buildSuperAdmin();
    expect(sa.role).toBe('super_admin');
  });
});

describe('buildCompetition', () => {
  it('should return a competition with required fields', () => {
    const comp = buildCompetition();
    expect(comp).toMatchObject({
      name: expect.any(String),
      level: 'state',
      status: 'upcoming',
      registeredTeams: [],
    });
    expect(comp.startDate).toBeInstanceOf(Date);
    expect(comp.endDate).toBeInstanceOf(Date);
    expect(comp.endDate.getTime()).toBeGreaterThan(comp.startDate.getTime());
  });

  it('should allow overriding fields', () => {
    const comp = buildCompetition({ level: 'national', status: 'ongoing' });
    expect(comp.level).toBe('national');
    expect(comp.status).toBe('ongoing');
  });
});

describe('buildOngoingCompetition', () => {
  it('should return a competition with status "ongoing"', () => {
    const comp = buildOngoingCompetition();
    expect(comp.status).toBe('ongoing');
  });
});

describe('buildCompletedCompetition', () => {
  it('should return a competition with status "completed"', () => {
    const comp = buildCompletedCompetition();
    expect(comp.status).toBe('completed');
  });
});

describe('buildTeam', () => {
  it('should return a team with required fields', () => {
    const team = buildTeam();
    expect(team).toMatchObject({
      name: expect.any(String),
      coach: expect.any(String),
      isActive: true,
    });
  });

  it('should allow overriding the coach', () => {
    const coachId = newId();
    const team = buildTeam({ coach: coachId });
    expect(team.coach).toBe(coachId);
  });
});

describe('buildScore', () => {
  it('should return a score with required fields', () => {
    const score = buildScore();
    expect(score).toMatchObject({
      competition: expect.any(String),
      judge: expect.any(String),
      gender: 'Male',
      ageGroup: 'Under18',
      competitionType: 'competition_1',
      isLocked: false,
    });
    expect(score.playerScores).toHaveLength(1);
  });

  it('should allow overriding fields', () => {
    const score = buildScore({ gender: 'Female', isLocked: true });
    expect(score.gender).toBe('Female');
    expect(score.isLocked).toBe(true);
  });
});

describe('buildPlayerScore', () => {
  it('should return a player score with judge scores', () => {
    const ps = buildPlayerScore();
    expect(ps.judgeScores).toBeDefined();
    expect(ps.executionAverage).toBeGreaterThanOrEqual(0);
    expect(ps.finalScore).toBeGreaterThanOrEqual(0);
  });
});

describe('buildJudge', () => {
  it('should return a judge with required fields', () => {
    const judge = buildJudge();
    expect(judge).toMatchObject({
      username: expect.any(String),
      role: 'judge',
      isActive: true,
    });
  });
});

describe('buildTokenPayload', () => {
  it('should return a token payload with userId and userType', () => {
    const payload = buildTokenPayload({ userId: 'abc123', userType: 'admin' });
    expect(payload.userId).toBe('abc123');
    expect(payload.userType).toBe('admin');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });
});

describe('buildCompetitions / buildTeams / buildScores', () => {
  it('buildCompetitions returns the correct count', () => {
    expect(buildCompetitions(4)).toHaveLength(4);
  });

  it('buildTeams returns the correct count', () => {
    expect(buildTeams(3)).toHaveLength(3);
  });

  it('buildScores returns the correct count', () => {
    expect(buildScores(2)).toHaveLength(2);
  });
});
