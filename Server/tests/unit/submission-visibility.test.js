/**
 * Who may see a team, an athlete, and a score — and when.
 *
 * Two rules, enforced across four services:
 *
 *   1. A team a coach has only DRAFTED (no final submit, no fees paid) is
 *      invisible to judges, to the scorer, to admins' scoring screens and to
 *      the public. So are athletes the coach never entered, even on a team
 *      that IS submitted.
 *
 *   2. A score reaches the public results page only after BOTH the Senior
 *      Judge's Final Submit (per-athlete `isFinalized`) AND the Scorer's
 *      Save & Lock (per-sheet `isLocked`). Either one alone shows nothing.
 *
 * These are disclosure rules, so every test states the failure it prevents
 * rather than just asserting a shape.
 */

const {
  isSubmittedRegistration,
  findSubmittedRegistration,
  registeredPlayerIds,
} = require('../../src/utils/data/team-visibility.util');
const PublicService = require('../../src/services/public/public.service');
const JudgeService = require('../../src/services/user/judge.service');
const ScoringService = require('../../src/services/scoring/scoring.service');
const { AuthorizationError } = require('../../src/errors');

const noopLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DRAFT_TEAM = 'team-draft';
const ENTERED_TEAM = 'team-entered';

/** One `Competition.registeredTeams[]` entry. */
const registration = (teamId, { isSubmitted, players = [], isActive = true }) => ({
  team: { _id: teamId, name: teamId, coach: { _id: 'coach-1', name: 'Coach' } },
  coach: { _id: 'coach-1', name: 'Coach' },
  isSubmitted,
  isActive,
  paymentStatus: isSubmitted ? 'completed' : 'pending',
  players: players.map((p) => ({
    player: { _id: p.id, firstName: p.first, lastName: p.last },
    gender: p.gender || 'Male',
    ageGroup: p.ageGroup || 'Under14',
    apparatus: {},
  })),
});

/**
 * A competition holding one submitted team and one the coach is still
 * building — the exact situation reported: the coach saves a draft and the
 * panel starts seeing it.
 */
const competitionWithADraft = () => ({
  _id: 'comp-1',
  registeredTeams: [
    registration(ENTERED_TEAM, {
      isSubmitted: true,
      players: [{ id: 'p-entered', first: 'Entered', last: 'Athlete' }],
    }),
    registration(DRAFT_TEAM, {
      isSubmitted: false,
      players: [{ id: 'p-draft', first: 'Draft', last: 'Athlete' }],
    }),
  ],
});

/** One `Score.playerScores[]` row. */
const playerScore = (playerId, name, { isFinalized }) => ({
  playerId,
  playerName: name,
  isFinalized,
  judgeScores: { seniorJudge: 8, judge1: 8, judge2: 8, judge3: 8, judge4: 8 },
  averageMarks: 8,
  finalScore: 8,
});

// ---------------------------------------------------------------------------
// The shared rule
// ---------------------------------------------------------------------------

describe('isSubmittedRegistration', () => {
  it('rejects a draft even when the roster is complete and looks ready', () => {
    expect(
      isSubmittedRegistration(
        registration(DRAFT_TEAM, { isSubmitted: false, players: [{ id: 'p1', first: 'A', last: 'B' }] })
      )
    ).toBe(false);
  });

  it('accepts a submitted registration whose isActive predates the field', () => {
    // Defaulted true in the schema; documents written before it existed have
    // it undefined and must not be hidden from a live panel.
    const rt = registration(ENTERED_TEAM, { isSubmitted: true });
    delete rt.isActive;
    expect(isSubmittedRegistration(rt)).toBe(true);
  });

  it('rejects a withdrawn team', () => {
    expect(isSubmittedRegistration(registration(ENTERED_TEAM, { isSubmitted: true, isActive: false }))).toBe(false);
  });

  it('fails closed on a missing registration rather than throwing', () => {
    expect(isSubmittedRegistration(undefined)).toBe(false);
    expect(isSubmittedRegistration(null)).toBe(false);
  });

  it('does not accept a truthy non-boolean isSubmitted', () => {
    expect(isSubmittedRegistration({ isSubmitted: 'yes', isActive: true })).toBe(false);
  });
});

describe('findSubmittedRegistration', () => {
  it('returns null for a drafted team, indistinguishable from "no such team"', () => {
    const comp = competitionWithADraft();
    expect(findSubmittedRegistration(comp, DRAFT_TEAM)).toBeNull();
    expect(findSubmittedRegistration(comp, 'team-that-does-not-exist')).toBeNull();
  });

  it('finds the submitted registration', () => {
    expect(findSubmittedRegistration(competitionWithADraft(), ENTERED_TEAM)).toMatchObject({ isSubmitted: true });
  });

  it('fails closed when the competition could not be loaded', () => {
    expect(findSubmittedRegistration(null, ENTERED_TEAM)).toBeNull();
  });
});

describe('registeredPlayerIds', () => {
  it('lists only the athletes actually entered', () => {
    const rt = registration(ENTERED_TEAM, {
      isSubmitted: true,
      players: [{ id: 'p1', first: 'A', last: 'One' }, { id: 'p2', first: 'B', last: 'Two' }],
    });
    expect([...registeredPlayerIds(rt)].sort()).toEqual(['p1', 'p2']);
  });

  it('handles unpopulated ObjectId refs', () => {
    expect([...registeredPlayerIds({ players: [{ player: 'p9' }] })]).toEqual(['p9']);
  });
});

// ---------------------------------------------------------------------------
// Rule 1 — drafts are invisible
// ---------------------------------------------------------------------------

describe('scoringService.getTeamScores — scorer and admin scoring lists', () => {
  /**
   * The submission filter moved from getTeamScores into
   * `CompetitionRepository.findSubmittedRegistrations`, which applies it in the
   * database (`isSubmitted: true, isActive: { $ne: false }`) so the fetch only
   * transfers the category asked for. `scripts/perf/equivalence.js` proves that
   * query matches `isSubmittedRegistration` against a seeded competition.
   *
   * The double below therefore implements the rule with the SHARED predicate
   * rather than restating it — so these tests still check what they always
   * checked (that getTeamScores surfaces nothing the visibility rule excludes)
   * and cannot pass by agreeing with a private copy of the rule.
   */
  const buildService = (competition) => {
    const competitionRepository = {
      findById: jest.fn(async () => competition),
      findSubmittedRegistrations: jest.fn(async (id, filters = {}) => {
        const rows = (competition?.registeredTeams || []).filter(isSubmittedRegistration);
        if (!filters.gender && !filters.ageGroup) return rows;
        return rows
          .map((row) => ({
            ...row,
            players: (row.players || []).filter((p) =>
              (!filters.gender || p.gender === filters.gender)
              && (!filters.ageGroup || p.ageGroup === filters.ageGroup)),
          }))
          .filter((row) => row.players.length > 0);
      }),
    };
    const scoreRepository = { find: jest.fn(async () => []) };
    return new ScoringService(
      scoreRepository,
      competitionRepository,
      { find: jest.fn() },
      { find: jest.fn() },
      null,
      noopLogger
    );
  };

  it('omits a team the coach has only drafted', async () => {
    // The reported defect: this feed backs /judge/scores/team (the Scorer's
    // team list) and /admin/scores/team, and had no submission filter at all,
    // so a draft sat in the scoring list ready to be scored.
    const teams = await buildService(competitionWithADraft()).getTeamScores('comp-1', 'Under14', 'Male');

    expect(teams.map((t) => String(t._id))).toEqual([ENTERED_TEAM]);
  });

  it('omits a withdrawn team', async () => {
    const comp = { _id: 'comp-1', registeredTeams: [registration(ENTERED_TEAM, { isSubmitted: true, isActive: false, players: [{ id: 'p1', first: 'A', last: 'B' }] })] };
    expect(await buildService(comp).getTeamScores('comp-1', 'Under14', 'Male')).toEqual([]);
  });
});

describe('judgeService.getTeamPlayers — the roster behind /judge/team/:id', () => {
  // The judge principal is an account; the seats it holds come back from the
  // assignment repository.
  const buildService = ({ competition, assignments = [], players = [] }) =>
    new JudgeService({
      judgeRepository: { find: jest.fn(async () => assignments) },
      competitionRepository: { findById: jest.fn(async () => competition) },
      teamRepository: { findById: jest.fn(async (id) => ({ _id: id, name: 'Team', coach: {}, competition: 'comp-1' })) },
      playerRepository: { find: jest.fn(async (query) => players.filter((p) => query._id.$in.includes(p._id))) },
      scoreRepository: { find: jest.fn(async () => []) },
      logger: noopLogger,
    });

  const seat = { _id: 'seat-1', judgeAccount: 'j1', judgeType: 'Judge 1', gender: 'Male', ageGroup: 'Under14', competition: 'comp-1' };

  it('refuses a drafted team', async () => {
    const service = buildService({ competition: competitionWithADraft(), assignments: [seat] });

    await expect(service.getTeamPlayers('j1', DRAFT_TEAM)).rejects.toThrow(AuthorizationError);
  });

  it('refuses when the competition cannot be loaded, instead of skipping the check', async () => {
    // The guard used to be `if (compId) { if (comp) { ... } }`. A deleted or
    // unreadable competition silently disabled it and served the roster.
    const service = buildService({ competition: null, assignments: [seat] });

    await expect(service.getTeamPlayers('j1', DRAFT_TEAM)).rejects.toThrow(AuthorizationError);
  });

  it('refuses a registered judge nobody has put on a panel', async () => {
    // Anyone can register as a judge. Until an admin seats them, they must not
    // be able to read a roster of minors.
    const service = buildService({ competition: competitionWithADraft(), assignments: [] });

    await expect(service.getTeamPlayers('j1', ENTERED_TEAM)).rejects.toThrow(AuthorizationError);
  });

  it('returns only the athletes entered, not everyone on the team roster', async () => {
    // `Player.team` is written the moment a coach drags an athlete onto a
    // team. Querying by it returned the whole squad, so athletes who were
    // never entered appeared on the judge's screen next to the real entries.
    const service = buildService({
      competition: competitionWithADraft(),
      assignments: [seat],
      players: [
        { _id: 'p-entered', firstName: 'Entered', lastName: 'Athlete', gender: 'Male', ageGroup: 'Under14' },
        { _id: 'p-never-entered', firstName: 'Bench', lastName: 'Athlete', gender: 'Male', ageGroup: 'Under14' },
      ],
    });

    const { players } = await service.getTeamPlayers('j1', ENTERED_TEAM);

    expect(players.map((p) => String(p._id))).toEqual(['p-entered']);
  });

  it('never asks the database for athletes outside the entry list', async () => {
    const service = buildService({ competition: competitionWithADraft(), assignments: [seat], players: [] });
    await service.getTeamPlayers('j1', ENTERED_TEAM);

    const [query] = service.playerRepository.find.mock.calls[0];
    expect(query._id.$in).toEqual(['p-entered']);
  });
});

describe('publicService.getPublicTeams', () => {
  it('publishes only submitted teams', async () => {
    const service = new PublicService({
      competitionRepository: { findById: jest.fn(async () => competitionWithADraft()) },
      scoreRepository: { find: jest.fn() },
      logger: noopLogger,
    });

    const teams = await service.getPublicTeams('comp-1');

    expect(teams.map((t) => String(t._id))).toEqual([ENTERED_TEAM]);
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — both signoffs, in order, before anything is public
// ---------------------------------------------------------------------------

describe('publicService.getPublicScores — the /scores results page', () => {
  const buildService = (scoreDocs) => {
    const scoreRepository = { find: jest.fn(async (query) => scoreDocs.filter((d) => (query.isLocked === true ? d.isLocked === true : true))) };
    return {
      service: new PublicService({
        competitionRepository: { findById: jest.fn() },
        scoreRepository,
        logger: noopLogger,
      }),
      scoreRepository,
    };
  };

  const sheet = ({ isLocked, finalized }) => ({
    _id: 'score-1',
    competition: 'comp-1',
    teamId: { _id: ENTERED_TEAM, name: 'Entered' },
    isLocked,
    playerScores: [
      playerScore('p-1', 'Signed Off', { isFinalized: finalized }),
      playerScore('p-2', 'Still Being Judged', { isFinalized: false }),
    ],
  });

  it('shows nothing while the Scorer has not locked the sheet', async () => {
    // Senior Judge has Final Submitted; the Scorer has not saved and locked.
    const { service } = buildService([sheet({ isLocked: false, finalized: true })]);

    expect(await service.getPublicScores('comp-1')).toEqual([]);
  });

  it('shows nothing when the sheet is locked but the Senior Judge never signed off', async () => {
    const { service } = buildService([sheet({ isLocked: true, finalized: false })]);

    expect(await service.getPublicScores('comp-1')).toEqual([]);
  });

  it('publishes only after both signoffs, and only the signed-off athletes', async () => {
    const { service } = buildService([sheet({ isLocked: true, finalized: true })]);

    const results = await service.getPublicScores('comp-1');

    expect(results).toHaveLength(1);
    expect(results[0].playerScores.map((p) => p.playerName)).toEqual(['Signed Off']);
  });

  it('ignores a caller trying to unlock the feed with ?lockedOnly=false', async () => {
    // This endpoint is anonymous. The parameter used to be honoured, so anyone
    // could read a panel's working scores mid-event by asking for them.
    const { service, scoreRepository } = buildService([sheet({ isLocked: false, finalized: true })]);

    const results = await service.getPublicScores('comp-1', { lockedOnly: 'false' });

    expect(results).toEqual([]);

    /*
     * The gate is asserted by what it ACCEPTS, not by the query's shape. It
     * used to be the literal `{ isLocked: true }`; a squad's three apparatus
     * are locked one panel at a time now, so it is that flag OR a non-empty
     * `lockedApparatus`. What must stay true is that both branches are about
     * the lock and neither can be reached from the request.
     */
    const query = scoreRepository.find.mock.calls[0][0];
    expect(query).not.toHaveProperty('lockedOnly');
    expect(query.$or).toEqual([
      { isLocked: true },
      { 'lockedApparatus.0': { $exists: true } },
    ]);
  });
});
