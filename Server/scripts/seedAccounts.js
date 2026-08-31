// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const Player = require('../models/Player');
const Coach = require('../models/Coach');
const Team = require('../models/Team');
const JudgeAccount = require('../models/JudgeAccount');
const Competition = require('../models/Competition');
const Judge = require('../models/Judge');

/**
 * Rebuild the player, coach and judge side of a dev database from what the UI
 * actually sent.
 *
 * This script does not describe what an account is made of — it replays a
 * recording. `Web/e2e/register-*.spec.js` drives the real UI and writes every
 * successful registration's request body to `seed/registrations.generated.json`;
 * this reads that file and writes the same accounts straight to MongoDB.
 *
 * That indirection is the point. A seeder that restates the fields by hand
 * drifts the moment a form changes, silently, and you find out when a seeded
 * account behaves differently from a real one. The judge seeder this replaces
 * did exactly that twice: it kept writing the pre-account judge shape after
 * that shape was gone, and it invented random passwords the UI never issues.
 *
 *   1. npm --prefix Web run seed:ui        # register through the UI, capture
 *   2. npm --prefix Server run seed        # dry run: what would be written
 *   3. npm --prefix Server run seed -- --commit
 *
 * Use it when you want the accounts without waiting for a browser — restoring a
 * wiped dev database, or setting up a second machine from a capture someone
 * else made.
 *
 * Seven phases, in this order, because each one needs the last:
 *
 *   PEOPLE — recorded by the UI run
 *     accounts      players, coaches, judges   (registrations)
 *     teams         one per coach              (teams)
 *     memberships   each player's team         (memberships)
 *
 *   THE COMPETITION — recorded by scripts/captureEnvironment.js
 *     competitions  the meets themselves       (competitions)
 *     entries       which team entered which   (entries)
 *     squads        who is in each entry       (squads)
 *     panels        who judges what            (panels)
 *
 * The middle two used to be missing entirely, and their absence was quiet in
 * the worst way: seeding a wiped database restored every account and no `teams`
 * collection at all, leaving coaches parked on /coach/create-team and seventy
 * players with `team: null`. Everything looked seeded until someone opened the
 * app.
 *
 * The last four were missing for the same kind of reason and cost the same kind
 * of afternoon: accounts and teams alone give you a database of people with
 * nothing to compete in — no meet, no entries, no age groups, and no judging
 * panel, so a judge signs in to an empty dashboard and the app looks broken
 * rather than unseeded. Where they come from, and why that source is the
 * database rather than a form, is explained in captureEnvironment.js.
 *
 * Options:
 *   --commit          actually write (default is a dry run)
 *   --role=player     only that part; repeatable, e.g. --role=coach --role=judge
 *                     `coach` carries the teams phase, `player` the memberships,
 *                     and `environment` the four competition phases
 *   --file=<path>     read a different capture
 *
 * Idempotent throughout: an existing account, team, membership, meet, entry,
 * squad place or panel seat is reported and skipped, so an interrupted run is
 * finished by running it again.
 */

const DEFAULT_CAPTURE = path.join(__dirname, 'seed', 'registrations.generated.json');

/**
 * Which model owns each role, and which fields the model does not take.
 *
 * `confirmPassword` exists only so the form can compare two boxes; it is never
 * part of an account. Everything else the form sends is passed through
 * untouched — including fields added to the form after this file was written,
 * which is the whole reason the payload is replayed rather than re-specified.
 */
const ROLES = {
  player: { model: Player, label: 'Player' },
  coach: { model: Coach, label: 'Coach' },
  judge: { model: JudgeAccount, label: 'Judge' },
};

const UI_ONLY_FIELDS = ['confirmPassword'];

/**
 * A pseudo-role covering the four competition phases.
 *
 * Not a role in the sense the other three are — nobody registers as an
 * "environment" — but it is the same axis from the caller's point of view:
 * which part of the capture do I want replayed. Naming it means
 * `--role=judge` can mean "the judge accounts, not the panels they sit on",
 * which is a distinction worth being able to draw when repairing one of them.
 */
const ENVIRONMENT = 'environment';

/** @param {string[]} argv @returns {{commit: boolean, roles: string[], file: string}} */
function parseArgs(argv) {
  const roles = argv
    .filter((a) => a.startsWith('--role='))
    .map((a) => a.slice('--role='.length).toLowerCase());

  const fileArg = argv.find((a) => a.startsWith('--file='));
  const known = [...Object.keys(ROLES), ENVIRONMENT];

  for (const role of roles) {
    if (!known.includes(role)) {
      throw new Error(`Unknown --role="${role}". Known roles: ${known.join(', ')}`);
    }
  }

  return {
    commit: argv.includes('--commit'),
    roles: roles.length > 0 ? roles : known,
    file: fileArg ? path.resolve(fileArg.slice('--file='.length)) : DEFAULT_CAPTURE,
  };
}

/** How a competition is named across databases (see captureEnvironment.js). */
const competitionLabel = (key) => `${key?.name} — ${key?.place} ${key?.year}`;

/**
 * Find the meet a captured row refers to.
 * @param {{name: string, place: string, year: number}} key
 */
const findCompetition = (key) => Competition.findOne({
  name: key?.name,
  place: key?.place,
  year: key?.year,
  isDeleted: { $ne: true },
});

/**
 * Find the one team with this name, or say why that could not be done.
 *
 * Team.name is unique per COACH, not globally — two coaches may both own an
 * "SGAM-A" — so an ambiguous name is a hard error rather than a guess. Putting
 * a squad or an entry on the wrong team is worse than refusing to.
 *
 * @param {string} teamName
 * @returns {Promise<{team?: Object, error?: string}>}
 */
async function resolveTeam(teamName) {
  const matches = await Team.find({ name: teamName });
  if (matches.length === 0) return { error: `no team "${teamName}" — run the coach phase first` };
  if (matches.length > 1) {
    return { error: `${matches.length} teams named "${teamName}"; cannot tell which one` };
  }
  return { team: matches[0] };
}

/**
 * Strip the fields that belong to the form rather than the account.
 * @param {Object} payload
 * @returns {Object}
 */
function toAccount(payload) {
  const account = { ...payload };
  for (const field of UI_ONLY_FIELDS) delete account[field];
  account.email = String(account.email || '').toLowerCase().trim();
  return account;
}

/**
 * A phase's tally. Three lists rather than counters so the report can name
 * exactly who was skipped and why — "68 skipped" tells you nothing about the
 * two that were not.
 */
const tally = () => ({ created: [], skipped: [], failed: [] });

/**
 * What the earlier phases of THIS run will have written by the time a later one
 * looks for it.
 *
 * Only consulted in a dry run, and only for that. A dry run writes nothing, so
 * every team would fail to find its coach and every membership its team — 73
 * red rows on a capture that is in fact complete, which is precisely the noise
 * that trains people to stop reading the output. Checking the capture instead
 * lets a dry run answer the question actually being asked: would `--commit`
 * work? A dependency missing from the database AND from the capture is still a
 * real failure, and still reported as one.
 *
 * @param {{registrations: Array, teams: Array}} capture
 */
const planFrom = (capture) => {
  const emailsFor = (role) => new Set(
    (capture.registrations || [])
      .filter((r) => r.role === role)
      .map((r) => String(r.payload.email || '').toLowerCase())
  );

  return {
    coaches: emailsFor('coach'),
    players: emailsFor('player'),
    judges: emailsFor('judge'),
    teams: new Set((capture.teams || []).map((t) => t.payload.name)),
    competitions: new Set((capture.competitions || []).map((c) => competitionLabel(c))),
    entries: new Set((capture.entries || []).map((e) => `${e.teamName}@${competitionLabel(e.competition)}`)),
  };
};

/**
 * Phase 1 — the accounts themselves.
 * @param {{role: string, payload: Object}[]} registrations
 * @param {boolean} commit
 */
async function seedRegistrations(registrations, commit) {
  const result = tally();

  for (const { role, payload } of registrations) {
    const { model, label } = ROLES[role];
    const account = toAccount(payload);

    try {
      if (await model.findOne({ email: account.email })) {
        result.skipped.push({ what: label, who: account.email, reason: 'already registered' });
        continue;
      }

      if (commit) {
        // Through the model, so the same pre-save hook that hashes a password
        // during real registration hashes this one.
        await model.create({ ...account, isActive: true });
      }

      result.created.push({
        what: label,
        who: `${account.firstName} ${account.lastName}`.trim(),
        detail: account.email,
        password: account.password,
      });
    } catch (error) {
      result.failed.push({ what: label, who: account.email, error: error.message });
    }
  }

  return result;
}

/**
 * Phase 2 — the team each coach created.
 *
 * Mirrors CoachService.createTeam: the team is written with `coach` set, and
 * the coach is then pointed back at it. Both halves matter — a Team with no
 * coach is invisible to /coaches/teams, and a Coach with `team: null` is bounced
 * to /coach/create-team on every sign-in no matter how many teams they own.
 *
 * @param {{coachEmail: string, payload: Object}[]} teams
 * @param {boolean} commit
 * @param {ReturnType<typeof planFrom>} plan - what phase 1 will have written
 */
async function seedTeams(teams, commit, plan) {
  const result = tally();

  for (const { coachEmail, payload } of teams) {
    const email = String(coachEmail).toLowerCase();

    try {
      const coach = await Coach.findOne({ email });
      if (!coach) {
        // In a dry run the accounts phase has not written anything yet, so
        // "not in the database" is only a failure if the capture cannot supply
        // it either.
        if (!commit && plan.coaches.has(email)) {
          result.created.push({ what: 'Team', who: payload.name, detail: `coach ${email}` });
          continue;
        }
        result.failed.push({
          what: 'Team',
          who: payload.name,
          error: `no coach ${email} — seed the accounts first (drop --role=coach)`,
        });
        continue;
      }

      // Team.name is unique per coach, not globally, so the owner is part of
      // the identity check.
      if (await Team.findOne({ name: payload.name, coach: coach._id })) {
        result.skipped.push({ what: 'Team', who: payload.name, reason: `already owned by ${email}` });
        continue;
      }

      if (commit) {
        const team = await Team.create({ ...payload, coach: coach._id, isActive: true });
        await Coach.updateOne({ _id: coach._id }, { team: team._id });
      }

      result.created.push({ what: 'Team', who: payload.name, detail: `coach ${email}` });
    } catch (error) {
      result.failed.push({ what: 'Team', who: payload.name, error: error.message });
    }
  }

  return result;
}

/**
 * Phase 3 — which team each player joined.
 *
 * Captured by team NAME (see Web/e2e/support/browser.js captureMembership): the
 * `teamId` the UI posts is an ObjectId from one database and means nothing here.
 * Resolving the name is therefore this phase's job, and an ambiguous one is a
 * hard error rather than a guess — two coaches may legitimately both own a team
 * called "SGAM-A", and silently putting a player on the wrong one is worse than
 * refusing.
 *
 * @param {{playerEmail: string, teamName: string}[]} memberships
 * @param {boolean} commit
 * @param {ReturnType<typeof planFrom>} plan - what the earlier phases will have written
 */
async function seedMemberships(memberships, commit, plan) {
  const result = tally();

  for (const { playerEmail, teamName } of memberships) {
    const email = String(playerEmail).toLowerCase();
    // See seedTeams: a dry run has an empty database by construction, so fall
    // back to what the capture is going to supply.
    const planned = !commit && plan.players.has(email) && plan.teams.has(teamName);

    try {
      const player = await Player.findOne({ email });
      if (!player) {
        if (planned) {
          result.created.push({ what: 'Membership', who: email, detail: teamName });
          continue;
        }
        result.failed.push({
          what: 'Membership',
          who: email,
          error: `no player ${email} — seed the accounts first (drop --role=player)`,
        });
        continue;
      }

      const matches = await Team.find({ name: teamName });
      if (matches.length === 0) {
        if (planned) {
          result.created.push({ what: 'Membership', who: email, detail: teamName });
          continue;
        }
        result.failed.push({
          what: 'Membership',
          who: email,
          error: `no team "${teamName}" — run the coach phase first`,
        });
        continue;
      }
      if (matches.length > 1) {
        result.failed.push({
          what: 'Membership',
          who: email,
          error: `${matches.length} teams named "${teamName}"; cannot tell which one`,
        });
        continue;
      }

      const [team] = matches;
      if (String(player.team) === String(team._id)) {
        result.skipped.push({ what: 'Membership', who: email, reason: `already on ${teamName}` });
        continue;
      }

      if (commit) {
        await Player.updateOne({ _id: player._id }, { team: team._id });
      }

      result.created.push({ what: 'Membership', who: email, detail: teamName });
    } catch (error) {
      result.failed.push({ what: 'Membership', who: email, error: error.message });
    }
  }

  return result;
}

/**
 * Phase 4 — the meets themselves.
 *
 * Everything after this hangs off a competition: an entry is a team in one, a
 * squad is players in an entry, a panel seat names one. Matched on
 * {name, place, year} because the seeded set is three rows sharing a name and
 * differing only by place, which is the same thing the coach's competition
 * picker has to disambiguate on screen.
 *
 * @param {Object[]} competitions - whole documents, minus what cannot travel
 * @param {boolean} commit
 */
async function seedCompetitions(competitions, commit) {
  const result = tally();

  for (const competition of competitions) {
    const label = competitionLabel(competition);
    try {
      if (await findCompetition(competition)) {
        result.skipped.push({ what: 'Competition', who: label, reason: 'already exists' });
        continue;
      }
      /*
       * `registeredTeams` and `admins` are both dropped, for the same reason.
       *
       * They hold ObjectIds from the database the capture was taken FROM, and an
       * id from another database means nothing here — the same rule the team and
       * membership phases already follow by matching on name and e-mail instead.
       *
       * `registeredTeams` was already reset because the entries and squads are
       * replayed by their own phases. `admins` was not, so a rebuilt database got
       * competitions pointing at an admin that does not exist: the reference
       * dangles, and the admin who DOES exist has no access, because access is
       * read from `Admin.competitions` — which the capture cannot carry either.
       *
       * Assign an admin after seeding (superadmins need no assignment; they
       * reach every competition by role).
       */
      if (commit) await Competition.create({ ...competition, registeredTeams: [], admins: [] });
      result.created.push({ what: 'Competition', who: label, detail: competition.level });
    } catch (error) {
      result.failed.push({ what: 'Competition', who: label, error: error.message });
    }
  }

  return result;
}

/**
 * Phase 5 — which team entered which meet.
 *
 * A team existing and a team being IN a competition are different facts, and
 * only the second one puts it in front of a judge. `isSubmitted` and
 * `paymentStatus` are replayed as captured rather than reset: a team that had
 * paid and submitted is not the same test fixture as one that had not, and
 * several screens branch on exactly that.
 *
 * @param {Object[]} entries
 * @param {boolean} commit
 * @param {ReturnType<typeof planFrom>} plan
 */
async function seedEntries(entries, commit, plan) {
  const result = tally();

  for (const entry of entries) {
    const label = competitionLabel(entry.competition);
    const who = `${entry.teamName} → ${entry.competition?.place}`;
    // As in the earlier phases: a dry run has written nothing, so a missing
    // dependency is only a failure when the capture cannot supply it either.
    const planned = !commit && plan.competitions.has(label) && plan.teams.has(entry.teamName);

    try {
      const competition = await findCompetition(entry.competition);
      const { team, error } = await resolveTeam(entry.teamName);
      const coach = await Coach.findOne({ email: String(entry.coachEmail).toLowerCase() });

      if (!competition || !team || !coach) {
        if (planned) {
          result.created.push({ what: 'Entry', who, detail: label });
          continue;
        }
        result.failed.push({
          what: 'Entry',
          who,
          error: !competition ? `no competition "${label}"`
            : error || `no coach ${entry.coachEmail} — seed the accounts first`,
        });
        continue;
      }

      if ((competition.registeredTeams || []).some((rt) => String(rt.team) === String(team._id))) {
        result.skipped.push({ what: 'Entry', who, reason: 'already entered' });
        continue;
      }

      if (commit) {
        competition.registeredTeams.push({
          team: team._id,
          coach: coach._id,
          players: [],
          isSubmitted: entry.isSubmitted === true,
          submittedAt: entry.isSubmitted === true ? new Date() : undefined,
          paymentStatus: entry.paymentStatus || 'pending',
        });
        await competition.save();
      }

      result.created.push({ what: 'Entry', who, detail: label });
    } catch (error) {
      result.failed.push({ what: 'Entry', who, error: error.message });
    }
  }

  return result;
}

/**
 * Phase 6 — who is in each squad, in which age group, on what apparatus.
 *
 * This is the phase that decides what a judge sees. A team can be entered and
 * still show up as "no eligible players" on every panel, because eligibility is
 * this row — gender, age group and apparatus — not team membership.
 *
 * @param {Object[]} squads
 * @param {boolean} commit
 * @param {ReturnType<typeof planFrom>} plan
 */
async function seedSquads(squads, commit, plan) {
  const result = tally();

  for (const member of squads) {
    const label = competitionLabel(member.competition);
    const who = member.playerEmail;
    const detail = `${member.teamName} · ${member.gender} ${member.ageGroup}`;
    const planned = !commit
      && plan.entries.has(`${member.teamName}@${label}`)
      && plan.players.has(String(member.playerEmail).toLowerCase());

    try {
      const competition = await findCompetition(member.competition);
      const { team } = await resolveTeam(member.teamName);
      const player = await Player.findOne({ email: String(member.playerEmail).toLowerCase() });

      const entry = competition && team
        ? (competition.registeredTeams || []).find((rt) => String(rt.team) === String(team._id))
        : null;

      if (!entry || !player) {
        if (planned) {
          result.created.push({ what: 'Squad', who, detail });
          continue;
        }
        result.failed.push({
          what: 'Squad',
          who,
          error: !player
            ? `no player ${who} — seed the accounts first (drop --role=player)`
            : `${member.teamName} is not entered in "${label}" — run the entries phase first`,
        });
        continue;
      }

      if ((entry.players || []).some((p) => String(p.player) === String(player._id))) {
        result.skipped.push({ what: 'Squad', who, reason: `already in ${detail}` });
        continue;
      }

      if (commit) {
        entry.players.push({
          player: player._id,
          ageGroup: member.ageGroup,
          gender: member.gender,
          apparatus: member.apparatus ?? {},
        });
        await competition.save();
      }

      result.created.push({ what: 'Squad', who, detail });
    } catch (error) {
      result.failed.push({ what: 'Squad', who, error: error.message });
    }
  }

  return result;
}

/**
 * Phase 7 — the judging panels.
 *
 * A seat is not a login (see models/Judge.js): this writes the slot and points
 * it at an account, and it is the only thing standing between a registered
 * judge and an empty dashboard. Nothing else in the seed can produce it — a
 * judge cannot seat themselves, and the admin screen refuses to re-seat a panel
 * that already exists.
 *
 * `judgeEmail: null` is replayed as an empty slot rather than skipped. A panel
 * with a hole in it is a real state, and one worth being able to reproduce.
 *
 * @param {Object[]} panels
 * @param {boolean} commit
 * @param {ReturnType<typeof planFrom>} plan
 */
async function seedPanels(panels, commit, plan) {
  const result = tally();

  for (const seat of panels) {
    const label = competitionLabel(seat.competition);
    const who = `${seat.judgeType} · ${seat.gender} ${seat.ageGroup}`;
    const email = seat.judgeEmail ? String(seat.judgeEmail).toLowerCase() : null;
    const planned = !commit
      && plan.competitions.has(label)
      && (!email || plan.judges.has(email));

    try {
      const competition = await findCompetition(seat.competition);
      const account = email ? await JudgeAccount.findOne({ email }) : null;

      if (!competition || (email && !account)) {
        if (planned) {
          result.created.push({ what: 'Seat', who, detail: email || 'empty slot' });
          continue;
        }
        result.failed.push({
          what: 'Seat',
          who,
          error: !competition
            ? `no competition "${label}" — run the competitions phase first`
            : `no judge ${email} — seed the accounts first (drop --role=judge)`,
        });
        continue;
      }

      // The slot's identity, and the unique index Judge.js declares on it.
      const slot = {
        competition: competition._id,
        gender: seat.gender,
        ageGroup: seat.ageGroup,
        judgeNo: seat.judgeNo,
      };
      if (await Judge.findOne(slot)) {
        result.skipped.push({ what: 'Seat', who, reason: 'slot already filled' });
        continue;
      }

      if (commit) {
        await Judge.create({
          ...slot,
          competitionTypes: seat.competitionTypes || [],
          apparatus: seat.apparatus ?? null,
          judgeType: seat.judgeType,
          judgeAccount: account?._id || null,
          // Mirrors the admin path: a slot is active once somebody fills it.
          isActive: !!account,
        });
      }

      result.created.push({ what: 'Seat', who, detail: email || 'empty slot' });
    } catch (error) {
      result.failed.push({ what: 'Seat', who, error: error.message });
    }
  }

  return result;
}

/** Print one phase, skipping the empty tables. */
function report(heading, result, commit) {
  if (result.created.length + result.skipped.length + result.failed.length === 0) return;

  console.log(`\n── ${heading} ──`);
  if (result.skipped.length > 0) {
    console.log('Skipped:');
    console.table(result.skipped);
  }
  if (result.created.length > 0) {
    console.log(commit ? 'Created:' : 'Would create:');
    console.table(result.created);
  }
  if (result.failed.length > 0) {
    console.log('Failed:');
    console.table(result.failed);
  }
}

async function seedAccounts() {
  const { commit, roles, file } = parseArgs(process.argv.slice(2));

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found. Check Server/.env');
    process.exit(1);
  }

  if (!fs.existsSync(file)) {
    console.error(`❌ No capture at ${file}`);
    console.error('   Register through the UI first — that run is what produces it:');
    console.error('     npm --prefix Web run seed:ui');
    console.error('   (or point at an existing capture with --file=<path>)');
    process.exit(1);
  }

  const capture = JSON.parse(fs.readFileSync(file, 'utf8'));
  const registrations = (capture.registrations || []).filter((r) => roles.includes(r.role));

  // Teams belong to the coach phase and memberships to the player phase, so
  // `--role=judge` does not quietly rebuild a team roster nobody asked for.
  const teams = roles.includes('coach') ? capture.teams || [] : [];
  const memberships = roles.includes('player') ? capture.memberships || [] : [];

  // The four competition phases travel together — a squad with no entry and an
  // entry with no meet are both nothing — so they are one switch, not four.
  const wantsEnvironment = roles.includes(ENVIRONMENT);
  const competitions = wantsEnvironment ? capture.competitions || [] : [];
  const entries = wantsEnvironment ? capture.entries || [] : [];
  const squads = wantsEnvironment ? capture.squads || [] : [];
  const panels = wantsEnvironment ? capture.panels || [] : [];

  const rows = registrations.length + teams.length + memberships.length
    + competitions.length + entries.length + squads.length + panels.length;
  if (rows === 0) {
    console.error(`❌ ${file} holds nothing for: ${roles.join(', ')}`);
    process.exit(1);
  }

  console.log(`📄 ${path.basename(file)} — captured ${capture.capturedAt || 'at an unknown time'}`);
  console.log(
    `   ${registrations.length} registration(s), ${teams.length} team(s), ` +
    `${memberships.length} membership(s), ${competitions.length} competition(s), ` +
    `${entries.length} entr(ies), ${squads.length} squad place(s), ${panels.length} seat(s) ` +
    `for: ${roles.join(', ')}`
  );

  /*
   * A capture made before teams and memberships were recorded replays as
   * accounts only, and the result — coaches with no team, players with no
   * squad — looks like a successful seed. Say so up front rather than leaving
   * it to be discovered in the app.
   */
  if (roles.includes('coach') && teams.length === 0) {
    console.log('\n⚠️  No teams in this capture. The coaches will be created with no team,');
    console.log('   which parks them on /coach/create-team and leaves players nothing to join.');
    console.log('   Re-record with: npm --prefix Web run seed:ui');
  }

  /*
   * The same trap one level up. A capture made before the competition sections
   * existed replays as people and nothing to compete in: no meet, no entries,
   * no panels — so a judge signs in to an empty dashboard and the seed looks
   * like it worked.
   */
  if (wantsEnvironment && competitions.length === 0) {
    console.log('\n⚠️  No competition in this capture. Accounts and teams will be restored,');
    console.log('   but there will be nothing to enter, nobody seated on a panel, and every');
    console.log('   judge dashboard will be empty.');
    console.log('   Record it from a working database with: npm --prefix Server run seed:capture');
  }

  console.log('\n🔗 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connected${commit ? '' : ' — DRY RUN, nothing will be written'}`);

  // Strictly ordered: a team needs its coach, a membership needs its team. A
  // dry run writes nothing, so the later phases consult `plan` — the capture —
  // for the dependencies the accounts phase would have created.
  const plan = planFrom(capture);
  const phases = [
    ['Accounts', await seedRegistrations(registrations, commit)],
    ['Teams', await seedTeams(teams, commit, plan)],
    ['Memberships', await seedMemberships(memberships, commit, plan)],
    ['Competitions', await seedCompetitions(competitions, commit)],
    ['Entries', await seedEntries(entries, commit, plan)],
    ['Squads', await seedSquads(squads, commit, plan)],
    ['Panels', await seedPanels(panels, commit, plan)],
  ];

  for (const [heading, result] of phases) report(heading, result, commit);

  const total = (key) => phases.reduce((sum, [, result]) => sum + result[key].length, 0);
  const [created, skipped, failed] = [total('created'), total('skipped'), total('failed')];

  console.log(
    `\n${created} ${commit ? 'created' : 'to create'}, ${skipped} skipped, ${failed} failed.`
  );
  if (!commit && created > 0) console.log('Re-run with --commit to write them.');

  await mongoose.disconnect();
  // A dry run reports; only a real one fails the shell.
  process.exit(commit && failed > 0 ? 1 : 0);
}

seedAccounts().catch(async (error) => {
  console.error('❌ Seeding failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
