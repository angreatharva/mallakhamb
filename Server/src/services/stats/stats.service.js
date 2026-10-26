/**
 * Stats Service
 *
 * The graphs behind the profile Stats tabs (player, coach, judge) and the admin
 * Judge fairness board. Read-only; nothing here writes.
 *
 * Three rules hold for every number it returns:
 *
 *  1. Only PUBLISHED marks count — the Senior Judge's Final Submit and the
 *     Scorer's lock, exactly the rule the public results page applies
 *     (utils/scoring/published-score.util). A panel mid-event never reaches a
 *     graph.
 *  2. Placings and category context come from PublicService.getPublicScores,
 *     the same ranked rows the results board renders, so a profile can never
 *     disagree with the board about a rank.
 *  3. Difficulty / Combination / Execution are the published breakdown average
 *     (utils/scoring/slip-breakdown.util), the server twin of what the board
 *     shows.
 *
 * Players and coaches never receive judge names or judge account ids: a
 * performance's panel is described by seat ("Judge 2") only.
 */

const { apparatusKey, getCombinationChecklist } = require('../../config/cop-rules');
const { ValidationError, AuthorizationError } = require('../../errors');
const { publishedScoreQuery, publishedPlayerScores } = require('../../utils/scoring/published-score.util');
const { enrichPlayerScore } = require('../../utils/scoring/player-row.util');
const { averageSlipBreakdown, slipsBySeat } = require('../../utils/scoring/slip-breakdown.util');
const { PANEL_JUDGE_TYPES } = require('../../utils/scoring/judge-slip.util');
const { buildSeatIndex, resolveSlipAuthor } = require('../../utils/stats/slip-attribution.util');
const {
  THRESHOLDS, round3, mean, median, describe, compareGroups, panelDeviation, stateKey,
} = require('../../utils/stats/judge-lean.util');

const idOf = (value) => (value && value._id ? String(value._id) : value ? String(value) : '');
const SECTION_KEYS = ['difficulty', 'combination', 'execution'];

class StatsService {
  /**
   * @param {Object} deps
   * @param {import('../../repositories/score.repository')} deps.scoreRepository
   * @param {import('../../repositories/competition.repository')} deps.competitionRepository
   * @param {import('../../repositories/team.repository')} deps.teamRepository
   * @param {import('../../repositories/judge.repository')} deps.judgeRepository
   * @param {import('../../repositories/judge-account.repository')} deps.judgeAccountRepository
   * @param {import('../public/public.service')} deps.publicService
   * @param {Object} deps.logger
   */
  constructor({
    scoreRepository, competitionRepository, teamRepository, judgeRepository,
    judgeAccountRepository, publicService, logger,
  }) {
    this.scoreRepository = scoreRepository;
    this.competitionRepository = competitionRepository;
    this.teamRepository = teamRepository;
    this.judgeRepository = judgeRepository;
    this.judgeAccountRepository = judgeAccountRepository;
    this.publicService = publicService;
    this.logger = logger;
  }

  // ───────────────────────────── Player ─────────────────────────────

  /**
   * Every published performance of one athlete, with the context to read it.
   * @param {Object} player - the authenticated player (`_id`, names)
   */
  async getPlayerStats(player) {
    const playerId = idOf(player);
    const docs = await this.scoreRepository.find(
      publishedScoreQuery({ 'playerScores.playerId': player._id || playerId }),
      { populate: [{ path: 'teamId', select: 'name stateUnit' }] }
    );

    const pairs = [];
    for (const doc of docs) {
      for (const row of publishedPlayerScores(doc)) {
        if (idOf(row.playerId) === playerId) pairs.push({ doc, row });
      }
    }

    const performances = await this.buildPerformances(pairs);
    const name = [player.firstName, player.lastName].filter(Boolean).join(' ')
      || pairs[0]?.row.playerName || '';

    return {
      player: { id: playerId, name },
      competitions: competitionList(performances),
      performances,
      checklists: checklistsFor(performances),
      summary: summarizeAthlete(performances),
    };
  }

  // ───────────────────────────── Coach ─────────────────────────────

  /**
   * Every published performance of every athlete on the coach's teams, plus
   * each team's Team Championship placing per meet.
   * @param {Object} coach - the authenticated coach
   */
  async getCoachStats(coach) {
    const teams = await this.teamRepository.findByCoach(coach._id);
    const teamIds = (teams || []).map((t) => t._id);
    if (teamIds.length === 0) {
      return { teams: [], competitions: [], performances: [], athletes: [], teamTrend: [], checklists: {} };
    }

    const docs = await this.scoreRepository.find(
      publishedScoreQuery({ teamId: { $in: teamIds } }),
      { populate: [{ path: 'teamId', select: 'name stateUnit' }] }
    );
    const pairs = docs.flatMap((doc) => publishedPlayerScores(doc).map((row) => ({ doc, row })));
    const performances = await this.buildPerformances(pairs, { withPanel: false });

    // One card per athlete: who they are and their headline numbers.
    const byAthlete = new Map();
    for (const p of performances) {
      if (!byAthlete.has(p.playerId)) byAthlete.set(p.playerId, []);
      byAthlete.get(p.playerId).push(p);
    }
    const athletes = [...byAthlete.entries()].map(([playerId, list]) => ({
      playerId,
      name: list[0].playerName,
      teamId: list[0].teamId,
      teamName: list[0].teamName,
      gender: list[0].gender,
      ageGroup: list[0].ageGroup,
      ...summarizeAthlete(list),
    }));

    const teamTrend = await this.teamTrend(docs, new Set(teamIds.map(String)));

    return {
      teams: (teams || []).map((t) => ({ id: idOf(t), name: t.name })),
      competitions: competitionList(performances),
      performances,
      athletes,
      teamTrend,
      checklists: checklistsFor(performances),
    };
  }

  /** The coach's teams' Team Championship total and place, per meet and category. */
  async teamTrend(docs, coachTeamIds) {
    const categories = new Map();
    for (const doc of docs) {
      if (doc.competitionType !== 'Competition I') continue;
      const key = `${idOf(doc.competition)}|${doc.gender}|${doc.ageGroup}`;
      categories.set(key, { competitionId: idOf(doc.competition), gender: doc.gender, ageGroup: doc.ageGroup });
    }
    const competitions = await this.loadCompetitions([...categories.values()].map((c) => c.competitionId));

    const trend = [];
    for (const category of categories.values()) {
      let standing = [];
      try {
        standing = await this.publicService.getPublicTeamChampionship(category.competitionId, {
          gender: category.gender, ageGroup: category.ageGroup,
        });
      } catch (error) {
        this.logger.warn('Team championship unavailable for stats', { ...category, error: error.message });
        continue;
      }
      const comp = competitions.get(category.competitionId) || {};
      for (const team of standing) {
        if (!coachTeamIds.has(String(team.teamId))) continue;
        trend.push({
          competitionId: category.competitionId,
          competitionName: comp.name || '',
          date: comp.startDate || null,
          gender: category.gender,
          ageGroup: category.ageGroup,
          teamId: String(team.teamId),
          teamName: team.teamName,
          total: round3(team.totalScore),
          rank: team.rank ?? null,
          teamsInStanding: standing.length,
        });
      }
    }
    return trend.sort(byDate);
  }

  // ─────────────────────── Performances (shared) ───────────────────────

  /**
   * Shape published rows into performances, with their category context.
   * @param {Array<{doc:Object,row:Object}>} pairs
   * @param {{withPanel?: boolean}} [options] - include the per-seat panel strip
   */
  async buildPerformances(pairs, { withPanel = true } = {}) {
    const competitions = await this.loadCompetitions(pairs.map(({ doc }) => idOf(doc.competition)));
    const boards = new Map();
    const boardFor = (doc) => {
      const key = `${idOf(doc.competition)}|${doc.gender}|${doc.ageGroup}|${doc.competitionType}`;
      if (!boards.has(key)) boards.set(key, this.categoryBoard(doc));
      return boards.get(key);
    };

    const performances = [];
    for (const { doc, row } of pairs) {
      const board = await boardFor(doc);
      const comp = competitions.get(idOf(doc.competition)) || {};
      performances.push(buildPerformance({ doc, row, comp, board, withPanel }));
    }
    return performances.sort(byDate);
  }

  /**
   * One category's published, ranked standing, summarised per apparatus.
   * Read through PublicService so ranks are the board's ranks.
   */
  async categoryBoard(doc) {
    let scoreDocs = [];
    try {
      scoreDocs = await this.publicService.getPublicScores(idOf(doc.competition), {
        gender: doc.gender,
        ageGroup: doc.ageGroup,
        competitionType: doc.competitionType,
      });
    } catch (error) {
      this.logger.warn('Category standing unavailable for stats', {
        competitionId: idOf(doc.competition), error: error.message,
      });
    }

    const byApparatus = new Map();
    for (const scoreDoc of scoreDocs) {
      for (const row of scoreDoc.playerScores || []) {
        const app = apparatusKey(row.apparatus);
        if (!byApparatus.has(app)) byApparatus.set(app, []);
        byApparatus.get(app).push(row);
      }
    }

    const summaries = new Map();
    for (const [app, rows] of byApparatus) {
      const sections = rows.map((r) => averageSlipBreakdown(r.judgeSlips, r.panelSize)).filter(Boolean);
      const scores = rows.map((r) => Number(r.finalScore) || 0);
      summaries.set(app, {
        fieldSize: rows.length,
        average: round3(mean(scores)),
        best: round3(Math.max(...scores)),
        sectionAverage: Object.fromEntries(SECTION_KEYS.map((k) => [k, round3(mean(sections.map((s) => s[k])))])),
        sectionBest: Object.fromEntries(SECTION_KEYS.map((k) => [k, sections.length ? round3(Math.max(...sections.map((s) => s[k]))) : null])),
        rankByPlayer: new Map(rows.map((r) => [idOf(r.playerId), r.rank ?? null])),
      });
    }
    return summaries;
  }

  /** Competition headers by id (name, level, place, dates). */
  async loadCompetitions(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const comps = await this.competitionRepository.find(
      { _id: { $in: unique } },
      { select: 'name level place year startDate endDate' }
    );
    return new Map((comps || []).map((c) => [idOf(c), {
      id: idOf(c), name: c.name, level: c.level, place: c.place,
      year: c.year, startDate: c.startDate, endDate: c.endDate,
    }]));
  }

  // ───────────────────────────── Judges ─────────────────────────────

  /**
   * A judge's own marking pattern ("Marking insights").
   * @param {Object} account - the authenticated JudgeAccount
   * @param {{competitionId?: string}} [filters]
   */
  async getJudgeStats(account, { competitionId } = {}) {
    const accountId = idOf(account);
    const { entries, competitions } = await this.collectJudgeMarks({
      accountIds: new Set([accountId]),
      competitionIds: competitionId ? [competitionId] : null,
    });
    const allMeets = competitionId
      ? (await this.collectJudgeMarks({ accountIds: new Set([accountId]) })).competitions
      : competitions;

    return {
      judge: {
        id: accountId,
        name: [account.firstName, account.lastName].filter(Boolean).join(' '),
        stateUnit: account.stateUnit || null,
      },
      competitions: allMeets,
      scope: { competitionId: competitionId || null },
      thresholds: THRESHOLDS,
      ...judgeProfile(entries, account.stateUnit, competitions),
    };
  }

  /**
   * The admin Judge fairness board: every judge × every team they marked.
   *
   * An admin sees the meets they are assigned to and must name one; a super
   * admin sees any meet, or all of them together.
   *
   * @param {{user: Object, userType: string, competitionId?: string}} params
   */
  async getJudgeIntegrity({ user, userType, competitionId }) {
    const isSuperAdmin = userType === 'superadmin' || user?.role === 'superadmin';
    if (!isSuperAdmin) {
      if (!competitionId) throw new ValidationError('Choose a competition', 'competitionId');
      const allowed = (user?.competitions || []).map(idOf);
      if (!allowed.includes(String(competitionId))) {
        throw new AuthorizationError('You are not assigned to this competition');
      }
    }

    const { entries, competitions } = await this.collectJudgeMarks({
      accountIds: null,
      competitionIds: competitionId ? [competitionId] : null,
    });

    const accountIds = [...new Set(entries.map((e) => e.accountId))];
    const accounts = accountIds.length
      ? await this.judgeAccountRepository.find(
        { _id: { $in: accountIds } },
        { select: 'firstName lastName stateUnit certificationLevel' }
      )
      : [];
    const accountById = new Map((accounts || []).map((a) => [idOf(a), a]));

    const byJudge = groupBy(entries, (e) => e.accountId);
    const judges = [];
    const cells = [];
    const flags = [];

    for (const [accountId, list] of byJudge) {
      const acc = accountById.get(accountId) || {};
      const name = [acc.firstName, acc.lastName].filter(Boolean).join(' ') || 'Unknown judge';
      const profile = judgeProfile(list, acc.stateUnit, competitions);
      judges.push({
        id: accountId,
        name,
        stateUnit: acc.stateUnit || null,
        certificationLevel: acc.certificationLevel || null,
        performances: list.length,
        strictness: profile.summary.strictness,
        agreement: profile.summary.agreement,
        inferredShare: profile.summary.inferredShare,
        homeState: profile.homeState,
        flaggedTeams: profile.byTeam.filter((t) => t.flagged).length,
      });
      for (const team of profile.byTeam) {
        cells.push({ judgeId: accountId, ...team });
        if (team.flagged) flags.push({ kind: 'team', judgeId: accountId, judgeName: name, ...team });
      }
      if (profile.homeState?.flagged) {
        flags.push({ kind: 'homeState', judgeId: accountId, judgeName: name, stateUnit: acc.stateUnit, ...profile.homeState });
      }
    }

    const teams = [...groupBy(entries, (e) => e.teamId).entries()].map(([teamId, list]) => ({
      id: teamId, name: list[0].teamName, stateUnit: list[0].teamState || null, performances: list.length,
    })).sort((a, b) => a.name.localeCompare(b.name));

    judges.sort((a, b) => b.flaggedTeams - a.flaggedTeams || Math.abs(b.strictness.mean || 0) - Math.abs(a.strictness.mean || 0));
    flags.sort((a, b) => Math.abs(b.lean) - Math.abs(a.lean));

    return {
      scope: { competitionId: competitionId || null },
      competitions,
      thresholds: THRESHOLDS,
      performances: new Set(entries.map((e) => e.rowKey)).size,
      judges,
      teams,
      cells,
      flags,
    };
  }

  /**
   * Every published mark the given judges gave, as a deviation from the rest of
   * the panel on that performance.
   *
   * @param {{accountIds: Set<string>|null, competitionIds?: string[]|null}} scope
   *   `accountIds` null = every judge
   */
  async collectJudgeMarks({ accountIds, competitionIds = null }) {
    const seatQuery = { judgeAccount: { $type: 'objectId' } };
    if (accountIds) seatQuery.judgeAccount = { $in: [...accountIds] };
    if (competitionIds) seatQuery.competition = { $in: competitionIds };
    const ownSeats = await this.judgeRepository.find(seatQuery);

    // Inference needs every seat of every meet involved, not only this judge's.
    const meetIds = competitionIds || [...new Set(ownSeats.map((s) => idOf(s.competition)))];
    const allSeats = accountIds && meetIds.length
      ? await this.judgeRepository.find({ competition: { $in: meetIds }, judgeAccount: { $type: 'objectId' } })
      : ownSeats;
    const seatIndex = buildSeatIndex(allSeats);

    let docQuery;
    if (competitionIds) {
      docQuery = { competition: { $in: competitionIds } };
    } else if (accountIds) {
      docQuery = {
        $or: [
          { 'playerScores.judgeSlips.judgeAccountId': { $in: [...accountIds] } },
          ...(meetIds.length ? [{ competition: { $in: meetIds } }] : []),
        ],
      };
    } else {
      docQuery = {};
    }

    const docs = await this.scoreRepository.find(publishedScoreQuery(docQuery), {
      populate: [{ path: 'teamId', select: 'name stateUnit' }],
    });

    const entries = [];
    for (const doc of docs) {
      const teamId = idOf(doc.teamId);
      for (const row of publishedPlayerScores(doc)) {
        const bySeat = slipsBySeat(row.judgeSlips);
        const deviations = {};
        for (const seat of Object.keys(bySeat)) {
          const dev = panelDeviation(seat, bySeat);
          if (dev) deviations[seat] = dev;
        }
        const worst = Object.entries(deviations)
          .sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total))[0]?.[0];

        for (const [seat, dev] of Object.entries(deviations)) {
          const author = resolveSlipAuthor({ doc, row, slip: bySeat[seat].slip, seatIndex });
          if (!author.accountId) continue;
          if (accountIds && !accountIds.has(author.accountId)) continue;
          entries.push({
            accountId: author.accountId,
            attribution: author.attribution,
            rowKey: `${idOf(doc)}:${idOf(row)}`,
            competitionId: idOf(doc.competition),
            teamId,
            teamName: doc.teamId?.name || 'Unknown team',
            teamState: doc.teamId?.stateUnit || null,
            apparatus: apparatusKey(row.apparatus),
            seat,
            deviation: dev,
            outlier: Boolean(row.baseScoreApplied) && seat === worst,
          });
        }
      }
    }

    const competitions = await this.loadCompetitions(entries.map((e) => e.competitionId));
    return { entries, competitions: [...competitions.values()].sort(byDate) };
  }
}

// ───────────────────────────── helpers ─────────────────────────────

function groupBy(list, keyOf) {
  const map = new Map();
  for (const item of list) {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function byDate(a, b) {
  const da = a.date ?? a.startDate;
  const db = b.date ?? b.startDate;
  return (da ? new Date(da).getTime() : 0) - (db ? new Date(db).getTime() : 0);
}

/** The meets a list of performances spans, oldest first. */
function competitionList(performances) {
  const seen = new Map();
  for (const p of performances) {
    if (!seen.has(p.competitionId)) {
      seen.set(p.competitionId, {
        id: p.competitionId, name: p.competitionName, level: p.competitionLevel, date: p.date,
      });
    }
  }
  return [...seen.values()].sort(byDate);
}

/** The COP checklist rule text, once per apparatus that appears. */
function checklistsFor(performances) {
  const out = {};
  for (const p of performances) {
    if (!out[p.apparatus]) out[p.apparatus] = getCombinationChecklist(p.apparatus).map(({ id, rule, penalty }) => ({ id, rule, penalty }));
  }
  return out;
}

/** Slips with a detailed breakdown among those the published average counted. */
function detailedSlips(row, countedSeats) {
  const bySeat = slipsBySeat(row.judgeSlips);
  const pool = (countedSeats?.length ? countedSeats : Object.keys(bySeat)).map((seat) => bySeat[seat]).filter(Boolean);
  return pool.map((s) => s.slip?.breakdown).filter((b) => b && typeof b === 'object' && Object.keys(b).length > 0);
}

/** How many of the counted judges marked each checklist item as met. */
function checklistSummary(row, apparatus, countedSeats) {
  const breakdowns = detailedSlips(row, countedSeats)
    .filter((b) => b.combination && b.combination.checked && typeof b.combination.checked === 'object');
  if (breakdowns.length === 0) return null;
  const items = getCombinationChecklist(apparatus).map((item) => ({
    id: item.id,
    metBy: breakdowns.filter((b) => Boolean(b.combination.checked[item.id] ?? b.combination.checked[String(item.id)])).length,
  }));
  return { of: breakdowns.length, items };
}

/** The A / B / C element counts the counted judges agreed on (median). */
function elementSummary(row, countedSeats) {
  const breakdowns = detailedSlips(row, countedSeats).filter((b) => b.difficulty && typeof b.difficulty === 'object');
  if (breakdowns.length === 0) return null;
  const pick = (key) => Math.round(median(breakdowns.map((b) => Number(b.difficulty[key]) || 0)));
  return { a: pick('aClass'), b: pick('bClass'), c: pick('cClass') };
}

const SEAT_ORDER = PANEL_JUDGE_TYPES;

function buildPerformance({ doc, row, comp, board, withPanel }) {
  const apparatus = apparatusKey(row.apparatus);
  const enriched = enrichPlayerScore(row);
  const sections = averageSlipBreakdown(row.judgeSlips, row.panelSize);
  const context = board.get(apparatus) || null;
  const playerId = idOf(row.playerId);

  const performance = {
    key: `${idOf(doc)}:${idOf(row)}`,
    competitionId: idOf(doc.competition),
    competitionName: comp.name || '',
    competitionLevel: comp.level || null,
    date: comp.startDate || null,
    competitionType: doc.competitionType,
    gender: doc.gender,
    ageGroup: doc.ageGroup,
    apparatus,
    teamId: idOf(doc.teamId),
    teamName: doc.teamId?.name || '',
    playerId,
    playerName: row.playerName,
    finalScore: round3(Number(enriched.finalScore) || 0),
    rank: context?.rankByPlayer.get(playerId) ?? null,
    fieldSize: context?.fieldSize ?? null,
    sections: sections ? {
      difficulty: round3(sections.difficulty),
      combination: round3(sections.combination),
      execution: round3(sections.execution),
      bonus: round3(sections.bonus),
    } : null,
    deductions: { time: round3(Number(row.deduction) || 0), other: round3(Number(row.otherDeduction) || 0) },
    time: row.time || '',
    category: context ? {
      average: context.average,
      best: context.best,
      sectionAverage: context.sectionAverage,
      sectionBest: context.sectionBest,
    } : null,
    checklist: checklistSummary(row, apparatus, sections?.countedSeats),
    elements: elementSummary(row, sections?.countedSeats),
  };

  if (withPanel) {
    const bySeat = slipsBySeat(row.judgeSlips);
    const counted = new Set(sections?.countedSeats || []);
    performance.panel = SEAT_ORDER.filter((seat) => bySeat[seat]).map((seat) => ({
      seat,
      total: round3(bySeat[seat].total),
      counted: counted.has(seat),
    }));
  }
  return performance;
}

/** Headline numbers for one athlete's performances. */
function summarizeAthlete(performances) {
  if (performances.length === 0) {
    return { performances: 0, meets: 0, average: null, personalBest: null, bestRank: null, improvement: null };
  }
  const best = performances.reduce((a, b) => (b.finalScore > a.finalScore ? b : a));
  const ranked = performances.filter((p) => p.rank);
  const bestRank = ranked.length ? ranked.reduce((a, b) => (b.rank < a.rank ? b : a)) : null;

  const meets = groupBy(performances, (p) => p.competitionId);
  const meetAverages = [...meets.values()]
    .map((list) => ({ date: list[0].date, avg: mean(list.map((p) => p.finalScore)) }))
    .sort(byDate);
  const improvement = meetAverages.length >= 2
    ? round3(meetAverages[meetAverages.length - 1].avg - meetAverages[0].avg)
    : null;

  return {
    performances: performances.length,
    meets: meets.size,
    average: round3(mean(performances.map((p) => p.finalScore))),
    personalBest: { score: best.finalScore, competitionName: best.competitionName, apparatus: best.apparatus, key: best.key },
    bestRank: bestRank ? { rank: bestRank.rank, fieldSize: bestRank.fieldSize, competitionName: bestRank.competitionName, apparatus: bestRank.apparatus, key: bestRank.key } : null,
    improvement,
  };
}

/**
 * One judge's marking pattern from their deviation entries.
 * Leans are computed on every mark; a FLAG needs the recorded marks alone to
 * clear the bar, because inferred authorship is a best guess.
 */
function judgeProfile(entries, judgeState, competitions = []) {
  const totals = entries.map((e) => e.deviation.total);
  const recorded = entries.filter((e) => e.attribution === 'recorded');

  const summary = {
    performances: entries.length,
    strictness: describe(totals),
    agreement: round3(mean(totals.map(Math.abs))),
    sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, describe(entries.map((e) => e.deviation[k]))])),
    outliers: entries.filter((e) => e.outlier).length,
    inferredShare: entries.length ? round3((entries.length - recorded.length) / entries.length) : 0,
  };

  const compById = new Map(competitions.map((c) => [c.id, c]));
  const byCompetition = [...groupBy(entries, (e) => e.competitionId).entries()].map(([id, list]) => {
    const stats = describe(list.map((e) => e.deviation.total));
    return {
      competitionId: id,
      name: compById.get(id)?.name || '',
      date: compById.get(id)?.startDate || null,
      performances: list.length,
      strictness: stats.mean,
      agreement: stats.meanAbs,
    };
  }).sort(byDate);

  const home = stateKey(judgeState);
  const byTeam = [...groupBy(entries, (e) => e.teamId).entries()].map(([teamId, list]) => {
    const all = compareGroups(
      list.map((e) => e.deviation.total),
      entries.filter((e) => e.teamId !== teamId).map((e) => e.deviation.total)
    );
    const sure = compareGroups(
      list.filter((e) => e.attribution === 'recorded').map((e) => e.deviation.total),
      recorded.filter((e) => e.teamId !== teamId).map((e) => e.deviation.total)
    );
    return {
      teamId,
      teamName: list[0].teamName,
      stateUnit: list[0].teamState || null,
      isHomeState: Boolean(home) && stateKey(list[0].teamState) === home,
      ...all,
      flagged: sure.flagged,
      inferred: list.filter((e) => e.attribution !== 'recorded').length,
    };
  }).sort((a, b) => Math.abs(b.lean ?? 0) - Math.abs(a.lean ?? 0));

  let homeState = null;
  if (home) {
    const isHome = (e) => stateKey(e.teamState) === home;
    const all = compareGroups(entries.filter(isHome).map((e) => e.deviation.total), entries.filter((e) => !isHome(e)).map((e) => e.deviation.total));
    const sure = compareGroups(recorded.filter(isHome).map((e) => e.deviation.total), recorded.filter((e) => !isHome(e)).map((e) => e.deviation.total));
    if (all.n > 0) homeState = { ...all, flagged: sure.flagged };
  }

  return { summary, byCompetition, byTeam, homeState };
}


module.exports = StatsService;
