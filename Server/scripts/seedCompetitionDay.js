#!/usr/bin/env node
/**
 * Competition day over HTTP — what the admin desk and the panels do around the
 * scoring, done the way their screens do it. Four steps of `setup:api`:
 *
 *   node scripts/seedCompetitionDay.js order        # before scores
 *   node scripts/seedCompetitionDay.js results one  # after Competition I is judged
 *   node scripts/seedCompetitionDay.js corrections  # after results
 *   node scripts/seedCompetitionDay.js finals       # Finalize all ready finals + checks
 *   node scripts/seedCompetitionDay.js results finals  # after the finals are judged
 *   node scripts/seedCompetitionDay.js judges       # after corrections
 *   PLACE=Nagpur node scripts/seedCompetitionDay.js results   # one meet
 *
 * order        Admin → Lots: draws the running order of every category at every
 *              meet (teams and athletes, POST /admin/lots/draw), checks the
 *              draw is a proper order (positions 0…n-1, lot numbers 1…n, every
 *              submitted team and athlete in it), and starts every category
 *              (POST /admin/age-groups/start; a second start is refused).
 *              Then the panel: the Senior Judge reverses one category's team
 *              order and one team's athletes (PUT /judge/lots/*), an evaluation
 *              judge reads exactly that order and may NOT change it, the Scorer
 *              puts it back, and a judge cannot open a meet they hold no seat at.
 *
 * results      Admin → Scores, for every category, type and apparatus: the
 *              individual standing (ranks follow the finals; level finals are
 *              either separated by the tie-break or share a place awaiting a
 *              lucky draw), the public results show the same finals, and the
 *              team championship (admin and public) equals the best 5 of each
 *              6-a-side team per apparatus, summed, recomputed here from the
 *              published rows. Then one lucky draw per meet is RECORDED (the
 *              physical draw's result, never random), checked, cleared and
 *              recorded again; a draw for athletes who are not tied is refused.
 *
 * corrections  Admin → Scoring on one category of each panel size: unlock the
 *              sheet (PUT /admin/scores/:id/unlock — it leaves the public board),
 *              save it with one athlete's time corrected exactly as the admin
 *              screen posts it, locked (POST /admin/scores/save) — the public
 *              final moves by that time band's deduction — then put it back.
 *
 * judges       Every judge's own screens: the meets they are offered
 *              (GET /judge/competitions) are exactly the meets the panel plan
 *              seats them at; at each one their assignments carry the plan's seat
 *              (the "seat travels with the meet" bug); the meet, its panel and a
 *              team's athletes read back; profile read, saved and the password
 *              changed and changed back.
 *
 * Every write goes through a route, as the screens do. Exits 1 on any failed
 * check, listing them all.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { ApiClient, DEFAULT_BASE } = require('./perf/lib/client');
const roster = require('./lib/roster');
const { allMeets, competitionTypesOf } = require('./lib/meets');
const { readPlan, withTimeKeeper, seatsFor, panelsForType, finalsPanelSeats } = require('./lib/panel-plan');
const { offeredApparatus } = require('../src/utils/data/competition-apparatus.util');
const { getTimeDeductionForTime } = require('../src/config/cop-rules');

const STEP = process.argv[2];
const BASE_URL = String(process.env.SEED_API_URL || process.env.PERF_BASE_URL || DEFAULT_BASE)
  .replace(/\/+$/, '').replace(/\/api$/, '');
const ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL || 'admin@gmail.com',
  password: process.env.SEED_ADMIN_PASSWORD || 'Admin@2026',
};
const SUPERADMIN = {
  email: process.env.SEED_SUPERADMIN_EMAIL || 'Superadmin@gmail.com',
  password: process.env.SEED_SUPERADMIN_PASSWORD || 'Superadmin@2026',
};
const DISPLAY = { competition_1: 'Competition I', competition_2: 'Competition II', competition_3: 'Competition III' };
// `results one` reads Competition I only, `results finals` the finals only.
const STAGE = process.argv[3] || null;

// ── reporting ───────────────────────────────────────────────────────────────
/*
 * Defects this run has FOUND and that are not fixed yet. Each is still checked
 * every run: while it reproduces it is reported as KNOWN (the run stays green
 * — it is already on the list, deploy/oci/archive/E2E-COVERAGE.md "Found by the run");
 * the day it stops reproducing the check FAILS, so the entry is removed and the
 * check becomes an ordinary one. A known defect can never go quiet.
 */
const KNOWN_DEFECTS = {
  // Empty: 'admin-scoring-apparatus' (Admin → Scoring corrupting multi-apparatus
  // sheets) was fixed on 2026-10-24 — Web utils/scoring/adminSheet.js — and its
  // check below is now an ordinary one.
};
const known = [];
function knownDefect(id, reproduces, detail = '') {
  if (reproduces) {
    known.push(id);
    say('KNOWN', id, detail);
    return;
  }
  expectThat(false, `known defect "${id}" no longer reproduces`, 'remove it from KNOWN_DEFECTS and E2E-COVERAGE.md');
}
const problems = [];
const tally = { ok: 0 };
const say = (mark, what, detail = '') => console.log(`  ${mark.padEnd(6)}${what.padEnd(46)}${detail}`);
function expectThat(ok, what, detail = '') {
  if (ok) { tally.ok += 1; return true; }
  problems.push(`${what}${detail ? ` — ${detail}` : ''}`);
  say('FAIL', what, detail);
  return false;
}
const reasonOf = (r) => r?.body?.error?.message || r?.body?.message || `HTTP ${r?.status}`;
const dataOf = (r) => r?.body?.data ?? r?.body;
const listOf = (r, key) => {
  const d = dataOf(r);
  if (Array.isArray(d)) return d;
  return Array.isArray(d?.[key]) ? d[key] : [];
};
const ids = (list) => list.map((x) => String(x._id));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const round2 = (n) => Math.round(Number(n) * 100) / 100;

// ── sessions ────────────────────────────────────────────────────────────────
async function asAdmin() {
  const client = new ApiClient({ baseUrl: BASE_URL, label: ADMIN.email });
  const r = await client.login('/api/admin/login', ADMIN);
  if (!r.ok) throw new Error(`admin sign-in: ${reasonOf(r)}`);
  return client;
}

let judgePasswords = null;
async function passwordOf(email) {
  if (!judgePasswords) {
    judgePasswords = new Map((await roster.allJudges()).map((j) => [j.email.toLowerCase(), j.password]));
  }
  return judgePasswords.get(String(email).toLowerCase());
}

/** Move a signed-in judge's session to another meet, as the arena picker does (keeps the re-scoped token). */
async function switchMeet(client, competitionId) {
  const set = await client.put(`/api/judge/competition/${competitionId}/set`, {});
  if (!set.ok) return set;
  if (dataOf(set)?.token) client.bearer = dataOf(set).token;
  client.competitionId = competitionId;
  return null;
}

/** A judge signed in and bound to one meet. */
async function asJudge(email, competitionId) {
  const client = new ApiClient({ baseUrl: BASE_URL, label: email });
  const r = await client.login('/api/judge/login', { email, password: await passwordOf(email) });
  if (!r.ok) throw new Error(`judge sign-in ${email}: ${reasonOf(r)}`);
  const refused = competitionId ? await switchMeet(client, competitionId) : null;
  return refused ? { client, refused } : { client };
}

// ── the season ──────────────────────────────────────────────────────────────
async function season() {
  const plan = readPlan();
  const listed = listOf(await new ApiClient({ baseUrl: BASE_URL }).get('/api/public/competitions'), 'competitions');
  const byPlace = new Map(listed.map((c) => [c.place, c]));
  const only = process.env.PLACE ? process.env.PLACE.split(',').map((p) => p.trim()) : null;
  return allMeets()
    .filter((m) => !only || only.includes(m.place))
    .map((m) => {
      const competition = byPlace.get(m.place);
      if (!competition) throw new Error(`no competition at ${m.place} — run the competitions step first`);
      const meetPlan = plan.meets.find((p) => p.place === m.place);
      return { ...m, competition, plan: meetPlan, seats: withTimeKeeper(meetPlan.seats) };
    });
}

/**
 * The categories a competition type is judged in: Competition I per age group,
 * Competition II as one "All ages" final per gender (automatic finals,
 * docs/archive/qualification-plan.md). See scripts/lib/panel-plan#panelsForType.
 */
const categoriesOf = (meet, type = 'competition_1') => panelsForType(meet.plan, type)
  .map((p) => ({ gender: p.gender, ageGroup: p.ageGroup, size: p.size }));
const isFinal = (type) => type !== 'competition_1';

// ── order ───────────────────────────────────────────────────────────────────
function checkOrder(roster_, where) {
  // A final (Competition II / III) runs player-wise: ONE order of every
  // finalist, whatever the team (owner, 2026-11-17).
  if (roster_.playerWise) {
    const athletes = roster_.athletes || [];
    const positions = athletes.map((a) => a.position);
    const lots = athletes.map((a) => a.lotNo).sort((a, b) => a - b);
    let ok = expectThat(roster_.hasOrder && athletes.length > 0 && same(positions, athletes.map((_, i) => i)), `${where}: one athlete order 0…${athletes.length - 1}, player-wise`, JSON.stringify(positions));
    ok = expectThat(same(lots, athletes.map((_, i) => i + 1)), `${where}: athlete lots 1…${athletes.length}`, JSON.stringify(lots)) && ok;
    return ok;
  }
  const teams = roster_.teams || [];
  const positions = teams.map((t) => t.position);
  const lots = teams.map((t) => t.lotNo).sort((a, b) => a - b);
  let ok = expectThat(roster_.hasOrder && same(positions, teams.map((_, i) => i)), `${where}: team order 0…${teams.length - 1}`, JSON.stringify(positions));
  ok = expectThat(same(lots, teams.map((_, i) => i + 1)), `${where}: team lots 1…${teams.length}`, JSON.stringify(lots)) && ok;
  for (const team of teams) {
    const p = team.players.map((x) => x.position);
    ok = expectThat(same(p, team.players.map((_, i) => i)), `${where}: ${team.name} athlete order`, JSON.stringify(p)) && ok;
  }
  return ok;
}

async function stepOrder() {
  const admin = await asAdmin();
  for (const meet of await season()) {
    admin.competitionId = String(meet.competition._id);
    let drawn = 0;
    let started = 0;
    for (const type of competitionTypesOf(meet)) {
      for (const cat of categoriesOf(meet, type)) {
        const q = { gender: cat.gender, ageGroup: cat.ageGroup, competitionType: type };
        const where = `${meet.place} ${cat.gender} ${cat.ageGroup} ${DISPLAY[type]}`;
        if (isFinal(type)) {
          // A final has nobody in it until Competition I is locked: started now,
          // its lots are drawn by the results step once the engine has filled it.
          const start = await admin.post('/api/admin/age-groups/start', q);
          if (start.ok) started += 1;
          else if (!/already been started/i.test(reasonOf(start))) expectThat(false, `${where}: start`, reasonOf(start));
          continue;
        }
        const draw = await admin.post('/api/admin/lots/draw', { ...q, includePlayers: true });
        if (!expectThat(draw.ok, `${where}: draw lots`, reasonOf(draw))) continue;
        const read = await admin.get('/api/admin/lots', { query: q });
        if (checkOrder(dataOf(read), where)) drawn += 1;

        const start = await admin.post('/api/admin/age-groups/start', q);
        if (start.ok) started += 1;
        else if (!/already been started/i.test(reasonOf(start))) expectThat(false, `${where}: start`, reasonOf(start));
        const again = await admin.post('/api/admin/age-groups/start', q);
        expectThat(again.status === 400 && /already been started/i.test(reasonOf(again)), `${where}: a second start is refused`, `HTTP ${again.status}`);
      }
    }

    // The panel's half, on the category with the most teams.
    const q0 = { competitionType: 'competition_1' };
    let pick = null;
    for (const cat of categoriesOf(meet)) {
      const r = dataOf(await admin.get('/api/admin/lots', { query: { ...q0, gender: cat.gender, ageGroup: cat.ageGroup } }));
      if (!pick || r.teams.length > pick.teams.length) pick = { ...r, cat };
    }
    const q = { ...q0, gender: pick.cat.gender, ageGroup: pick.cat.ageGroup };
    const where = `${meet.place} ${q.gender} ${q.ageGroup}`;
    const drawnTeams = ids(pick.teams);
    const reversed = [...drawnTeams].reverse();
    const firstTeam = pick.teams.find((t) => t.players.length > 1) || pick.teams[0];
    const athletes = ids(firstTeam.players).reverse();

    const sr = await asJudge(meet.seats['Senior Judge'], admin.competitionId);
    const j1 = await asJudge(meet.seats['Judge 1'], admin.competitionId);
    const scorer = await asJudge(meet.seats.Scorer, admin.competitionId);
    const put1 = await sr.client.put('/api/judge/lots/teams', { ...q, teamIds: reversed });
    const put2 = await sr.client.put('/api/judge/lots/players', { ...q, teamId: String(firstTeam._id), playerIds: athletes });
    expectThat(put1.ok && put2.ok, `${where}: Senior Judge re-sequences`, `${reasonOf(put1)} / ${reasonOf(put2)}`);
    const seen = dataOf(await j1.client.get('/api/judge/lots', { query: q }));
    expectThat(same(ids(seen.teams), reversed), `${where}: Judge 1 reads the new team order`, ids(seen.teams).join(','));
    const seenTeam = seen.teams.find((t) => String(t._id) === String(firstTeam._id));
    expectThat(same(ids(seenTeam?.players || []), athletes), `${where}: Judge 1 reads the new athlete order`);
    const denied = await j1.client.put('/api/judge/lots/teams', { ...q, teamIds: drawnTeams });
    expectThat(denied.status === 403, `${where}: Judge 1 may not re-sequence`, `HTTP ${denied.status}`);
    const back = await scorer.client.put('/api/judge/lots/teams', { ...q, teamIds: drawnTeams });
    const now = dataOf(await admin.get('/api/admin/lots', { query: q }));
    expectThat(back.ok && same(ids(now.teams), drawnTeams), `${where}: Scorer restores the drawn order`, reasonOf(back));

    say('ok', `${meet.place}`, `${drawn} orders drawn, ${started} categories started, panel re-sequenced`);
  }

  // A judge cannot step into a meet they hold no seat at.
  const meets = await season();
  const [first] = meets;
  const outsider = meets.slice(1).find((m) => !Object.values(m.seats).includes(first.seats['Senior Judge']));
  if (outsider) {
    const attempt = await asJudge(first.seats['Senior Judge'], String(outsider.competition._id));
    expectThat(attempt.refused && attempt.refused.status >= 400, `${first.seats['Senior Judge']} cannot open ${outsider.place}`,
      attempt.refused ? `HTTP ${attempt.refused.status}` : 'was let in');
  }
}

// ── results ─────────────────────────────────────────────────────────────────
function standing(individual, apparatus) {
  return individual
    .flatMap((p) => (p.scores || []).map((s) => ({ ...s, playerId: String(s.playerId ?? p.playerId) })))
    .filter((s) => s.apparatus === apparatus && s.isFinalized);
}

function checkStanding(rows, where) {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  let ok = true;
  for (let i = 1; i < sorted.length; i += 1) {
    const [a, b] = [sorted[i - 1], sorted[i]];
    if (Number(a.finalScore) < Number(b.finalScore)) {
      ok = expectThat(false, `${where}: rank ${a.rank} has a lower final than rank ${b.rank}`, `${a.finalScore} < ${b.finalScore}`) && ok;
    }
    if (a.rank === b.rank) {
      const level = Number(a.finalScore) === Number(b.finalScore);
      const waiting = a.tieBreakInfo?.awaitingLuckyDraw && b.tieBreakInfo?.awaitingLuckyDraw;
      ok = expectThat(level && (waiting || a.tieBreakInfo), `${where}: a shared place is a real, unresolved tie`,
        `${a.playerName} ${a.finalScore} / ${b.playerName} ${b.finalScore}`) && ok;
    }
  }
  return ok;
}

/**
 * The team championship recomputed HERE, from the individual standing of this
 * category and competition type (not from the board's own rows, which is how a
 * board that pooled Competition I and II once agreed with itself): per team,
 * per apparatus, the best (size − 1) finals, summed.
 */
function championship(rows, maxTeamSize) {
  const counted = Number(maxTeamSize) === 4 ? 3 : 5;
  const byTeam = new Map();
  for (const r of rows) {
    const team = byTeam.get(r.teamName) || new Map();
    team.set(r.apparatus, [...(team.get(r.apparatus) || []), Number(r.finalScore) || 0]);
    byTeam.set(r.teamName, team);
  }
  return [...byTeam].map(([name, byApparatus]) => ({
    name,
    total: round2([...byApparatus.values()]
      .reduce((sum, finals) => sum + finals.sort((a, b) => b - a).slice(0, counted).reduce((x, y) => x + y, 0), 0)),
  }));
}

async function stepResults() {
  const admin = await asAdmin();
  const pub = new ApiClient({ baseUrl: BASE_URL, label: 'public' });
  const superadmin = STAGE === 'finals' ? await asSuperAdmin() : null;
  let draws = 0;
  for (const meet of await season()) {
    admin.competitionId = String(meet.competition._id);
    const competition = meet.competition;
    const maxTeamSize = competition.maxTeamSize || 6;
    let standings = 0;
    let teamBoards = 0;
    // The finals stage records no lucky draw: Competition I's are drawn already.
    let drawnHere = STAGE === 'finals';
    const typesHere = competitionTypesOf(meet)
      .filter((t) => (STAGE === 'one' ? t === 'competition_1' : STAGE === 'finals' ? t !== 'competition_1' : true));
    for (const type of typesHere) {
      for (const cat of categoriesOf(meet, type)) {
        const base = { gender: cat.gender, ageGroup: cat.ageGroup, competitionType: type };
        const where = `${meet.place} ${cat.gender} ${cat.ageGroup} ${DISPLAY[type]}`;
        const publicDocs = listOf(await pub.get('/api/public/scores', { query: { competitionId: admin.competitionId, ...base } }));
        const categoryRows = [];
        const publicFinals = new Map(publicDocs.flatMap((d) => (d.playerScores || [])
          .map((s) => [`${s.playerId}|${s.apparatus}`, Number(s.finalScore)])));

        for (const apparatus of offeredApparatus(competition, type, cat.gender)) {
          const read = await admin.get('/api/admin/scores/individual', { query: { ...base, apparatus } });
          if (!expectThat(read.ok, `${where} ${apparatus}: individual standing`, reasonOf(read))) continue;
          const rows = standing(dataOf(read), apparatus);
          if (!rows.length) continue;
          categoryRows.push(...rows);
          checkStanding(rows, `${where} ${apparatus}`);
          const mismatched = rows.filter((r) => publicFinals.get(`${r.playerId}|${apparatus}`) !== Number(r.finalScore));
          expectThat(mismatched.length === 0, `${where} ${apparatus}: public results show the same finals`,
            mismatched.slice(0, 3).map((r) => `${r.playerName} admin ${r.finalScore} public ${publicFinals.get(`${r.playerId}|${apparatus}`)}`).join('; '));
          standings += 1;

          // One recorded lucky draw per meet: the physical draw's result, entered by the admin.
          const waiting = rows.filter((r) => r.tieBreakInfo?.awaitingLuckyDraw);
          if (!drawnHere && waiting.length >= 2) {
            const key = waiting[0].tieBreakInfo.tieGroupKey;
            const group = waiting.filter((r) => r.tieBreakInfo.tieGroupKey === key);
            const order = group.map((r) => r.playerId).reverse();
            const body = { ...base, apparatus, order };
            const recorded = await admin.post('/api/admin/tie-break/draws', body);
            const after = standing(dataOf(await admin.get('/api/admin/scores/individual', { query: { ...base, apparatus } })), apparatus);
            const placed = order.map((id) => after.find((r) => r.playerId === id));
            const followsDraw = placed.every((r, i) => r && !r.tieBreakInfo?.awaitingLuckyDraw
              && (i === 0 || r.rank > placed[i - 1].rank));
            expectThat(recorded.ok && followsDraw, `${where} ${apparatus}: a recorded lucky draw sets the order`,
              recorded.ok ? placed.map((r) => `${r?.playerName}:${r?.rank}`).join(' ') : reasonOf(recorded));
            const cleared = await admin.del('/api/admin/tie-break/draws', { body: { ...base, apparatus, groupKey: key } });
            const reopened = standing(dataOf(await admin.get('/api/admin/scores/individual', { query: { ...base, apparatus } })), apparatus)
              .filter((r) => r.tieBreakInfo?.tieGroupKey === key);
            expectThat(cleared.ok && reopened.every((r) => r.tieBreakInfo.awaitingLuckyDraw), `${where} ${apparatus}: clearing the draw reopens the tie`, reasonOf(cleared));
            const again = await admin.post('/api/admin/tie-break/draws', body);
            expectThat(again.ok, `${where} ${apparatus}: the draw can be recorded again`, reasonOf(again));
            // Two different finals cannot be a tie, however the standing reads.
            const a = rows[0];
            const b = rows.find((r) => Number(r.finalScore) !== Number(a.finalScore));
            const untied = b ? [a.playerId, b.playerId] : [];
            if (untied.length === 2) {
              const refused = await admin.post('/api/admin/tie-break/draws', { ...base, apparatus, order: untied });
              expectThat(refused.status === 400, `${where} ${apparatus}: a draw for athletes not tied is refused`, `HTTP ${refused.status}`);
            }
            drawnHere = true;
            draws += 1;
          }
        }

        // Team championship: Competition I's alone (finals are about the player).
        if (isFinal(type)) continue;
        // Team championship: admin board, public board, and the rule recomputed here.
        const boardRead = await admin.get('/api/admin/scores/team-rankings', { query: base });
        if (!expectThat(boardRead.ok, `${where}: team rankings`, reasonOf(boardRead))) continue;
        const board = listOf(boardRead);
        if (!board.length) continue;
        const want = championship(categoryRows, maxTeamSize);
        const got = board.map((t) => ({ teamId: String(t._id), name: t.name, total: round2(t.totalScore), rank: t.rank }));
        const wrong = want.filter((w) => got.find((g) => g.name === w.name)?.total !== w.total);
        expectThat(wrong.length === 0, `${where}: team totals = best ${Number(maxTeamSize) === 4 ? 3 : 5} per apparatus`,
          wrong.map((w) => `${w.name} want ${w.total} got ${got.find((g) => g.name === w.name)?.total}`).join('; '));
        const byRank = [...got].sort((a, b) => a.rank - b.rank);
        expectThat(byRank.every((t, i) => i === 0 || t.total <= byRank[i - 1].total), `${where}: team ranks follow the totals`,
          byRank.map((t) => `${t.rank}:${t.total}`).join(' '));
        if (type === 'competition_1') {
          const publicBoard = listOf(await pub.get('/api/public/team-championship', { query: { competitionId: admin.competitionId, gender: cat.gender, ageGroup: cat.ageGroup } }));
          const differs = got.filter((g) => round2(publicBoard.find((p) => String(p.teamId) === g.teamId)?.totalScore) !== g.total);
          expectThat(differs.length === 0, `${where}: public team championship agrees`, `${differs.length} team(s) differ`);
        }
        teamBoards += 1;
      }
    }
    say('ok', meet.place, `${standings} standings, ${teamBoards} team boards${drawnHere && STAGE !== 'finals' ? ', 1 lucky draw recorded' : ''}`);
    if (STAGE === 'finals' && typesHere.length) await checkFinalsStarted(admin, superadmin, meet);
  }

  // The public reference data the results pages read.
  const rules = dataOf(await pub.get('/api/public/cop-rules'));
  expectThat(rules?.timeMinimumSeconds === 60 && rules?.timeLimitSeconds === 90, 'public COP rules: the 60–90 s window', JSON.stringify([rules?.timeMinimumSeconds, rules?.timeLimitSeconds]));
  if (STAGE !== 'finals') say('ok', 'lucky draws', `${draws} recorded, cleared and re-recorded`);
}

// ── finals ──────────────────────────────────────────────────────────────────
/**
 * The admin's "Finalize all ready finals" (docs/archive/qualification-plan.md), after
 * Competition I is judged, published and corrected. Per meet:
 *
 *  - before: no final is finalized and no final's squad has anybody in it;
 *  - a tie at a cut is settled the way the admin does it (III: the lucky draw
 *    on the Competition I standing; II: the draw on the final's card);
 *  - finalize-all as the ADMIN: every final with qualifiers is finalized and
 *    nothing is left "not ready";
 *  - Competition II recomputed here from the PUBLIC Competition I results (one
 *    All-ages final per gender: the top 2 of every age group by the sum over
 *    every apparatus, no team cap); Competition III from the admin standing (top 10, at most 2 per
 *    team, by rank);
 *  - every final category's squad is exactly its qualifiers, the public page
 *    lists the finalized finals, the admin cannot reopen one and the Super
 *    Admin can (and finalizes it again), a second finalize-all finds nothing;
 *  - lots drawn for every final category, checked as a proper order.
 */
const finalTypesOf = (meet) => competitionTypesOf(meet).filter((t) => t !== 'competition_1');

async function asSuperAdmin() {
  const client = new ApiClient({ baseUrl: BASE_URL, label: SUPERADMIN.email });
  const r = await client.login('/api/superadmin/login', SUPERADMIN);
  if (!r.ok) throw new Error(`Super Admin sign-in: ${reasonOf(r)}`);
  return client;
}

const finalsOf = async (admin) => dataOf(await admin.get('/api/admin/finals'))?.finals || [];

/** The squad of one final category, as the judges and the lots read it. */
async function squadOf(admin, gender, ageGroup, competitionType) {
  return listOf(await admin.get('/api/admin/teams/submitted', { query: { gender, ageGroup, competitionType } }))
    .flatMap((t) => (t.players || []).map((e) => String(e.player?._id || e.player)));
}

/** The final categories of a meet: II one All ages per gender, III per gender + age group. */
const finalCategories = (meet) => finalTypesOf(meet)
  .flatMap((type) => categoriesOf(meet, type).map((cat) => ({ ...cat, type })));

/** Settle the ties waiting at a cut, as the admin does. Returns how many. */
async function settleTies(admin, finals, where) {
  let settled = 0;
  for (const final of finals.filter((f) => f.status === 'waiting_draw')) {
    if (final.competitionType === 'competition_2') {
      for (const ageGroup of [...new Set(final.tied.map((t) => t.ageGroup))]) {
        const order = final.tied.filter((t) => t.ageGroup === ageGroup).map((t) => t.player).reverse();
        const r = await admin.post(`/api/admin/finals/${final._id}/draw`, { ageGroup, order });
        if (expectThat(r.ok, `${where} ${final.label}: the draw on the final's card`, reasonOf(r))) settled += 1;
      }
      continue;
    }
    // Competition III: the physical draw is recorded on the Competition I standing.
    const base = { gender: final.gender, ageGroup: final.ageGroup, competitionType: 'competition_1', apparatus: final.apparatus };
    const rows = standing(dataOf(await admin.get('/api/admin/scores/individual', { query: base })), final.apparatus);
    const tiedIds = new Set(final.tied.map((t) => String(t.player)));
    const keys = [...new Set(rows.filter((r) => tiedIds.has(r.playerId) && r.tieBreakInfo?.awaitingLuckyDraw).map((r) => r.tieBreakInfo.tieGroupKey))];
    for (const key of keys) {
      const order = rows.filter((r) => r.tieBreakInfo?.tieGroupKey === key).map((r) => r.playerId).reverse();
      const r = await admin.post('/api/admin/tie-break/draws', { ...base, order });
      if (expectThat(r.ok, `${where} ${final.label}: the lucky draw on the Competition I standing`, reasonOf(r))) settled += 1;
    }
  }
  return settled;
}

/**
 * Competition II (owner, 2026-11-17): ONE "All ages" final per gender; the TOP
 * 2 of every age group by the sum of their Competition I scores over every
 * apparatus, no team cap — recomputed here from the PUBLIC Competition I
 * results, independently of the engine.
 */
async function checkAllRound(pub, meet, final, where) {
  const competitionId = String(meet.competition._id);
  const groups = categoriesOf(meet, 'competition_1').filter((c) => c.gender === final.gender).map((c) => c.ageGroup);
  const want = [];
  let full = 0;
  for (const ageGroup of groups) {
    const docs = listOf(await pub.get('/api/public/scores', { query: { competitionId, gender: final.gender, ageGroup, competitionType: 'competition_1' } }));
    const totals = new Map();
    for (const doc of docs) {
      for (const row of doc.playerScores || []) {
        // An athlete marked Absent never qualifies on that apparatus (a5fdcff).
        if (row.isAbsent) continue;
        const id = String(row.playerId);
        totals.set(id, round2((totals.get(id) || 0) + Number(row.finalScore || 0)));
      }
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const taken = ranked.slice(0, 2);
    if (taken.length === 2) full += 1;
    // A level total at the last place is the tie-break's (or the draw's) to settle.
    const cut = taken.length === 2 ? taken[1][1] : null;
    const contested = cut !== null && ranked.slice(2).some(([, t]) => t === cut);
    want.push(...taken.filter(([, t]) => !(contested && t === cut)).map(([id]) => id));
  }

  const got = final.qualifiers.map((q) => String(q.player));
  const missing = want.filter((id) => !got.includes(id));
  expectThat(final.ageGroup === 'AllAges', `${where}: one "All ages" final per gender`, String(final.ageGroup));
  expectThat(missing.length === 0, `${where}: the top 2 of every age group by the sum of every apparatus`,
    `${missing.length} missing of ${want.length}`);
  expectThat(got.length <= groups.length * 2 && !final.skipped.some((sk) => sk.reason === 'team_cap'), `${where}: never more than 2 per age group, no team cap`,
    `${got.length} qualifiers over ${groups.length} age groups`);
  return { full: full === groups.length && groups.length > 0, capped: 0 };
}

/** Competition III: top 10 on the apparatus, at most 2 per team, in rank order. */
async function checkApparatusFinal(admin, pub, meet, final, where) {
  const base = { gender: final.gender, ageGroup: final.ageGroup, competitionType: 'competition_1', apparatus: final.apparatus };
  // Absent athletes (the Senior Judge's Mark Absent) never qualify: read them from the public results.
  const absent = new Set(listOf(await pub.get('/api/public/scores', { query: { competitionId: String(meet.competition._id), gender: final.gender, ageGroup: final.ageGroup, competitionType: 'competition_1' } }))
    .flatMap((d) => d.playerScores || []).filter((r) => r.isAbsent && r.apparatus === final.apparatus).map((r) => String(r.playerId)));
  const rows = standing(dataOf(await admin.get('/api/admin/scores/individual', { query: base })), final.apparatus)
    .filter((r) => !absent.has(r.playerId))
    .sort((a, b) => a.rank - b.rank);
  const perTeam = new Map();
  const want = [];
  for (const r of rows) {
    if (want.length === 10) break;
    const n = perTeam.get(r.teamName) || 0;
    if (n === 2) continue;
    perTeam.set(r.teamName, n + 1);
    want.push(r.playerId);
  }
  const got = final.qualifiers.map((q) => String(q.player));
  expectThat(same([...got].sort(), [...want].sort()), `${where}: top 10 by rank, at most 2 per team`,
    `want ${want.length}, got ${got.length}, ${want.filter((id) => !got.includes(id)).length} differ`);
  // Keyed by the team's id as a string: `team` arrives as an id or as a
  // populated document. (It was keyed on `team?._id`, which is undefined for a
  // bare id — every qualifier shared one key, and the check passed only while
  // finals happened to hold exactly two.)
  const teamKey = (t) => String(t?._id || t);
  const teams = new Map();
  for (const q of final.qualifiers) teams.set(teamKey(q.team), (teams.get(teamKey(q.team)) || 0) + 1);
  expectThat(got.length <= 10 && [...teams.values()].every((n) => n <= 2), `${where}: never more than 10, never 3 from one team`,
    `${got.length} qualifiers, most from one team ${Math.max(0, ...teams.values())}`);
  // The engine marks EVERY team's third as 'team_cap', also below the cut where
  // they were out anyway; the rule is about the ones the cap kept out of the
  // list — ranked at or above the last qualifier — and their team has its two.
  const lastRank = Math.max(0, ...final.qualifiers.map((q) => Number(q.rank) || 0));
  const capped = final.skipped.filter((s) => s.reason === 'team_cap' && (Number(s.rank) || 0) <= lastRank);
  expectThat(capped.every((s) => (teams.get(teamKey(s.team)) || 0) === 2), `${where}: a player the cap kept out has a team with its two`, `${capped.length} kept out by the cap`);
  return { full: got.length === 10, capped: capped.length };
}

async function stepFinals() {
  // Does the season exercise the rules at all? (A cut at 10 nobody reaches and
  // a cap that never keeps anybody out are untested rules that look green.)
  const exercised = { competition_2: { full: 0, capped: 0 }, competition_3: { full: 0, capped: 0 } };
  const admin = await asAdmin();
  const superadmin = await asSuperAdmin();
  const pub = new ApiClient({ baseUrl: BASE_URL, label: 'public' });
  for (const meet of await season()) {
    const competitionId = String(meet.competition._id);
    admin.competitionId = competitionId;
    const types = finalTypesOf(meet);
    let finals = await finalsOf(admin);
    const shape = competitionTypesOf(meet).map((t) => DISPLAY[t].replace('Competition ', '')).join('+');
    if (!types.length) {
      expectThat(finals.length === 0, `${meet.place} (${shape}): no finals for a Competition I-only meet`, `${finals.length} found`);
      say('ok', meet.place, `${shape}: Competition I only, no finals`);
      continue;
    }
    expectThat(finals.every((f) => types.includes(f.competitionType)), `${meet.place} (${shape}): only the meet's own finals exist`,
      [...new Set(finals.map((f) => f.competitionType))].join(','));

    // Before Finalize nobody is entered (a re-run after a finalize skips this).
    const fresh = finals.every((f) => !f.finalizedAt && f.status !== 'started');
    if (fresh) {
      for (const cat of finalCategories(meet)) {
        const squad = await squadOf(admin, cat.gender, cat.ageGroup, cat.type);
        expectThat(squad.length === 0, `${meet.place} ${cat.gender} ${cat.ageGroup} ${DISPLAY[cat.type]}: nobody entered before Finalize`, `${squad.length} entered`);
      }
      const early = dataOf(await pub.get('/api/public/finals', { query: { competitionId } }))?.finals || [];
      expectThat(early.length === 0, `${meet.place}: the public sees no final before Finalize`, `${early.length} shown`);
    }

    /*
     * Settle ties the way the admin does: Recompute, draw what is waiting,
     * Recompute again, until no final waits for a draw. One pass was not
     * enough: the corrections step unlocks and re-locks Competition I sheets,
     * and on the All-ages Competition II final a draw for one age group
     * recomputes the whole final, which can surface a tie in another age
     * group the first list did not show (Mumbai Boys Above 18, 2026-11-17).
     */
    const recompute = async () => dataOf(await admin.post('/api/admin/finals/recompute', {}))?.finals || await finalsOf(admin);
    let ties = 0;
    finals = await recompute();
    for (let round = 0; round < 5 && finals.some((f) => f.status === 'waiting_draw'); round += 1) {
      const settled = await settleTies(admin, finals, meet.place);
      ties += settled;
      finals = await recompute();
      if (!settled) break;
    }

    const all = await admin.post('/api/admin/finals/finalize-all', {});
    if (!expectThat(all.ok, `${meet.place}: Finalize all ready finals (admin)`, reasonOf(all))) continue;
    const { notReady = [] } = dataOf(all) || {};
    const empty = (n) => n.blockers.every((b) => /Nobody (is entered|qualified)/i.test(b));
    expectThat(notReady.every(empty), `${meet.place}: nothing left "not ready"`,
      notReady.filter((n) => !empty(n)).slice(0, 3).map((n) => `${n.label}: ${n.blockers.join(' · ')}`).join('; '));
    finals = await finalsOf(admin);
    const live = finals.filter((f) => f.qualifiers.length);
    expectThat(live.length > 0 && live.every((f) => ['finalized', 'started'].includes(f.status)), `${meet.place}: every final with qualifiers is finalized`,
      `${live.filter((f) => !['finalized', 'started'].includes(f.status)).length} of ${live.length} not`);

    for (const final of live) {
      const where = `${meet.place} ${final.label}`;
      const seen = final.competitionType === 'competition_2'
        ? await checkAllRound(pub, meet, final, where)
        : await checkApparatusFinal(admin, pub, meet, final, where);
      if (seen?.full) exercised[final.competitionType].full += 1;
      if (seen?.capped) exercised[final.competitionType].capped += 1;
    }

    // Each final category's squad is exactly the qualifiers of its finals.
    for (const cat of finalCategories(meet)) {
      const want = [...new Set(live.filter((f) => f.competitionType === cat.type && f.gender === cat.gender && f.ageGroup === cat.ageGroup)
        .flatMap((f) => f.qualifiers.map((q) => String(q.player))))].sort();
      const got = [...new Set(await squadOf(admin, cat.gender, cat.ageGroup, cat.type))].sort();
      expectThat(same(got, want), `${meet.place} ${cat.gender} ${cat.ageGroup} ${DISPLAY[cat.type]}: the squad is exactly its qualifiers`,
        `${got.length} entered, ${want.length} qualified`);
    }
    const shown = dataOf(await pub.get('/api/public/finals', { query: { competitionId } }))?.finals || [];
    expectThat(shown.length === live.length, `${meet.place}: the public lists every finalized final`, `${shown.length}/${live.length}`);

    // Reopen: Super Admin only, before the final's first score.
    const one = live.find((f) => f.status === 'finalized');
    if (one) {
      const adminTry = await admin.post(`/api/admin/finals/${one._id}/reopen`, {});
      expectThat(adminTry.status === 404 || adminTry.status === 403, `${meet.place}: an admin cannot reopen a final`, `HTTP ${adminTry.status}`);
      const reopened = await superadmin.post(`/api/superadmin/finals/${one._id}/reopen`, { competitionId });
      const after = (await finalsOf(admin)).find((f) => String(f._id) === String(one._id));
      expectThat(reopened.ok && !after?.finalizedAt, `${meet.place} ${one.label}: the Super Admin reopens it`, reasonOf(reopened));
      const again = await superadmin.post(`/api/superadmin/finals/${one._id}/finalize`, { competitionId });
      const back = (await finalsOf(admin)).find((f) => String(f._id) === String(one._id));
      expectThat(again.ok && back?.status === 'finalized' && same(back.qualifiers.map((q) => q.player).sort(), one.qualifiers.map((q) => q.player).sort()),
        `${meet.place} ${one.label}: finalized again, same finalists`, reasonOf(again));
    }
    const second = dataOf(await admin.post('/api/admin/finals/finalize-all', {})) || {};
    expectThat((second.finalized || []).length === 0, `${meet.place}: a second Finalize all finds nothing to do`, `${(second.finalized || []).length} finalized`);

    // The running order of every final category, by the admin's lot draw.
    let drawn = 0;
    for (const cat of finalCategories(meet)) {
      if (!live.some((f) => f.competitionType === cat.type && f.gender === cat.gender && f.ageGroup === cat.ageGroup)) continue;
      const q = { gender: cat.gender, ageGroup: cat.ageGroup, competitionType: cat.type };
      const where = `${meet.place} ${cat.gender} ${cat.ageGroup} ${DISPLAY[cat.type]}`;
      const draw = await admin.post('/api/admin/lots/draw', { ...q, includePlayers: true });
      if (!expectThat(draw.ok, `${where}: lots drawn for the final`, reasonOf(draw))) continue;
      if (checkOrder(dataOf(await admin.get('/api/admin/lots', { query: q })), where)) drawn += 1;
    }
    say('ok', meet.place, `${shape}: ${live.length} finals finalized${ties ? `, ${ties} tie(s) drawn` : ''}, ${drawn} final orders drawn`);
  }
  expectThat(exercised.competition_2.full > 0, `${DISPLAY.competition_2}: some All-ages final has 2 from every age group`, `${exercised.competition_2.full} full`);
  // Competition III alone has a cut at 10 and a team cap (Competition II has neither).
  expectThat(exercised.competition_3.full > 0, `${DISPLAY.competition_3}: some final is full (10 qualifiers), so the cut at 10 decides who is in`, `${exercised.competition_3.full} full`);
  expectThat(exercised.competition_3.capped > 0, `${DISPLAY.competition_3}: in some final the team cap keeps a player out of the top 10`, `${exercised.competition_3.capped} finals`);
  say('ok', 'season', `finals exercised — II: ${exercised.competition_2.full} full, ${exercised.competition_2.capped} capped; III: ${exercised.competition_3.full} full, ${exercised.competition_3.capped} capped`);
}

/** After the finals are judged: each one has started, and nobody can reopen it now. */
async function checkFinalsStarted(admin, superadmin, meet) {
  const competitionId = String(meet.competition._id);
  const finals = (await finalsOf(admin)).filter((f) => f.qualifiers.length);
  const notStarted = finals.filter((f) => f.status !== 'started');
  expectThat(notStarted.length === 0, `${meet.place}: every judged final has started (its list is frozen)`,
    notStarted.slice(0, 3).map((f) => `${f.label}: ${f.status}`).join('; '));
  const one = finals[0];
  if (one) {
    const r = await superadmin.post(`/api/superadmin/finals/${one._id}/reopen`, { competitionId });
    expectThat(r.status === 400 || r.status === 409 || r.status === 422, `${meet.place} ${one.label}: a started final cannot be reopened`, `HTTP ${r.status}`);
  }
}

// ── corrections ─────────────────────────────────────────────────────────────
/** The admin Scoring screen's save payload (Web pages/admin/AdminScoring.jsx), with one time changed. */
function adminPayload(team, cat, type, rows, scoreMetadata, isLocked) {
  return {
    teamId: String(team._id),
    teamName: team.name,
    gender: cat.gender,
    ageGroup: cat.ageGroup,
    competitionType: type,
    timeKeeper: scoreMetadata.timeKeeper || 'Time Keeper',
    scorer: scoreMetadata.scorer || 'Scorer',
    remarks: 'Corrected at the admin desk (lifecycle check)',
    isLocked,
    playerScores: rows,
  };
}

async function stepCorrections() {
  const admin = await asAdmin();
  const pub = new ApiClient({ baseUrl: BASE_URL, label: 'public' });
  const sizesDone = new Set();
  for (const meet of await season()) {
    if (sizesDone.size === 3) break;
    admin.competitionId = String(meet.competition._id);
    for (const cat of categoriesOf(meet)) {
      if (sizesDone.has(cat.size)) continue;
      const type = 'competition_1';
      const q = { gender: cat.gender, ageGroup: cat.ageGroup, competitionType: type };
      const where = `${meet.place} ${cat.gender} ${cat.ageGroup} (${cat.size}-judge)`;
      // A time correction must be able to MOVE the final: never the meet's
      // Absent athlete (scores step, all zeros) or any row already at 0. Which
      // row that is depends on squad sizes, which the desk steps change.
      const movable = (s) => !s.isAbsent && Number(s.finalScore) > 1;
      const teams = listOf(await admin.get('/api/admin/scores/team', { query: q }))
        .filter((t) => t.scoreMetadata?._id && (t.scores || []).some(movable));
      const team = teams[0];
      if (!team) continue;
      const scoreId = team.scoreMetadata._id;
      const target = team.scores.find(movable);
      const publicFinal = async () => {
        const docs = listOf(await pub.get('/api/public/scores', { query: { competitionId: admin.competitionId, ...q } }));
        const row = docs.flatMap((d) => d.playerScores || [])
          .find((s) => String(s.playerId) === String(target.playerId) && s.apparatus === target.apparatus);
        return row ? Number(row.finalScore) : null;
      };
      const before = await publicFinal();
      const originalTime = String(target.time);
      const newTime = originalTime === '98' ? '92' : '98';
      const delta = round2(getTimeDeductionForTime(newTime) - getTimeDeductionForTime(originalTime));

      const rowsWith = (time) => team.scores.map((s) => {
        const isTarget = String(s.playerId) === String(target.playerId) && s.apparatus === target.apparatus;
        const t = isTarget ? time : String(s.time);
        const deduction = getTimeDeductionForTime(t);
        return {
          playerId: String(s.playerId),
          playerName: s.playerName,
          apparatus: s.apparatus,
          time: t,
          judgeScores: s.judgeScores,
          executionAverage: s.executionAverage,
          baseScore: s.baseScore,
          baseScoreApplied: s.baseScoreApplied,
          toleranceUsed: s.toleranceUsed,
          averageMarks: s.averageMarks,
          deduction,
          otherDeduction: Number(s.otherDeduction) || 0,
          finalScore: Math.max(0, round2(Number(s.averageMarks) - deduction - (Number(s.otherDeduction) || 0))),
        };
      });

      const unlocked = await admin.put(`/api/admin/scores/${scoreId}/unlock`, {});
      const hidden = await publicFinal();
      expectThat(unlocked.ok && hidden === null, `${where}: unlocking takes the sheet off the public board`, unlocked.ok ? `still shows ${hidden}` : reasonOf(unlocked));
      const saved = await admin.post('/api/admin/scores/save', adminPayload(team, cat, type, rowsWith(newTime), team.scoreMetadata, true));
      const corrected = await publicFinal();
      expectThat(saved.ok && corrected !== null && round2(before - corrected) === delta,
        `${where}: a corrected time moves the published final`, saved.ok ? `${before} → ${corrected}, expected −${delta}` : reasonOf(saved));
      // Put the season back as it was judged.
      await admin.put(`/api/admin/scores/${scoreId}/unlock`, {});
      const restored = await admin.post('/api/admin/scores/save', adminPayload(team, cat, type, rowsWith(originalTime), team.scoreMetadata, true));
      const after = await publicFinal();
      expectThat(restored.ok && after === before, `${where}: restoring the time restores the final`, restored.ok ? `${after} vs ${before}` : reasonOf(restored));
      const otherRows = team.scores.length;
      say('ok', where, `${otherRows} row(s) re-saved twice, final ${before} → ${corrected} → ${after}`);
      sizesDone.add(cat.size);
    }
  }
  expectThat(sizesDone.size === 3, 'a correction on every panel size', `sizes done: ${[...sizesDone].join(', ')}`);
  await screenShapedSave(admin, pub);
}

/**
 * The admin screen's save on a sheet with several apparatus, in the shape the
 * screen posts since 2026-10-24 (Web utils/scoring/adminSheet.js
 * playerScoresFor, pinned by adminSheet.test.js): one row per athlete ×
 * apparatus, each carrying its apparatus. Every result and every apparatus'
 * lock must survive it. (The screen used to post one row per athlete with no
 * apparatus, which overwrote Pole and left only Pole locked.)
 */
async function screenShapedSave(admin, pub) {
  for (const meet of await season()) {
    admin.competitionId = String(meet.competition._id);
    for (const cat of categoriesOf(meet)) {
      const q = { gender: cat.gender, ageGroup: cat.ageGroup, competitionType: 'competition_1' };
      const sheets = listOf(await admin.get('/api/admin/scores/team', { query: q }));
      const team = sheets.find((t) => t.scoreMetadata?._id
        && new Set((t.scores || []).map((r) => r.apparatus)).size > 1);
      if (!team) continue;
      const where = `${meet.place} ${cat.gender} ${cat.ageGroup} ${team.name}`;
      const scoreId = team.scoreMetadata._id;
      const snapshot = team.scores;
      const apparatusBefore = [...new Set(snapshot.map((r) => r.apparatus))].sort();
      const finals = (rows) => rows.map((r) => `${r.playerId}|${r.apparatus}|${r.finalScore}`).sort().join(',');
      const sheetNow = async () => listOf(await admin.get('/api/admin/scores/team', { query: q }))
        .find((t) => String(t._id) === String(team._id));

      // The screen's payload: every athlete × apparatus row, with its apparatus.
      await admin.put(`/api/admin/scores/${scoreId}/unlock`, {});
      const screen = await admin.post('/api/admin/scores/save', adminPayload(team, cat, 'competition_1', snapshot.map((r) => ({
        playerId: String(r.playerId), playerName: r.playerName, apparatus: r.apparatus, time: r.time, judgeScores: r.judgeScores,
        executionAverage: r.executionAverage, baseScore: r.baseScore, baseScoreApplied: r.baseScoreApplied,
        toleranceUsed: r.toleranceUsed, averageMarks: r.averageMarks, deduction: r.deduction,
        otherDeduction: r.otherDeduction, finalScore: r.finalScore,
      })), team.scoreMetadata, true));
      const afterScreen = await sheetNow();
      expectThat(screen.ok && finals(afterScreen.scores) === finals(snapshot)
        && same([...(afterScreen.scoreMetadata.lockedApparatus || [])].sort(), apparatusBefore),
      `${where}: the admin screen's save keeps every apparatus`,
      `${reasonOf(screen)} locked ${JSON.stringify(afterScreen.scoreMetadata.lockedApparatus)} of ${JSON.stringify(apparatusBefore)}`);

      // And a full re-save of the stored rows restores the sheet exactly.
      await admin.put(`/api/admin/scores/${scoreId}/unlock`, {});
      const repaired = await admin.post('/api/admin/scores/save', adminPayload(team, cat, 'competition_1',
        snapshot.map((r) => ({ ...r, playerId: String(r.playerId) })), team.scoreMetadata, true));
      const afterRepair = await sheetNow();
      expectThat(repaired.ok && finals(afterRepair.scores) === finals(snapshot)
        && same([...(afterRepair.scoreMetadata.lockedApparatus || [])].sort(), apparatusBefore),
      `${where}: an apparatus-aware save restores the sheet`,
      `${reasonOf(repaired)} locked ${JSON.stringify(afterRepair.scoreMetadata.lockedApparatus)}`);
      const mine = new Set(snapshot.map((r) => String(r.playerId)));
      const published = listOf(await pub.get('/api/public/scores', { query: { competitionId: admin.competitionId, ...q } }))
        .flatMap((d) => d.playerScores || []).filter((r) => mine.has(String(r.playerId)));
      expectThat(published.length === snapshot.length, `${where}: every apparatus is back on the public board`, `${published.length}/${snapshot.length}`);
      return;
    }
  }
}

// ── judges ──────────────────────────────────────────────────────────────────
async function stepJudges() {
  const meets = await season();
  const seatsOf = new Map();   // email → [{meet, seat}]
  for (const meet of meets) {
    for (const [seat, email] of Object.entries(meet.seats)) {
      seatsOf.set(email, [...(seatsOf.get(email) || []), { meet, seat }]);
    }
  }
  // Relief panels (finals-panels): another meet's judges seated on this meet's
  // Competition II finals after Finalize. They hold only Competition II seats here.
  const reliefOf = new Map();  // email → [{meet, seat}]
  const plan = readPlan();
  for (const meet of meets.filter((m) => competitionTypesOf(m).includes('competition_2'))) {
    const finalsPanel = finalsPanelSeats(plan, meet.place);
    if (!finalsPanel.relief) continue;
    // Only the seats this meet's All-ages Competition II panels use: a 3- or
    // 4-judge panel leaves the relief meet's Judge 4 with no seat here.
    const used = new Set(panelsForType(meet.plan, 'competition_2').flatMap((p) => seatsFor(p.size)));
    for (const [seat, email] of Object.entries(withTimeKeeper(finalsPanel.seats)).filter(([s]) => used.has(s))) {
      reliefOf.set(email, [...(reliefOf.get(email) || []), { meet, seat }]);
    }
  }
  let checked = 0;
  let passwords = 0;
  for (const judge of await roster.allJudges()) {
    const mine = seatsOf.get(judge.email) || [];
    const { client } = await asJudge(judge.email);
    const relief = reliefOf.get(judge.email) || [];
    const offered = listOf(await client.get('/api/judge/competitions')).map((c) => c.place).sort();
    const expected = [...new Set(mine.map((m) => m.meet.place))].sort();
    const expectedAll = [...new Set([...expected, ...relief.map((m) => m.meet.place)])].sort();
    if (!process.env.PLACE) {
      expectThat(same(offered, expectedAll), `${judge.email}: offered exactly the meets they are seated at`, `offered ${offered.join(',')} / plan + relief ${expectedAll.join(',')}`);
    }
    // At a relief meet: the Competition II seat, and the meet opens.
    for (const reliefPlace of [...new Set(relief.map((m) => m.meet.place))].filter((p) => !expected.includes(p))) {
      const meet = meets.find((m) => m.place === reliefPlace);
      const id = String(meet.competition._id);
      const refused = await switchMeet(client, id);
      if (!expectThat(!refused, `${judge.email} @ ${reliefPlace} (relief): opens the meet`, refused ? reasonOf(refused) : '')) continue;
      const held = listOf(await client.get('/api/judge/assignments')).filter((a) => String(a.competition?._id || a.competition) === id);
      const wantSeats = relief.filter((m) => m.meet.place === reliefPlace).map((m) => m.seat);
      const onlyII = held.every((a) => (a.competitionTypes || []).every((t) => t === 'competition_2'));
      expectThat(held.length > 0 && onlyII && wantSeats.every((seat) => held.some((a) => a.judgeType === seat)),
        `${judge.email} @ ${reliefPlace} (relief): holds a Competition II seat only`,
        `${[...new Set(held.map((a) => `${a.judgeType}:${(a.competitionTypes || []).join('+')}`))].join(', ') || 'no seat'} vs ${wantSeats.join('+')}`);
      checked += 1;
    }
    for (const meetPlace of expected) {
      const meet = meets.find((m) => m.place === meetPlace);
      const id = String(meet.competition._id);
      // One sign-in per judge; the meet is switched on the same session, as the arena picker does.
      const refused = await switchMeet(client, id);
      const there = client;
      if (!expectThat(!refused, `${judge.email} @ ${meetPlace}: opens the meet`, refused ? reasonOf(refused) : '')) continue;
      const assignments = listOf(await there.get('/api/judge/assignments'))
        .filter((a) => String(a.competition?._id || a.competition) === id);
      const wantSeats = mine.filter((m) => m.meet.place === meetPlace).map((m) => m.seat).sort();
      const gotSeats = [...new Set(assignments.map((a) => a.judgeType))].sort();
      expectThat(same(gotSeats, wantSeats), `${judge.email} @ ${meetPlace}: holds the plan's seat`, `${gotSeats.join('+')} vs plan ${wantSeats.join('+')}`);
      // Judge 3 sits only on 4- and 5-judge panels, Judge 4 only on 5s: every panel that HAS the seat.
      const panels = new Set(assignments.map((a) => `${a.gender}/${a.ageGroup}`));
      // The All-ages Competition II panels count only where the meet's OWN
      // judges seat them; at a relief meet another meet's judges do.
      const ownFinals = competitionTypesOf(meet).includes('competition_2') && !finalsPanelSeats(plan, meet.place).relief;
      const owed = [...meet.plan.panels, ...(ownFinals ? panelsForType(meet.plan, 'competition_2') : [])]
        .filter((p) => wantSeats.some((seat) => seatsFor(p.size).includes(seat)));
      expectThat(panels.size === owed.length, `${judge.email} @ ${meetPlace}: seated on every panel with their seat`, `${panels.size}/${owed.length}`);
      const comp = await there.get(`/api/judge/competition/${id}`);
      expectThat(comp.ok && dataOf(comp).place === meetPlace, `${judge.email} @ ${meetPlace}: reads the meet`, reasonOf(comp));
      const cat = meet.plan.panels[0];
      const panel = listOf(await there.get('/api/judge/judges', { query: { gender: cat.gender, ageGroup: cat.ageGroup, competitionType: 'competition_1' } }));
      const onPanel = new Set(panel.map((p) => String(p.email || p.account?.email).toLowerCase()));
      const panelSeats = seatsFor(cat.size).map((seat) => meet.seats[seat]);
      expectThat(panelSeats.every((e) => onPanel.has(e)), `${judge.email} @ ${meetPlace}: sees the whole panel`,
        `${panelSeats.filter((e) => !onPanel.has(e)).join(', ') || 'none'} missing`);
      const lots = dataOf(await there.get('/api/judge/lots', { query: { gender: cat.gender, ageGroup: cat.ageGroup, competitionType: 'competition_1' } }));
      const team = lots?.teams?.[0];
      if (team) {
        const players = await there.get(`/api/judge/teams/${team._id}/players`, { query: { gender: cat.gender, ageGroup: cat.ageGroup, competitionType: 'competition_1' } });
        expectThat(players.ok, `${judge.email} @ ${meetPlace}: reads a team's athletes`, reasonOf(players));
      }
      checked += 1;
    }
    // Profile: read and saved by everyone; the password changed and changed back by a
    // sample of three (each change is two hashes and a sign-in: the route, not the volume).
    const profile = dataOf(await client.get('/api/judge/profile'));
    const saved = await client.put('/api/judge/profile', { firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone });
    expectThat(saved.ok && profile.email === judge.email, `${judge.email}: profile read and saved`, reasonOf(saved));
    if (passwords < 3) {
      const temp = `${judge.password}x`;
      const changed = await client.put('/api/judge/profile/password', { currentPassword: judge.password, newPassword: temp });
      const back = changed.ok
        ? await (await asJudgeWith(judge.email, temp)).put('/api/judge/profile/password', { currentPassword: temp, newPassword: judge.password })
        : changed;
      expectThat(changed.ok && back.ok, `${judge.email}: password changed and changed back`, `${reasonOf(changed)} / ${reasonOf(back)}`);
      passwords += 1;
    }
  }
  say('ok', 'judges', `${checked} judge-meet sessions checked, ${passwords} password round trips`);
}

async function asJudgeWith(email, password) {
  const client = new ApiClient({ baseUrl: BASE_URL, label: email });
  const r = await client.login('/api/judge/login', { email, password });
  if (!r.ok) throw new Error(`judge sign-in ${email} with the changed password: ${reasonOf(r)}`);
  return client;
}

// ── runner ──────────────────────────────────────────────────────────────────
const STEPS = { order: stepOrder, results: stepResults, finals: stepFinals, corrections: stepCorrections, judges: stepJudges };

(async () => {
  if (!STEPS[STEP]) {
    console.error(`usage: node scripts/seedCompetitionDay.js ${Object.keys(STEPS).join('|')}`);
    process.exit(2);
  }
  console.log(`\nCompetition day — ${STEP} — ${BASE_URL}\n`);
  await STEPS[STEP]();
  console.log(`\n${tally.ok} check(s) passed${problems.length ? `, ${problems.length} FAILED` : ''}.`);
  for (const id of [...new Set(known)]) console.log(`  KNOWN DEFECT ${id}: ${KNOWN_DEFECTS[id]}`);
  if (problems.length) {
    for (const p of problems.slice(0, 40)) console.log(`  ✗ ${p}`);
    process.exit(1);
  }
})().catch((error) => {
  console.error(`\n${STEP} could not run: ${error.message}`);
  process.exit(1);
});
