import { apparatusFor, apparatusKey, apparatusToJudge, entryGender } from '@/utils/scoring/apparatus';
import { ageMatches } from '@/hooks/useAgeGroups';

/**
 * The rows of the Scorer's sheet: one per (athlete, apparatus).
 *
 * ONE ROW PER APPARATUS, NOT PER ATHLETE. Somebody entered for Pole, Hanging
 * and Rope performs three times and earns three separate scores, each with its
 * own time and its own deductions. A single row per athlete could only ever
 * hold one of them, and whichever was typed last would be the one that reached
 * the database. So `id` is the row's identity — athlete AND apparatus — and the
 * athlete's own id travels beside it for the payload.
 *
 * NARROWED TO THE SEAT'S APPARATUS. A panel is seated for one apparatus and the
 * Scorer sits with that panel, so that is the only apparatus they can record.
 * The sheet used to list all three, which put marks belonging to panels that
 * were not sitting — under columns headed with THEIR judges — in front of a
 * Scorer with no way to enter them. An athlete not entered for this apparatus
 * drops out entirely rather than appearing with inputs that cannot be used.
 *
 * `apparatus` is optional because sessions stored before the picker existed
 * have none; without it the old unnarrowed behaviour stands.
 *
 * Extracted from ScorerScoring.jsx so the narrowing can be tested without
 * mounting the screen and its socket.
 *
 * @param {Object} args
 * @param {Object} args.team - the squad, with `players`, `_id` and `name`
 * @param {string} args.gender
 * @param {string} args.ageGroup
 * @param {string} [args.competitionType] - slug, e.g. `competition_1`
 * @param {string} [args.apparatus] - the Scorer's seat; unset means all
 * @returns {Array<Object>} rows, in squad order
 */
export function buildScorerRows({ team, gender, ageGroup, competitionType, apparatus }) {
  const wanted = apparatus ? apparatusKey(apparatus) : null;

  return (team?.players || [])
    .filter((pe) => entryGender(pe) === gender && ageMatches(pe.ageGroup, ageGroup))
    .flatMap((pe) => {
      const entered = apparatusFor(pe, competitionType);
      // An athlete with no apparatus recorded still gets one row, judged on
      // whatever the slip falls back to.
      const all = entered.length > 0 ? entered : [apparatusToJudge(null, pe, competitionType)];
      const shown = wanted ? all.filter((a) => apparatusKey(a) === wanted) : all;

      return shown.map((name) => ({
        id: `${pe.player._id}::${apparatusKey(name)}`,
        playerId: pe.player._id,
        apparatus: name,
        name: `${pe.player.firstName} ${pe.player.lastName}`,
        /*
         * Keyed off what the athlete ENTERED, not off what is on screen. Once
         * the sheet is narrowed every row holds one apparatus, so a check on
         * the visible list would drop the suffix from all of them — and an
         * athlete who also performs on Rope and Hanging would give no sign of
         * which of their three sheets this is.
         */
        teamName: all.length > 1 ? `${team.name} · ${name}` : team.name,
        gender: pe.player.gender,
        ageGroup: pe.ageGroup,
        teamId: team._id,
      }));
    });
}

export default buildScorerRows;
