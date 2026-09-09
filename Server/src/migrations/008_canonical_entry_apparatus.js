/**
 * 008 — one shape for `registeredTeams[].players[].apparatus`.
 *
 * The field is `Schema.Types.Mixed` and three shapes accumulated in it:
 *
 *   'Pole Mallakhamb'                            a bare string (oldest)
 *   ['Pole Mallakhamb', 'Rope Mallakhamb']       a flat list
 *   { competition_1: ['Pole Mallakhamb'], ... }  per competition type
 *
 * That was not just history. Two live clients disagreed: `CoachDashboard.jsx`
 * posts the flat list, the superadmin's `AddPlayerForm.jsx` posts the object,
 * and `coach.service` defaulted an absent value to `{}` while `coach.routes`
 * validated it as an array. Reading was unified into
 * `utils/data/apparatus.util`; writing was not, so the ambiguity kept growing.
 *
 * The object wins because it is the only shape that can say what the rest of the
 * domain already models: `Competition.apparatusConfig` is a Map of competition
 * type to apparatus, and COP makes Competition III apparatus-specific. An
 * athlete on Pole in Competition I and Rope in Competition III is
 * `['Pole','Rope']` in the array form, and `apparatusList(array, type)` ignores
 * the type and returns both — putting that athlete on a roster they are not
 * entered in.
 *
 * WHY THIS CHANGES NO FEE AND NO ROSTER
 *
 * A string or list carries no category, so it is spread across the meet's own
 * `competitionTypes`. That is exactly what the reader already did with those
 * shapes — asked about one type, it ignored the type and returned the whole
 * list. `calculatePlayerFee` reads with no type and de-duplicates through a Set,
 * so flattening the object back out gives the identical set of apparatus and the
 * identical amount. This migration is a change of ENCODING, not of meaning.
 *
 * ONE THING IT DOES CHANGE, ON PURPOSE
 *
 * An object keyed by DISPLAY name — `{'Competition I': ['Rope Mallakhamb']}` —
 * was charged for and invisible at the same time. `calculatePlayerFee` flattens
 * every value and so billed the athlete for Rope, while every per-type roster
 * read looks the slug up as a key, missed it, and returned nothing. That
 * athlete paid for an apparatus no panel would ever see them on. Rewriting the
 * key to `competition_1` is the repair.
 *
 * Idempotent: rows already canonical are skipped, so re-running is a no-op.
 * Irreversible by design — see `down()`.
 */

const Competition = require('../../models/Competition');
const {
  toCanonicalApparatus,
  isCanonicalApparatus,
} = require('../utils/data/apparatus.util');

async function up() {
  const competitions = await Competition.find({ 'registeredTeams.0': { $exists: true } })
    .select('_id competitionTypes registeredTeams')
    .lean();

  let entriesRewritten = 0;
  let competitionsTouched = 0;

  for (const competition of competitions) {
    const updates = {};

    (competition.registeredTeams || []).forEach((registration, teamIndex) => {
      (registration.players || []).forEach((entry, playerIndex) => {
        if (isCanonicalApparatus(entry.apparatus)) return;

        const canonical = toCanonicalApparatus(entry.apparatus, competition.competitionTypes);
        updates[`registeredTeams.${teamIndex}.players.${playerIndex}.apparatus`] = canonical;
        entriesRewritten += 1;
      });
    });

    if (Object.keys(updates).length === 0) continue;

    /*
     * Positional paths are safe HERE and nowhere else in this codebase.
     *
     * The rule established in `competition.repository.js` is that registration
     * writes are addressed BY TEAM, because the array shifts under concurrent
     * withdrawals. A migration runs against a database nobody is using — that
     * is the whole point of a migration window — and it needs to rewrite a
     * nested array element that arrayFilters cannot address by identity,
     * because a player entry has no id of its own. The indices come from the
     * document read one statement earlier and are used immediately.
     */
    await Competition.collection.updateOne(
      { _id: competition._id },
      { $set: updates }
    );
    competitionsTouched += 1;
  }

  console.log(
    `  Entry apparatus: ${entriesRewritten} entr${entriesRewritten === 1 ? 'y' : 'ies'} `
    + `rewritten across ${competitionsTouched} competition(s).`
  );
}

/**
 * Not reversible, and deliberately not faked.
 *
 * Rolling back would mean choosing an arbitrary pre-image: a canonical object
 * with the same list under every type could have come from a string, a list, or
 * an object written that way on purpose, and there is no record of which. The
 * canonical shape is a strict superset of what the other two could express and
 * every reader still understands it, so there is nothing to undo — leaving the
 * data alone is the correct rollback.
 */
async function down() {
  console.log('  Entry apparatus: nothing to roll back — the canonical shape is read by every consumer.');
}

module.exports = { up, down };
